import crypto from "node:crypto";
import { db } from "./db";
import { addMonths } from "./utils";

export function paynowConfigured() {
  return !!(process.env.PAYNOW_INTEGRATION_ID && process.env.PAYNOW_INTEGRATION_KEY);
}

/** Next sequential subscription invoice number, e.g. OV-2026-00014. */
async function nextInvoiceNumber() {
  const year = new Date().getFullYear();
  const count = await db.subscriptionInvoice.count();
  let n = count + 1;
  // Guard against collisions if invoices were created out of band.
  for (let i = 0; i < 50; i++) {
    const number = `OV-${year}-${String(n).padStart(5, "0")}`;
    if (!(await db.subscriptionInvoice.findUnique({ where: { number } }))) return number;
    n++;
  }
  return `OV-${year}-${Date.now()}`;
}

export async function createSubscriptionInvoice(orgId: string, planCode: string, cycle: "MONTHLY" | "YEARLY") {
  const plan = await db.plan.findUniqueOrThrow({ where: { code: planCode } });
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  const start = org.currentPeriodEnd && org.currentPeriodEnd > new Date() ? org.currentPeriodEnd : new Date();
  const end = addMonths(start, cycle === "YEARLY" ? 12 : 1);
  return db.subscriptionInvoice.create({
    data: {
      orgId,
      number: await nextInvoiceNumber(),
      planCode,
      cycle,
      amount: cycle === "YEARLY" ? plan.priceYearlyUsd : plan.priceMonthlyUsd,
      periodStart: start,
      periodEnd: end,
    },
  });
}

/**
 * Marks a subscription invoice paid and extends the tenant's subscription. Idempotent.
 * `approval` records which MG Advisory user confirmed the payment.
 */
export async function activateInvoice(
  invoiceId: string,
  method: string,
  reference?: string,
  approval?: { byId?: string; notes?: string },
) {
  const inv = await db.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (inv.status === "PAID") return inv;
  const plan = await db.plan.findUniqueOrThrow({ where: { code: inv.planCode } });
  // A renewal approved after the old period lapsed should still run a full term from today.
  const now = new Date();
  const periodEnd = inv.periodEnd > now ? inv.periodEnd : addMonths(now, inv.cycle === "YEARLY" ? 12 : 1);
  await db.organization.update({
    where: { id: inv.orgId },
    data: { planId: plan.id, billingCycle: inv.cycle, subscriptionStatus: "ACTIVE", currentPeriodEnd: periodEnd, suspendedAt: null },
  });
  return db.subscriptionInvoice.update({
    where: { id: inv.id },
    data: {
      status: "PAID",
      paidAt: now,
      method,
      reference,
      periodEnd,
      approvedById: approval?.byId ?? null,
      approvedAt: approval?.byId ? now : null,
      notes: approval?.notes ?? inv.notes,
    },
  });
}

/**
 * Platform-owner shortcut: raise a subscription invoice for a client, mark it paid and
 * activate the plan in one step. Used when MG Advisory has received payment outside the
 * app (bank transfer, EcoCash, cash) and is granting access for the term.
 */
export async function grantSubscription(args: {
  orgId: string;
  planCode: string;
  cycle: "MONTHLY" | "YEARLY";
  /** Number of months of access to grant. Defaults to the cycle length (1 or 12). */
  months?: number;
  method?: string;
  reference?: string;
  amount?: number;
  approvedById?: string;
  notes?: string;
  /** Start the term from today rather than from the end of the current period. */
  startNow?: boolean;
}) {
  const plan = await db.plan.findUniqueOrThrow({ where: { code: args.planCode } });
  const org = await db.organization.findUniqueOrThrow({ where: { id: args.orgId } });
  const months = args.months ?? (args.cycle === "YEARLY" ? 12 : 1);
  const now = new Date();
  const start = !args.startNow && org.currentPeriodEnd && org.currentPeriodEnd > now ? org.currentPeriodEnd : now;
  const end = addMonths(start, months);
  const inv = await db.subscriptionInvoice.create({
    data: {
      orgId: args.orgId,
      number: await nextInvoiceNumber(),
      planCode: plan.code,
      cycle: args.cycle,
      amount: args.amount ?? (args.cycle === "YEARLY" ? plan.priceYearlyUsd : plan.priceMonthlyUsd),
      status: "PAID",
      method: args.method ?? "MANUAL",
      reference: args.reference,
      periodStart: start,
      periodEnd: end,
      paidAt: now,
      approvedById: args.approvedById,
      approvedAt: args.approvedById ? now : null,
      notes: args.notes,
    },
  });
  await db.organization.update({
    where: { id: args.orgId },
    data: { planId: plan.id, billingCycle: args.cycle, subscriptionStatus: "ACTIVE", currentPeriodEnd: end, suspendedAt: null },
  });
  return inv;
}

/** Moves a client onto a different plan without touching their paid-up period. */
export async function changePlan(orgId: string, planCode: string) {
  const plan = await db.plan.findUniqueOrThrow({ where: { code: planCode } });
  await db.organization.update({ where: { id: orgId }, data: { planId: plan.id } });
  return plan;
}

// ───────────── Paynow (Zimbabwe: EcoCash, OneMoney, Visa/Mastercard, ZIMSWITCH) ─────────────

function paynowHash(values: Record<string, string>, key: string) {
  const concat = Object.entries(values)
    .filter(([k]) => k.toLowerCase() !== "hash")
    .map(([, v]) => v)
    .join("");
  return crypto.createHash("sha512").update(concat + key, "utf8").digest("hex").toUpperCase();
}

export async function paynowInitiate(args: { invoiceId: string; number: string; amount: number; email: string; appUrl: string }) {
  const id = process.env.PAYNOW_INTEGRATION_ID!;
  const key = process.env.PAYNOW_INTEGRATION_KEY!;
  const values: Record<string, string> = {
    id,
    reference: args.number,
    amount: args.amount.toFixed(2),
    additionalinfo: `OptiVault subscription ${args.number}`,
    returnurl: `${args.appUrl}/app/billing?invoice=${args.invoiceId}`,
    resulturl: `${args.appUrl}/api/billing/paynow`,
    authemail: args.email,
    status: "Message",
  };
  values.hash = paynowHash(values, key);
  const res = await fetch("https://www.paynow.co.zw/interface/initiatetransaction", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values),
  });
  const parsed = Object.fromEntries(new URLSearchParams(await res.text()));
  if (parsed.status?.toLowerCase() !== "ok") throw new Error(parsed.error ?? "Paynow rejected the request");
  if (parsed.hash && paynowHash(parsed, key) !== parsed.hash) throw new Error("Paynow response failed verification");
  await db.subscriptionInvoice.update({ where: { id: args.invoiceId }, data: { reference: parsed.pollurl, method: "PAYNOW" } });
  return parsed.browserurl as string;
}

/** Handles Paynow's server-to-server status update. */
export async function paynowResult(body: Record<string, string>) {
  const key = process.env.PAYNOW_INTEGRATION_KEY;
  if (!key || paynowHash(body, key) !== body.hash) return false;
  const inv = await db.subscriptionInvoice.findUnique({ where: { number: body.reference } });
  if (!inv) return false;
  if (["paid", "awaiting delivery", "delivered"].includes((body.status ?? "").toLowerCase())) {
    await activateInvoice(inv.id, "PAYNOW", body.paynowreference);
  }
  return true;
}
