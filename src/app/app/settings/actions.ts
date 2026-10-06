"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashPassword, requireWrite } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import { num, optStr, str } from "@/lib/utils";

export async function saveOrganization(fd: FormData) {
  const ctx = await requireWrite("settings");
  await db.organization.update({
    where: { id: ctx.orgId },
    data: {
      name: str(fd.get("name")) || ctx.org.name,
      email: optStr(fd.get("email")),
      phone: optStr(fd.get("phone")),
      address: optStr(fd.get("address")),
      taxNumber: optStr(fd.get("taxNumber")),
      vatRate: num(fd.get("vatRate")),
      consultationFee: num(fd.get("consultationFee"), 25),
      recallMonths: num(fd.get("recallMonths"), 24),
      recallLeadDays: num(fd.get("recallLeadDays"), 30),
    },
  });
  revalidatePath("/app", "layout");
}

export async function saveMessaging(fd: FormData) {
  const ctx = await requireWrite("settings");
  await db.organization.update({
    where: { id: ctx.orgId },
    data: { smsProvider: str(fd.get("smsProvider")) || "log", whatsappProvider: str(fd.get("whatsappProvider")) || "link", smsSenderId: optStr(fd.get("smsSenderId")) },
  });
  revalidatePath("/app/settings");
}

export async function addBranch(fd: FormData) {
  const ctx = await requireWrite("settings");
  const max = ctx.org.plan?.maxBranches ?? 1;
  if (max > 0 && ctx.branches.length >= max) redirect(`/app/settings?error=${encodeURIComponent(`Your ${ctx.org.plan?.name ?? "current"} plan allows ${max} branch(es). Upgrade to add more.`)}`);
  await db.branch.create({
    data: { orgId: ctx.orgId, name: str(fd.get("name")), code: str(fd.get("code")).toUpperCase() || `B${ctx.branches.length + 1}`, address: optStr(fd.get("address")), phone: optStr(fd.get("phone")) },
  });
  revalidatePath("/app", "layout");
}

export async function addUser(fd: FormData) {
  const ctx = await requireWrite("settings");
  const count = await db.user.count({ where: { orgId: ctx.orgId, active: true } });
  const max = ctx.org.plan?.maxUsers ?? 3;
  if (max > 0 && count >= max) redirect(`/app/settings/users?error=${encodeURIComponent(`Your plan allows ${max} active users. Upgrade to add more.`)}`);
  const role = str(fd.get("role"));
  if (!ROLES.includes(role as (typeof ROLES)[number]) || (role === "OWNER" && ctx.user.role !== "OWNER")) throw new Error("Invalid role");
  const email = str(fd.get("email")).toLowerCase();
  if (await db.user.findUnique({ where: { email } })) redirect(`/app/settings/users?error=${encodeURIComponent("A user with that email already exists.")}`);
  await db.user.create({
    data: { orgId: ctx.orgId, name: str(fd.get("name")), email, phone: optStr(fd.get("phone")), role, branchId: optStr(fd.get("branchId")), passwordHash: await hashPassword(str(fd.get("password"))) },
  });
  revalidatePath("/app/settings/users");
}

export async function toggleUser(id: string) {
  const ctx = await requireWrite("settings");
  const u = await db.user.findFirstOrThrow({ where: { id, orgId: ctx.orgId } });
  if (u.id === ctx.user.id) return;
  if (u.active && (await lastActiveOwner(ctx.orgId, u))) {
    redirect(`/app/settings/users?error=${encodeURIComponent("You can't deactivate the last active owner. Promote someone else to Owner first.")}`);
  }
  await db.user.update({ where: { id }, data: { active: !u.active } });
  revalidatePath("/app/settings/users");
}

/** True when `user` is the only active OWNER left in the practice. */
async function lastActiveOwner(orgId: string, user: { id: string; role: string }) {
  if (user.role !== "OWNER") return false;
  const others = await db.user.count({ where: { orgId, role: "OWNER", active: true, id: { not: user.id } } });
  return others === 0;
}

