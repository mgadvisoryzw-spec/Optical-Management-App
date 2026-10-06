/**
 * Grants a client paid access to OptiVault from the command line.
 * The same thing the MG Advisory console does at /platform/clients/<id>, but
 * usable for bootstrapping before anyone has signed in.
 *
 *   npm run grant -- --org "Optical Frames Optometry" --plan PRACTICE --months 12 \
 *     --method BANK --reference "Paid in full" --note "12 months paid upfront"
 *
 * Flags: --org (name, slug or id)  --plan SOLO|PRACTICE|GROUP  --months 1-60
 *        --amount (defaults to the plan's list price)  --method  --reference  --note
 *        --start-now (run the term from today instead of the end of the current period)
 */
import { db } from "../src/lib/db";
import { grantSubscription } from "../src/lib/billing";
import { fmtDate, money } from "../src/lib/utils";

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const needle = arg("org");
  if (!needle) throw new Error('Pass the client with --org "Practice name" (or its slug / id).');

  const org =
    (await db.organization.findFirst({ where: { OR: [{ id: needle }, { slug: needle }, { name: needle }] }, include: { plan: true } })) ??
    (await db.organization.findFirst({ where: { name: { contains: needle, ...(/^postgres/i.test(process.env.DATABASE_URL ?? "") ? { mode: "insensitive" as const } : {}) } }, include: { plan: true } }));
  if (!org) throw new Error(`No client matches "${needle}".`);

  const planCode = (arg("plan") ?? org.plan?.code ?? "PRACTICE").toUpperCase();
  const months = Math.max(1, Math.min(60, Number(arg("months", "12"))));
  const amount = arg("amount") ? Number(arg("amount")) : undefined;

  // Prefer the configured MG Advisory platform owner as the actor on the audit trail.
  const ownerEmail = (process.env.PLATFORM_OWNER_EMAIL || "owner@mgadvisory.co.zw").toLowerCase();
  const actor =
    (await db.user.findFirst({ where: { email: ownerEmail, isSuperAdmin: true } })) ??
    (await db.user.findFirst({ where: { isSuperAdmin: true }, orderBy: { createdAt: "asc" } }));

  const inv = await grantSubscription({
    orgId: org.id,
    planCode,
    cycle: months >= 12 ? "YEARLY" : "MONTHLY",
    months,
    amount,
    method: arg("method", "MANUAL"),
    reference: arg("reference"),
    notes: arg("note"),
    approvedById: actor?.id,
    startNow: flag("start-now"),
  });

  // Mirrors logPlatformAction — written directly so this script stays free of
  // the server-only modules the console imports.
  if (actor) {
    await db.platformAudit.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        orgId: org.id,
        orgName: org.name,
        action: "GRANT_SUBSCRIPTION",
        detail: `Granted ${planCode} for ${months} month${months === 1 ? "" : "s"} — ${money(inv.amount)}, invoice ${inv.number}, paid access to ${fmtDate(inv.periodEnd)} (granted from the command line)`,
      },
    });
  }

  console.log(`✓ ${org.name} — ${planCode} plan, active until ${fmtDate(inv.periodEnd)}`);
  console.log(`  Invoice ${inv.number} · ${money(inv.amount)} · marked paid${arg("reference") ? ` · ref ${arg("reference")}` : ""}`);
}

main()
  .catch((e) => {
    console.error("✗", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
