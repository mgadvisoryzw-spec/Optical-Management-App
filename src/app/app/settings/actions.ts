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
  await db.user.update({ where: { id }, data: { active: !u.active } });
  revalidatePath("/app/settings/users");
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
