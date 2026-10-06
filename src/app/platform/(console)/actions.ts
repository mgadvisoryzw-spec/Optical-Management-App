"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashPassword, requirePlatformOwner } from "@/lib/auth";
import { activateInvoice, changePlan, createSubscriptionInvoice, grantSubscription } from "@/lib/billing";
import { logPlatformAction } from "@/lib/platform";
import { addDays, money, num, optStr, str } from "@/lib/utils";

const CYCLES = ["MONTHLY", "YEARLY"] as const;
type Cycle = (typeof CYCLES)[number];
const cycleOf = (v: FormDataEntryValue | null): Cycle => (str(v) === "YEARLY" ? "YEARLY" : "MONTHLY");

async function owner() {
  const u = await requirePlatformOwner();
  return { id: u.id, name: u.name };
}

function refresh(orgId?: string) {
  revalidatePath("/platform");
  revalidatePath("/platform/clients");
  revalidatePath("/platform/billing");
  revalidatePath("/platform/activity");
  if (orgId) revalidatePath(`/platform/clients/${orgId}`);
}

/** Confirms that a client's payment landed and switches their subscription on. */
export async function approvePayment(invoiceId: string, fd: FormData) {
  const actor = await owner();
  const inv = await db.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { organization: true } });
  if (inv.status !== "OPEN") redirect("/platform/billing?error=" + encodeURIComponent(`Invoice ${inv.number} is already ${inv.status.toLowerCase()}.`));
  const method = str(fd.get("method")) || "BANK";
  const reference = optStr(fd.get("reference")) ?? undefined;
  await activateInvoice(inv.id, method, reference, { byId: actor.id, notes: optStr(fd.get("notes")) ?? undefined });
  await logPlatformAction({
    actor,
    action: "APPROVE_PAYMENT",
    org: inv.organization,
    detail: `Approved ${inv.number} — ${inv.planCode} ${inv.cycle.toLowerCase()}, ${money(inv.amount)} via ${method}${reference ? ` (ref ${reference})` : ""}`,
  });
  refresh(inv.orgId);
  redirect(`/platform/clients/${inv.orgId}?done=` + encodeURIComponent(`${inv.organization.name} is active. Invoice ${inv.number} marked paid.`));
}

/** Raises an invoice the client can pay — used when chasing a renewal. */
export async function raiseInvoice(orgId: string, fd: FormData) {
  const actor = await owner();
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, include: { plan: true } });
  const planCode = str(fd.get("planCode")) || org.plan?.code || "PRACTICE";
  const cycle = cycleOf(fd.get("cycle"));
  const inv = await createSubscriptionInvoice(orgId, planCode, cycle);
  await logPlatformAction({ actor, action: "NOTE", org, detail: `Raised invoice ${inv.number} for ${planCode} ${cycle.toLowerCase()} (${money(inv.amount)}) — awaiting payment` });
  refresh(orgId);
  redirect(`/platform/clients/${orgId}?done=` + encodeURIComponent(`Invoice ${inv.number} raised for ${money(inv.amount)}. It now shows in the approvals queue.`));
}

/**
 * Grants paid access for a term. This is the main lever: the client has paid
 * MG Advisory outside the app, so we record a paid invoice and open the plan.
 */
export async function grantAccess(orgId: string, fd: FormData) {
  const actor = await owner();
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, include: { plan: true } });
  const planCode = str(fd.get("planCode")) || org.plan?.code || "PRACTICE";
  const months = Math.max(1, Math.min(60, num(fd.get("months"), 12)));
  const cycle: Cycle = months >= 12 ? "YEARLY" : "MONTHLY";
  const amountRaw = num(fd.get("amount"), -1);
  const inv = await grantSubscription({
    orgId,
    planCode,
    cycle,
    months,
    method: str(fd.get("method")) || "MANUAL",
    reference: optStr(fd.get("reference")) ?? undefined,
    amount: amountRaw >= 0 ? amountRaw : undefined,
    approvedById: actor.id,
    notes: optStr(fd.get("notes")) ?? undefined,
    startNow: str(fd.get("startNow")) === "on",
  });
  await logPlatformAction({
    actor,
    action: "GRANT_SUBSCRIPTION",
    org,
    detail: `Granted ${planCode} for ${months} month${months === 1 ? "" : "s"} — ${money(inv.amount)}, invoice ${inv.number}, paid access to ${inv.periodEnd.toISOString().slice(0, 10)}`,
  });
  refresh(orgId);
  redirect(`/platform/clients/${orgId}?done=` + encodeURIComponent(`${org.name} now has ${months} month${months === 1 ? "" : "s"} of paid access on the ${planCode} plan.`));
}

export async function switchPlan(orgId: string, fd: FormData) {
  const actor = await owner();
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, include: { plan: true } });
  const planCode = str(fd.get("planCode"));
  if (!planCode) return;
  const plan = await changePlan(orgId, planCode);
  await logPlatformAction({ actor, action: "CHANGE_PLAN", org, detail: `${org.plan?.name ?? "No plan"} → ${plan.name}` });
  refresh(orgId);
}

