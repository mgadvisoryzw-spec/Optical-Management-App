import Link from "next/link";
import { AlertTriangle, ArrowRight, Building2, CalendarClock, CheckCircle2, Users } from "lucide-react";
import { requirePlatformOwner } from "@/lib/auth";
import { PLATFORM_ACTIONS, VENDOR, platformSnapshot, upcomingRenewals } from "@/lib/platform";
import { Badge, Card, CardHeader, StatCard, Table } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { fmtDate, fmtDateTime, money } from "@/lib/utils";
import { approvePayment } from "./actions";

export const metadata = { title: "Overview" };

export default async function PlatformOverview() {
  const owner = await requirePlatformOwner();
  const [{ clients, openInvoices, recent, stats }, renewals] = await Promise.all([platformSnapshot(), upcomingRenewals(45)]);
  const firstName = owner.name.split(" ")[0];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Good to see you, {firstName}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {stats.total} practice{stats.total === 1 ? "" : "s"} on {VENDOR.product}
            {stats.attention > 0 ? ` · ${stats.attention} need${stats.attention === 1 ? "s" : ""} your attention` : " · nothing needs your attention"}
          </p>
        </div>
        <Link href="/platform/clients" className="inline-flex items-center gap-2 rounded-lg bg-ink-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-ink-800">
          All clients <ArrowRight size={16} />
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Monthly recurring revenue" value={money(stats.mrr)} hint={`ARR ${money(stats.arr)}`} />
        <StatCard label="Paying clients" value={stats.paying} accent="green" hint={`${stats.trials} on trial · ${stats.lapsed} lapsed`} icon={<Building2 size={18} />} />
        <StatCard label="Collected this month" value={money(stats.thisMonth)} accent="violet" hint={`${money(stats.lifetime)} lifetime`} />
        <StatCard
          label="Needs approval"
          value={openInvoices.length}
          accent={openInvoices.length ? "amber" : "green"}
          hint={openInvoices.length ? "Payments awaiting confirmation" : "Approvals queue is clear"}
          icon={openInvoices.length ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
        />
      </div>

      {openInvoices.length > 0 && (
        <Card>
          <CardHeader
            title="Awaiting your approval"
            subtitle="A client has chosen a plan and says they have paid. Approve to switch their subscription on."
            action={
              <Link href="/platform/billing" className="text-xs font-semibold text-brand-700 hover:underline">
                Full queue →
              </Link>
            }
          />
          <Table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Client</th>
                <th>Plan</th>
                <th>Period</th>
                <th className="num">Amount</th>
                <th>Raised</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {openInvoices.slice(0, 6).map((i) => (
                <tr key={i.id}>
                  <td className="font-semibold">{i.number}</td>
                  <td>
                    <Link href={`/platform/clients/${i.orgId}`} className="font-semibold text-brand-700 hover:underline">
                      {i.organization.name}
                    </Link>
                    <span className="block text-xs text-slate-400">{i.organization.email}</span>
                  </td>
                  <td className="text-sm">
                    {i.planCode} · {i.cycle.toLowerCase()}
                  </td>
                  <td className="text-xs text-slate-500">
                    {fmtDate(i.periodStart)} – {fmtDate(i.periodEnd)}
                  </td>
                  <td className="num font-semibold">{money(i.amount)}</td>
                  <td className="text-xs text-slate-500">{fmtDate(i.createdAt)}</td>
                  <td className="text-right">
                    <form action={approvePayment.bind(null, i.id)} className="flex items-center justify-end gap-2">
                      <input type="hidden" name="method" value="BANK" />
                      <SubmitButton className="px-3 py-1 text-xs" pendingText="Approving…">
                        Approve payment
                      </SubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Renewals & trials in the next 45 days" subtitle="Who to invoice or follow up next" />
          <Table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Due</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {renewals.map((r) => (
                <tr key={r.id}>
                  <td className="font-semibold">{r.name}</td>
                  <td className="text-sm">{r.plan?.name ?? "—"}</td>
                  <td>
                    <Badge tone={r.health.tone}>{r.health.label}</Badge>
                  </td>
                  <td className="text-sm">{fmtDate(r.dueOn)}</td>
                  <td className="text-right">
                    <Link href={`/platform/clients/${r.id}`} className="text-xs font-semibold text-brand-700 hover:underline">
                      Manage →
                    </Link>
                  </td>
                </tr>
              ))}
              {!renewals.length && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    <CalendarClock size={20} className="mx-auto mb-2 text-slate-300" />
                    Nothing falls due in the next 45 days.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>

        <div className="space-y-6 xl:col-span-2">
          <Card className="p-5">
            <p className="label">Platform usage</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Practices</dt>
                <dd className="font-semibold tabular-nums">{stats.total}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Staff logins</dt>
                <dd className="font-semibold tabular-nums">{stats.seats}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Patient records</dt>
                <dd className="font-semibold tabular-nums">{stats.patients.toLocaleString()}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Suspended</dt>
                <dd className="font-semibold tabular-nums">{stats.suspended}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Top clients by value" />
            <Table>
              <tbody>
                {[...clients]
                  .sort((a, b) => b.mrr - a.mrr)
                  .slice(0, 6)
                  .map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/platform/clients/${c.id}`} className="font-semibold hover:underline">
                          {c.name}
                        </Link>
                        <span className="block text-xs text-slate-400">{c.plan?.name ?? "No plan"}</span>
                      </td>
                      <td className="num text-sm">{money(c.mrr)}/mo</td>
                      <td>
                        <Badge tone={c.health.tone}>{c.health.label}</Badge>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Recent console activity" action={<Link href="/platform/activity" className="text-xs font-semibold text-brand-700 hover:underline">All →</Link>} />
            <ul className="divide-y divide-slate-100">
              {recent.slice(0, 6).map((a) => (
                <li key={a.id} className="px-5 py-3 text-sm">
                  <p className="font-semibold text-slate-800">
                    {PLATFORM_ACTIONS[a.action as keyof typeof PLATFORM_ACTIONS] ?? a.action}
                    {a.orgName && <span className="font-normal text-slate-500"> · {a.orgName}</span>}
                  </p>
                  {a.detail && <p className="mt-0.5 text-xs text-slate-500">{a.detail}</p>}
                  <p className="mt-0.5 text-xs text-slate-400">
                    {a.actorName} · {fmtDateTime(a.createdAt)}
                  </p>
                </li>
              ))}
              {!recent.length && (
                <li className="px-5 py-8 text-center text-sm text-slate-400">
                  <Users size={20} className="mx-auto mb-2 text-slate-300" />
                  Nothing logged yet.
                </li>
              )}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
