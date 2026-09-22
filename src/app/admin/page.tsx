import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { activateInvoice } from "@/lib/billing";
import { Logo } from "@/components/logo";
import { Badge, Card, CardHeader, StatCard, Table } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { addDays, fmtDate, money, round2 } from "@/lib/utils";
import { logoutAction } from "../(auth)/actions";

export const metadata = { title: "Platform admin" };

async function markPaid(id: string) {
  "use server";
  await requireSuperAdmin();
  await activateInvoice(id, "BANK", "Confirmed by admin");
  revalidatePath("/admin");
}

async function extendTrial(orgId: string) {
  "use server";
  await requireSuperAdmin();
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  const base = org.trialEndsAt && org.trialEndsAt > new Date() ? org.trialEndsAt : new Date();
  await db.organization.update({ where: { id: orgId }, data: { trialEndsAt: addDays(base, 14), subscriptionStatus: "TRIALING" } });
  revalidatePath("/admin");
}

export default async function AdminPage() {
  await requireSuperAdmin();
  const [orgs, openInvoices, paid] = await Promise.all([
    db.organization.findMany({ include: { plan: true, _count: { select: { branches: true, users: true, patients: true, orders: true } } }, orderBy: { createdAt: "desc" } }),
    db.subscriptionInvoice.findMany({ where: { status: "OPEN" }, include: { organization: true }, orderBy: { createdAt: "desc" } }),
    db.subscriptionInvoice.findMany({ where: { status: "PAID" } }),
  ]);
  const active = orgs.filter((o) => o.subscriptionStatus === "ACTIVE");
  const mrr = round2(active.reduce((s, o) => s + (o.billingCycle === "YEARLY" ? (o.plan?.priceYearlyUsd ?? 0) / 12 : o.plan?.priceMonthlyUsd ?? 0), 0));
  const trials = orgs.filter((o) => o.subscriptionStatus === "TRIALING" && o.trialEndsAt && o.trialEndsAt > new Date()).length;
  const revenue = round2(paid.reduce((s, i) => s + i.amount, 0));

  return (
    <div className="min-h-screen">
      <header className="flex h-16 items-center justify-between bg-ink-950 px-6">
        <Logo dark />
        <div className="flex items-center gap-3 text-sm text-slate-300">
          Platform admin
          <form action={logoutAction}><button className="rounded-lg border border-white/20 px-3 py-1.5 text-white">Sign out</button></form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <div className="grid gap-4 sm:grid-cols-4">
          <StatCard label="MRR" value={money(mrr)} hint={`ARR ${money(mrr * 12)}`} />
          <StatCard label="Paying tenants" value={active.length} accent="green" />
          <StatCard label="Active trials" value={trials} accent="violet" hint={orgs.length ? `${Math.round((active.length / orgs.length) * 100)}% of sign-ups now pay` : undefined} />
          <StatCard label="Lifetime billings" value={money(revenue)} accent="amber" />
        </div>
        {openInvoices.length > 0 && (
          <Card>
            <CardHeader title="Awaiting payment confirmation" subtitle="Bank transfer / manual payments" />
            <Table>
              <tbody>
                {openInvoices.map((i) => (
                  <tr key={i.id}>
                    <td className="font-semibold">{i.number}</td><td>{i.organization.name}</td><td>{i.planCode} · {i.cycle.toLowerCase()}</td><td className="num">{money(i.amount)}</td>
                    <td className="text-right"><form action={markPaid.bind(null, i.id)}><SubmitButton className="px-3 py-1 text-xs">Mark paid</SubmitButton></form></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
        <Card>
          <CardHeader title="Tenants" subtitle={`${orgs.length} practices`} />
          <Table>
            <thead><tr><th>Practice</th><th>Plan</th><th>Status</th><th>Trial / period end</th><th className="num">Branches</th><th className="num">Users</th><th className="num">Patients</th><th className="num">Orders</th><th>Joined</th><th /></tr></thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td className="font-semibold">{o.name}<span className="block text-xs font-normal text-slate-400">{o.email}</span></td>
                  <td>{o.plan?.name ?? "—"}</td>
                  <td><Badge tone={o.subscriptionStatus === "ACTIVE" ? "green" : o.subscriptionStatus === "TRIALING" ? "brand" : "red"}>{o.subscriptionStatus.toLowerCase()}</Badge></td>
                  <td>{fmtDate(o.subscriptionStatus === "TRIALING" ? o.trialEndsAt : o.currentPeriodEnd)}</td>
                  <td className="num">{o._count.branches}</td><td className="num">{o._count.users}</td><td className="num">{o._count.patients}</td><td className="num">{o._count.orders}</td>
                  <td className="text-xs">{fmtDate(o.createdAt)}</td>
                  <td>{o.subscriptionStatus !== "ACTIVE" && <form action={extendTrial.bind(null, o.id)}><SubmitButton variant="ghost" className="px-2 py-1 text-xs">+14 day trial</SubmitButton></form>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </main>
    </div>
  );
}