export async function extendTrial(orgId: string, fd: FormData) {
  const actor = await owner();
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  const days = Math.max(1, Math.min(180, num(fd.get("days"), 14)));
  const base = org.trialEndsAt && org.trialEndsAt > new Date() ? org.trialEndsAt : new Date();
  await db.organization.update({
    where: { id: orgId },
    data: { trialEndsAt: addDays(base, days), subscriptionStatus: "TRIALING", suspendedAt: null },
  });
  await logPlatformAction({ actor, action: "EXTEND_TRIAL", org, detail: `Trial extended by ${days} days` });
  refresh(orgId);
}

export async function setSuspended(orgId: string, suspend: boolean) {
  const actor = await owner();
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  await db.organization.update({
    where: { id: orgId },
    data: suspend
      ? { suspendedAt: new Date(), subscriptionStatus: "CANCELLED" }
      : { suspendedAt: null, subscriptionStatus: org.currentPeriodEnd && org.currentPeriodEnd > new Date() ? "ACTIVE" : "TRIALING" },
  });
  await logPlatformAction({ actor, action: suspend ? "SUSPEND" : "REACTIVATE", org });
  refresh(orgId);
}

export async function voidInvoice(invoiceId: string) {
  const actor = await owner();
  const inv = await db.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { organization: true } });
  if (inv.status === "PAID") return;
  await db.subscriptionInvoice.update({ where: { id: invoiceId }, data: { status: "VOID" } });
  await logPlatformAction({ actor, action: "VOID_INVOICE", org: inv.organization, detail: `Voided ${inv.number}` });
  refresh(inv.orgId);
}

export async function saveClientNotes(orgId: string, fd: FormData) {
  const actor = await owner();
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  await db.organization.update({
    where: { id: orgId },
    data: { platformNotes: optStr(fd.get("platformNotes")), accountManager: optStr(fd.get("accountManager")) },
  });
  await logPlatformAction({ actor, action: "UPDATE_CLIENT", org, detail: "Account notes updated" });
  refresh(orgId);
}

export async function savePlanPricing(planId: string, fd: FormData) {
  const actor = await owner();
  const plan = await db.plan.findUniqueOrThrow({ where: { id: planId } });
  const next = {
    name: str(fd.get("name")) || plan.name,
    tagline: str(fd.get("tagline")) || plan.tagline,
    priceMonthlyUsd: num(fd.get("priceMonthlyUsd"), plan.priceMonthlyUsd),
    priceYearlyUsd: num(fd.get("priceYearlyUsd"), plan.priceYearlyUsd),
    maxBranches: Math.max(0, num(fd.get("maxBranches"), plan.maxBranches)),
    maxUsers: Math.max(0, num(fd.get("maxUsers"), plan.maxUsers)),
    monthlyMessages: Math.max(0, num(fd.get("monthlyMessages"), plan.monthlyMessages)),
  };
  await db.plan.update({ where: { id: planId }, data: next });
  await logPlatformAction({
    actor,
    action: "UPDATE_PLAN_PRICING",
    detail: `${plan.code}: ${money(plan.priceMonthlyUsd)}/mo → ${money(next.priceMonthlyUsd)}/mo, ${money(plan.priceYearlyUsd)}/yr → ${money(next.priceYearlyUsd)}/yr, limits ${next.maxBranches || "∞"} branches / ${next.maxUsers || "∞"} users`,
  });
  revalidatePath("/platform/plans");
  revalidatePath("/platform/activity");
  revalidatePath("/app/billing");
}

/** Lets MG Advisory reset a practice user's password when they are locked out. */
export async function resetClientUserPassword(orgId: string, fd: FormData) {
  const actor = await owner();
  const userId = str(fd.get("userId"));
  const user = await db.user.findFirstOrThrow({ where: { id: userId, orgId }, include: { organization: true } });
  if (user.isSuperAdmin) return;
  const password = str(fd.get("password"));
  if (password.length < 8) redirect(`/platform/clients/${orgId}?error=` + encodeURIComponent("The new password must be at least 8 characters."));
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } });
  await logPlatformAction({ actor, action: "UPDATE_CLIENT", org: user.organization, detail: `Password reset for ${user.name} (${user.email})` });
  refresh(orgId);
  redirect(`/platform/clients/${orgId}?done=` + encodeURIComponent(`Password reset for ${user.name}. Share it with them over a secure channel.`));
}

/** The platform owner changing their own console password. */
export async function changeOwnerPassword(fd: FormData) {
  const actor = await owner();
  const password = str(fd.get("password"));
  if (password.length < 10) redirect("/platform/activity?error=" + encodeURIComponent("Use at least 10 characters for the platform owner password."));
  await db.user.update({ where: { id: actor.id }, data: { passwordHash: await hashPassword(password) } });
  await logPlatformAction({ actor, action: "NOTE", detail: "Platform owner password changed" });
  redirect("/platform/activity?done=" + encodeURIComponent("Your console password has been changed."));
}
