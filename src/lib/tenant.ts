import { db } from "./db";
import { DEFAULT_ACCOUNTS } from "./chart-of-accounts";
import { DEFAULT_TEMPLATES } from "./messaging";
import { addDays, slugify } from "./utils";

export const TRIAL_DAYS = 14;

export const DEFAULT_MEDICAL_AIDS = [
  { name: "PSMAS", code: "PSMAS", requiresPreAuth: true },
  { name: "CIMAS", code: "CIMAS", requiresPreAuth: true },
  { name: "First Mutual Health", code: "FMH", requiresPreAuth: true },
  { name: "Alliance Health", code: "ALLIANCE", requiresPreAuth: true },
  { name: "Bonvie Medical Aid", code: "BONVIE", requiresPreAuth: true },
  { name: "Generation Health", code: "GENHEALTH", requiresPreAuth: true },
];

/** Creates a fully-provisioned tenant: branch, owner, chart of accounts, currencies, templates, medical aids. */
export async function provisionOrganization(input: {
  orgName: string;
  ownerName: string;
  email: string;
  passwordHash: string;
  phone?: string;
  country?: string;
  branchName?: string;
  planCode?: string;
  zwgRate?: number;
}) {
  const plan = await db.plan.findUnique({ where: { code: input.planCode ?? "PRACTICE" } });
  let slug = slugify(input.orgName) || "practice";
  if (await db.organization.findUnique({ where: { slug } })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  return db.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: input.orgName,
        slug,
        email: input.email,
        phone: input.phone,
        country: input.country ?? "Zimbabwe",
        planId: plan?.id,
        subscriptionStatus: "TRIALING",
        trialEndsAt: addDays(new Date(), TRIAL_DAYS),
      },
    });
    const branch = await tx.branch.create({
      data: { orgId: org.id, name: input.branchName || "Main Branch", code: "HQ", phone: input.phone },
    });
    const user = await tx.user.create({
      data: {
        orgId: org.id,
        branchId: branch.id,
        name: input.ownerName,
        email: input.email.toLowerCase(),
        phone: input.phone,
        passwordHash: input.passwordHash,
        role: "OWNER",
      },
    });
    await tx.account.createMany({
      data: DEFAULT_ACCOUNTS.map((a) => ({ orgId: org.id, code: a.code, name: a.name, type: a.type, subtype: a.subtype, system: true })),
    });
    const usd = await tx.currency.create({ data: { orgId: org.id, code: "USD", name: "US Dollar", symbol: "$", rate: 1, isBase: true } });
    const zwg = await tx.currency.create({ data: { orgId: org.id, code: "ZWG", name: "Zimbabwe Gold", symbol: "ZWG", rate: input.zwgRate ?? 26.8 } });
    await tx.exchangeRate.createMany({ data: [{ currencyId: usd.id, rate: 1 }, { currencyId: zwg.id, rate: zwg.rate }] });
    await tx.messageTemplate.createMany({ data: DEFAULT_TEMPLATES.map((t) => ({ orgId: org.id, ...t })) });
    await tx.medicalAid.createMany({ data: DEFAULT_MEDICAL_AIDS.map((m) => ({ orgId: org.id, ...m })) });
    return { org, branch, user };
  });
}
