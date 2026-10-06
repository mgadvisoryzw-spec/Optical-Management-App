import "server-only";
import { db } from "./db";
import { addDays, addMonths, round2 } from "./utils";

/**
 * OptiVault is built and operated by MG Advisory. The platform owner account
 * signs in at /platform and administers every practice (tenant) on the system.
 */
export const VENDOR = {
  name: "MG Advisory",
  product: "OptiVault",
  tagline: "Optical practice management & accounting",
  billingEmail: "mgadvisoryzw@gmail.com",
  supportEmail: "mgadvisoryzw@gmail.com",
};

export const PLATFORM_ACTIONS = {
  APPROVE_PAYMENT: "Payment approved",
  GRANT_SUBSCRIPTION: "Subscription granted",
  CHANGE_PLAN: "Plan changed",
  EXTEND_TRIAL: "Trial extended",
  SUSPEND: "Client suspended",
  REACTIVATE: "Client reactivated",
  VOID_INVOICE: "Invoice voided",
  UPDATE_PLAN_PRICING: "Plan pricing updated",
  UPDATE_CLIENT: "Client record updated",
  NOTE: "Note added",
} as const;
export type PlatformAction = keyof typeof PLATFORM_ACTIONS;

/** Records an action taken by MG Advisory from the platform console. */
export async function logPlatformAction(args: {
  actor: { id: string; name: string };
  action: PlatformAction;
  org?: { id: string; name: string } | null;
  detail?: string;
}) {
  await db.platformAudit.create({
    data: {
      actorId: args.actor.id,
      actorName: args.actor.name,
      orgId: args.org?.id,
      orgName: args.org?.name,
      action: args.action,
      detail: args.detail,
    },
  });
}

export type ClientHealth = {
  /** ACTIVE | TRIAL | EXPIRING | LAPSED | SUSPENDED */
  state: "ACTIVE" | "TRIAL" | "EXPIRING" | "LAPSED" | "SUSPENDED";
  label: string;
  tone: string;
  /** Days until the subscription or trial runs out. Negative when already past. */
  daysLeft: number | null;
  /** True when MG Advisory needs to do something (approve a payment, chase a renewal). */
  needsAttention: boolean;
};

/** How a client stands today, from the platform owner's point of view. */
export function clientHealth(org: {
  subscriptionStatus: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  suspendedAt: Date | null;
}): ClientHealth {
  const now = Date.now();
  const days = (d: Date | null) => (d ? Math.ceil((d.getTime() - now) / 86400000) : null);

  if (org.suspendedAt || org.subscriptionStatus === "CANCELLED") {
    return { state: "SUSPENDED", label: "Suspended", tone: "slate", daysLeft: null, needsAttention: false };
  }
  if (org.subscriptionStatus === "ACTIVE") {
    const left = days(org.currentPeriodEnd);
    if (left === null) return { state: "ACTIVE", label: "Active", tone: "green", daysLeft: null, needsAttention: false };
    if (left < 0) return { state: "LAPSED", label: `Lapsed ${Math.abs(left)}d ago`, tone: "red", daysLeft: left, needsAttention: true };
    if (left <= 30) return { state: "EXPIRING", label: `Renews in ${left}d`, tone: "amber", daysLeft: left, needsAttention: left <= 14 };
    return { state: "ACTIVE", label: "Active", tone: "green", daysLeft: left, needsAttention: false };
  }
  if (org.subscriptionStatus === "TRIALING") {
    const left = days(org.trialEndsAt);
    if (left === null || left < 0) return { state: "LAPSED", label: "Trial ended", tone: "red", daysLeft: left, needsAttention: true };
    return { state: "TRIAL", label: `Trial · ${left}d left`, tone: "brand", daysLeft: left, needsAttention: left <= 3 };
  }
  return { state: "LAPSED", label: org.subscriptionStatus.toLowerCase().replace("_", " "), tone: "red", daysLeft: null, needsAttention: true };
}

/** Monthly value of a client's subscription, in USD. */
export function clientMrr(org: { billingCycle: string; plan: { priceMonthlyUsd: number; priceYearlyUsd: number } | null }) {
  if (!org.plan) return 0;
  return round2(org.billingCycle === "YEARLY" ? org.plan.priceYearlyUsd / 12 : org.plan.priceMonthlyUsd);
}

/** Everything the platform overview needs, in one pass. */
export async function platformSnapshot() {
  const now = new Date();
  const [orgs, openInvoices, paidInvoices, recent] = await Promise.all([
    db.organization.findMany({
      include: { plan: true, _count: { select: { branches: true, users: true, patients: true, orders: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.subscriptionInvoice.findMany({ where: { status: "OPEN" }, include: { organization: { include: { plan: true } } }, orderBy: { createdAt: "asc" } }),
    db.subscriptionInvoice.findMany({ where: { status: "PAID" }, select: { amount: true, paidAt: true, orgId: true } }),
    db.platformAudit.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
  ]);

  const clients = orgs.map((o) => ({ ...o, health: clientHealth(o), mrr: clientMrr(o) }));
  const paying = clients.filter((c) => c.health.state === "ACTIVE" || c.health.state === "EXPIRING");
  const mrr = round2(paying.reduce((s, c) => s + c.mrr, 0));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  return {
    clients,
    openInvoices,
    recent,
    stats: {
      total: clients.length,
      paying: paying.length,
      trials: clients.filter((c) => c.health.state === "TRIAL").length,
      lapsed: clients.filter((c) => c.health.state === "LAPSED").length,
      suspended: clients.filter((c) => c.health.state === "SUSPENDED").length,
      attention: clients.filter((c) => c.health.needsAttention).length + openInvoices.length,
      mrr,
      arr: round2(mrr * 12),
      lifetime: round2(paidInvoices.reduce((s, i) => s + i.amount, 0)),
      thisMonth: round2(paidInvoices.filter((i) => i.paidAt && i.paidAt >= monthStart).reduce((s, i) => s + i.amount, 0)),
      renewalsDue: clients.filter((c) => c.health.state === "EXPIRING" || c.health.state === "LAPSED").length,
      seats: clients.reduce((s, c) => s + c._count.users, 0),
      patients: clients.reduce((s, c) => s + c._count.patients, 0),
    },
  };
}

/** Clients whose subscription or trial runs out within `days`, soonest first. */
export async function upcomingRenewals(days = 45) {
  const horizon = addDays(new Date(), days);
  const orgs = await db.organization.findMany({
    where: {
      suspendedAt: null,
      OR: [
        { subscriptionStatus: "ACTIVE", currentPeriodEnd: { lte: horizon } },
        { subscriptionStatus: "TRIALING", trialEndsAt: { lte: horizon } },
        { subscriptionStatus: { in: ["PAST_DUE"] } },
      ],
    },
    include: { plan: true },
  });
  return orgs
    .map((o) => ({ ...o, health: clientHealth(o), dueOn: o.subscriptionStatus === "TRIALING" ? o.trialEndsAt : o.currentPeriodEnd }))
    .sort((a, b) => (a.dueOn?.getTime() ?? 0) - (b.dueOn?.getTime() ?? 0));
}

/** The period a renewal would cover if approved today. */
export function nextPeriod(org: { currentPeriodEnd: Date | null }, cycle: "MONTHLY" | "YEARLY") {
  const start = org.currentPeriodEnd && org.currentPeriodEnd > new Date() ? org.currentPeriodEnd : new Date();
  return { start, end: addMonths(start, cycle === "YEARLY" ? 12 : 1) };
}
