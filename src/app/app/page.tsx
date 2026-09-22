import Link from "next/link";
import { CalendarDays, HandCoins, HeartPulse, ShoppingBag, TrendingUp, BellRing, Plus, AlertTriangle } from "lucide-react";
import { getContext, branchScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { monthlyRevenue, accountBalances } from "@/lib/reports";
import { Badge, Card, CardHeader, LinkButton, StatCard, Alert } from "@/components/ui";
import { RevenueChart, DonutChart } from "@/components/charts";
import { APPOINTMENT_TYPES, APPOINTMENT_STATUSES, labelOf, toneOf } from "@/lib/constants";
import { addDays, endOfDay, fmtTime, fullName, money, round2, startOfDay, startOfMonth } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string; denied?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const { orgId } = ctx;
  const scope = branchScope(ctx);
  const base = ctx.org.baseCurrency;
  const today0 = startOfDay();
  const today1 = endOfDay();

  const [trend, monthRows, receiptsToday, openOrders, readyOrders, recallsDue, apptsToday, claimsOpen, lowStock, patientsCount] = await Promise.all([
    monthlyRevenue(orgId, 12, ctx.branchId),
    accountBalances(orgId, { from: startOfMonth(), branchId: ctx.branchId }),
    db.receipt.aggregate({ where: { orgId, ...scope, voided: false, kind: "PAYMENT", date: { gte: today0, lte: today1 } }, _sum: { baseAmount: true }, _count: true }),
    db.order.count({ where: { orgId, ...scope, status: { in: ["AWAITING_AUTH", "ORDERED", "IN_LAB", "READY"] } } }),
    db.order.findMany({ where: { orgId, ...scope, status: "READY" }, include: { patient: true }, orderBy: { createdAt: "desc" }, take: 6 }),
    db.patient.count({ where: { orgId, nextRecallDate: { lte: addDays(new Date(), ctx.org.recallLeadDays) } } }),
    db.appointment.findMany({ where: { orgId, ...scope, startsAt: { gte: today0, lte: today1 } }, include: { patient: true, optometrist: true }, orderBy: { startsAt: "asc" } }),
    db.medicalAidClaim.aggregate({ where: { orgId, status: { in: ["PENDING_AUTH", "AUTHORISED", "SUBMITTED", "PART_PAID"] } }, _sum: { amount: true, paidAmount: true }, _count: true }),
    db.stockLevel.findMany({ where: { ...(ctx.branchId ? { branchId: ctx.branchId } : {}), product: { orgId, trackStock: true, active: true } }, include: { product: true, branch: true } }),
    db.patient.count({ where: { orgId } }),
  ]);

  const revenueMonth = round2(monthRows.filter((r) => r.type === "INCOME").reduce((s, r) => s - r.balance, 0));
  const byCategory = monthRows
    .filter((r) => r.type === "INCOME" && r.subtype !== "CONTRA" && -r.balance > 0)
    .map((r) => {
      const n = r.name.replace(/^Sales – /, "").replace(/^Consultation & eye test fees$/, "Consultations");
      return { name: n.charAt(0).toUpperCase() + n.slice(1), value: round2(-r.balance) };
    });
  const low = lowStock.filter((s) => s.quantity <= s.product.reorderLevel).slice(0, 6);
  const lastMonth = trend[trend.length - 2]?.revenue ?? 0;
  const thisMonth = trend[trend.length - 1]?.revenue ?? 0;
  const growth = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;
  const hour = new Date().getHours();

  return (
    <div className="space-y-6">
      {sp.welcome && (
        <Alert tone="green">
          <b>Welcome to OptiVault!</b> Your practice is ready. We've set up a chart of accounts, USD and ZWG currencies, the main medical aids and message templates. Next steps: add a <Link className="underline" href="/app/patients/new">patient</Link>, load your <Link className="underline" href="/app/inventory/new">frames and lenses</Link>, and invite your <Link className="underline" href="/app/settings/users">team</Link>.
        </Alert>
      )}
      {sp.denied && <Alert tone="amber">Your role doesn't have access to that area. Ask the practice owner if you need it.</Alert>}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          <h1 className="text-2xl font-bold tracking-tight">
            Good {hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}, {ctx.user.name.split(" ").find((w) => !/^(dr|mr|mrs|ms|prof)\.?$/i.test(w)) ?? ctx.user.name}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton variant="secondary" href="/app/appointments/new"><CalendarDays size={16} /> Book</LinkButton>
          <LinkButton variant="secondary" href="/app/patients/new"><Plus size={16} /> Patient</LinkButton>
          <LinkButton href="/app/orders/new"><ShoppingBag size={16} /> New order</LinkButton>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue this month" value={money(revenueMonth, base)} hint={growth !== null ? `${growth >= 0 ? "▲" : "▼"} ${Math.abs(growth)}% vs last month` : "Invoiced sales, excluding VAT"} icon={<TrendingUp size={18} />} />
        <StatCard label="Cash received today" value={money(receiptsToday._sum.baseAmount ?? 0, base)} hint={`${receiptsToday._count} receipt${receiptsToday._count === 1 ? "" : "s"}`} icon={<HandCoins size={18} />} accent="green" />
        <StatCard label="Open orders" value={openOrders} hint={`${readyOrders.length} ready for collection`} icon={<ShoppingBag size={18} />} accent="violet" />
        <StatCard
          label="Medical aid outstanding"
          value={money(round2((claimsOpen._sum.amount ?? 0) - (claimsOpen._sum.paidAmount ?? 0)))}
          hint={`${claimsOpen._count} open claim${claimsOpen._count === 1 ? "" : "s"}`}
          icon={<HeartPulse size={18} />}
          accent="amber"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Revenue vs costs" subtitle={`Last 12 months · ${base} · ${ctx.branchId ? ctx.branches.find((b) => b.id === ctx.branchId)?.name : "All branches"}`} />
          <div className="p-4">
            <RevenueChart data={trend} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Sales mix this month" subtitle="By revenue category" />
          <div className="p-5">
            <DonutChart data={byCategory} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Today's appointments" subtitle={`${apptsToday.length} booked`} action={<Link href="/app/appointments" className="text-xs font-semibold text-brand-700">Diary →</Link>} />
          <ul className="divide-y divide-slate-100">
            {apptsToday.slice(0, 7).map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                <span className="w-12 text-sm font-bold tabular-nums text-slate-900">{fmtTime(a.startsAt)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{a.patient ? fullName(a.patient) : a.guestName}</p>
                  <p className="truncate text-xs text-slate-500">
                    {labelOf(APPOINTMENT_TYPES, a.type)}
                    {a.optometrist ? ` · ${a.optometrist.name}` : ""}
                  </p>
                </div>
                <Badge tone={toneOf(APPOINTMENT_STATUSES, a.status)}>{labelOf(APPOINTMENT_STATUSES, a.status)}</Badge>
              </li>
            ))}
            {!apptsToday.length && <li className="px-5 py-8 text-center text-sm text-slate-400">No appointments today.</li>}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Ready for collection" subtitle="Tell patients their order is ready" action={<Link href="/app/orders?status=READY" className="text-xs font-semibold text-brand-700">All →</Link>} />
          <ul className="divide-y divide-slate-100">
            {readyOrders.map((o) => (
              <li key={o.id}>
                <Link href={`/app/orders/${o.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                  <div>
                    <p className="text-sm font-semibold">{fullName(o.patient)}</p>
                    <p className="text-xs text-slate-500">{o.orderNo}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{money(round2(o.patientPortion - o.amountPaid), o.currency)} due</span>
                </Link>
              </li>
            ))}
            {!readyOrders.length && <li className="px-5 py-8 text-center text-sm text-slate-400">Nothing waiting for collection.</li>}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-ink-900 to-ink-700 p-5 text-white">
              <div className="flex items-center gap-2 text-brand-300">
                <BellRing size={18} />
                <p className="text-xs font-bold uppercase tracking-wider">Recalls</p>
              </div>
              <p className="mt-2 text-3xl font-bold">{recallsDue}</p>
              <p className="text-sm text-slate-300">patients due for their 2-year eye test (within {ctx.org.recallLeadDays} days or overdue)</p>
              <LinkButton href="/app/recalls" className="mt-4 bg-brand-500 text-ink-950 hover:bg-brand-400">Send reminders</LinkButton>
            </div>
          </Card>
          <Card>
            <CardHeader title="Low stock" subtitle="At or below reorder level" action={<AlertTriangle size={16} className="text-amber-500" />} />
            <ul className="divide-y divide-slate-100">
              {low.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="truncate">
                    {s.product.name}
                    {ctx.branchId ? "" : <span className="text-slate-400"> · {s.branch.code}</span>}
                  </span>
                  <Badge tone={s.quantity <= 0 ? "red" : "amber"}>{s.quantity} left</Badge>
                </li>
              ))}
              {!low.length && <li className="px-5 py-6 text-center text-sm text-slate-400">Stock levels are healthy.</li>}
            </ul>
          </Card>
        </div>
      </div>
      <p className="text-center text-xs text-slate-400">{patientsCount.toLocaleString()} patients on file · all values in {base} unless stated</p>
    </div>
  );
}