/**
 * Edits an existing team member — including the practice administrator or owner.
 * Owners may change anyone; administrators may edit everyone except owners, and
 * cannot hand out the Owner role.
 */
export async function updateUser(id: string, fd: FormData) {
  const ctx = await requireWrite("settings");
  const target = await db.user.findFirstOrThrow({ where: { id, orgId: ctx.orgId } });
  const back = `/app/settings/users/${id}`;
  const fail = (msg: string) => redirect(`${back}?error=${encodeURIComponent(msg)}`);

  const isOwner = ctx.user.role === "OWNER";
  if (target.role === "OWNER" && !isOwner) fail("Only an owner can edit another owner's account.");

  const role = str(fd.get("role"));
  if (!ROLES.includes(role as (typeof ROLES)[number])) fail("Pick a valid role.");
  if (role === "OWNER" && !isOwner) fail("Only an owner can grant the Owner role.");
  if (target.role === "OWNER" && role !== "OWNER" && (await lastActiveOwner(ctx.orgId, target))) {
    fail("This is the last owner. Promote someone else to Owner before changing this role.");
  }

  const email = str(fd.get("email")).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) fail("Enter a valid email address.");
  const clash = await db.user.findUnique({ where: { email } });
  if (clash && clash.id !== id) fail("Another account already uses that email address.");

  const active = str(fd.get("active")) === "on";
  if (!active && target.id === ctx.user.id) fail("You can't deactivate your own account.");
  if (!active && (await lastActiveOwner(ctx.orgId, target))) fail("You can't deactivate the last active owner.");

  // Changing your own role could lock you out of this page, so block it.
  if (target.id === ctx.user.id && role !== target.role) fail("You can't change your own role. Ask another owner to do it.");

  const password = str(fd.get("password"));
  if (password && password.length < 8) fail("A new password must be at least 8 characters long.");

  await db.user.update({
    where: { id },
    data: {
      name: str(fd.get("name")) || target.name,
      email,
      phone: optStr(fd.get("phone")),
      role,
      branchId: optStr(fd.get("branchId")),
      active,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    },
  });
  await db.auditLog.create({
    data: {
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: "UPDATE",
      entity: "User",
      entityId: id,
      detail: `${target.name} (${target.role}) → ${str(fd.get("name"))} (${role})${password ? " · password reset" : ""}${active === target.active ? "" : active ? " · reactivated" : " · deactivated"}`,
    },
  });
  revalidatePath("/app/settings/users");
  revalidatePath("/app", "layout");
  redirect(`/app/settings/users?done=${encodeURIComponent(`${str(fd.get("name")) || target.name} updated.`)}`);
}

export async function saveCurrency(fd: FormData) {
  const ctx = await requireWrite("settings");
  const code = str(fd.get("code")).toUpperCase();
  const rate = num(fd.get("rate"));
  if (!code || rate <= 0) throw new Error("Enter a currency code and a rate above zero");
  const existing = await db.currency.findUnique({ where: { orgId_code: { orgId: ctx.orgId, code } } });
  if (existing?.isBase) return;
  const cur = await db.currency.upsert({
    where: { orgId_code: { orgId: ctx.orgId, code } },
    create: { orgId: ctx.orgId, code, name: str(fd.get("name")) || code, symbol: str(fd.get("symbol")) || code, rate },
    update: { rate, active: true },
  });
  await db.exchangeRate.create({ data: { currencyId: cur.id, rate } });
  revalidatePath("/app/settings");
}

export async function addMedicalAid(fd: FormData) {
  const ctx = await requireWrite("settings");
  await db.medicalAid.create({
    data: { orgId: ctx.orgId, name: str(fd.get("name")), code: optStr(fd.get("code")), phone: optStr(fd.get("phone")), email: optStr(fd.get("email")), paymentTermsDays: num(fd.get("paymentTermsDays"), 30) },
  });
  revalidatePath("/app/settings");
}
