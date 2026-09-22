import crypto from "node:crypto";
import { db } from "./db";
import { addMonths } from "./utils";

export function paynowConfigured() {
  return !!(process.env.PAYNOW_INTEGRATION_ID && process.env.PAYNOW_INTEGRATION_KEY);
}

export async function createSubscriptionInvoice(orgId: string, planCode: string, cycle: "MONTHLY" | "YEARLY") {
  const plan = await db.plan.findUniqueOrThrow({ where: { code: planCode } });
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  const start = org.currentPeriodEnd && org.currentPeriodEnd > new Date() ? org.currentPeriodEnd : new Date();
  const end = addMonths(start, cycle === "YEARLY" ? 12 : 1);
  const count = await db.subscriptionInvoice.count();
  return db.subscriptionInvoice.create({
    data: {
      orgId,
      number: `OV-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`,
      planCode,
      cycle,
      amount: cycle === "YEARLY" ? plan.priceYearlyUsd : plan.priceMonthlyUsd,
      periodStart: start,
      periodEnd: end,
    },
  });
}

/** Marks a subscription invoice paid and extends the tenant's subscription. Idempotent. */
export async function activateInvoice(invoiceId: string, method: string, reference?: string) {
  const inv = await db.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (inv.status === "PAID") return inv;
  const plan = await db.plan.findUniqueOrThrow({ where: { code: inv.planCode } });
  await db.organization.update({
    where: { id: inv.orgId },
    data: { planId: plan.id, billingCycle: inv.cycle, subscriptionStatus: "ACTIVE", currentPeriodEnd: inv.periodEnd },
  });
  return db.subscriptionInvoice.update({ where: { id: inv.id }, data: { status: "PAID", paidAt: new Date(), method, reference } });
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
