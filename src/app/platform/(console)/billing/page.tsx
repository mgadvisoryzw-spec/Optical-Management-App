import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { requirePlatformOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { platformSnapshot, upcomingRenewals } from "@/lib/platform";
import { Alert, Badge, Card, CardHeader, Field, Input, PageHeader, Select, StatCard, Table } from "@/components/ui";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { fmtDate, money } from "@/lib/utils";
import { approvePayment, grantAccess, raiseInvoice, voidInvoice } from "../actions";

export const metadata = { title: "Billing & approvals" };

const PAYMENT_METHODS = [
  { value: "BANK", label: "Bank transfer" },
  { value: "ECOCASH", label: "EcoCash" },
  { value: "PAYNOW", label: "Paynow" },
  { value: "CASH", label: "Cash" },
  { value: "MANUAL", label: "Other" },
];

export default async function PlatformBillingPage({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  await requirePlatformOwner();
  const sp = await searchParams;
  const [{ openInvoices, stats }, renewals, plans, recentPaid] = await Promise.all([
    platformSnapshot(),
    upcomingRenewals(60),
    db.plan.findMany({ orderBy: { sortOrder: "asc" } }),
    db.subscriptionInvoice.findMany({
      where: { status: "PAID" },
      include: { organization: { select: { id: true, name: true } }, approvedBy: { select: { name: true } } },
      orderBy: { paidAt: "desc" },
      take: 20,
    }),
  ]);
  const planOptions = plans.map((p) => ({ value: p.code, label: `${p.name} — $${p.priceMonthlyUsd}/mo · $${p.priceYearlyUsd}/yr` }));
  const expired = renewals.filter((r) => r.health.state === "LAPSED");
  const dueSoon = renewals.filter((r) => r.health.state === "EXPIRING" || r.health.state === "TRIAL");

  return (
    <>
      <PageHeader
        title="Billing & approvals"
        subtitle="Approve payments, renew expired subscriptions and grant access when a client has paid MG Advisory directly."
      />

      {sp.error && <div className="mb-6"><Alert tone="red">{sp.error}</Alert></div>}
      {sp.done && <div className="mb-6"><Alert tone="green">{sp.done}</Alert></div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Awaiting approval" value={openInvoices.length} accent={openInvoices.length ? "amber" : "green"} hint={money(openInvoices.reduce((s, i) => s + i.amount, 0))} />
        <StatCard label="Expired subscriptions" value={expired.length} accent={expired.length ? "rose" : "green"} hint="Locked out of recording until renewed" />
        <StatCard label="Due within 60 days" value={dueSoon.length} accent="violet" hint="Renewals and trials to chase" />
        <StatCard label="Collected this month" value={money(stats.thisMonth)} accent="green" hint={`${money(stats.lifetime)} lifetime`} />
      </div>

      <Card className="mb-6">
        <CardHeader
          title="1 · Payments awaiting approval"
          subtitle="The client picked a plan in the app and paid by bank transfer or mobile money. Confirm the money arrived, then approve."
        />
        {openInvoices.length ? (
          <div className="divide-y divide-slate-100">
            {openInvoices.map((i) => (
              <div key={i.id} className="p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">
                    <Link href={`/platform/clients/${i.orgId}`} className="text-brand-700 hover:underline">{i.organization.name}</Link>
                    <span className="text-slate-400"> · </span>
                    {i.number}
                  </p>
                  <p className="text-sm">
                    <b>{money(i.amount)}</b> — {i.planCode} {i.cycle.toLowerCase()}
                  </p>
                </div>
                <p className="text-xs text-slate-500">
                  Reference to look for: <b>{i.number}</b> · covers {fmtDate(i.periodStart)} – {fmtDate(i.periodEnd)} · raised {fmtDate(i.createdAt)}
                </p>
                <form action={approvePayment.bind(null, i.id)} className="mt-3 grid gap-3 sm:grid-cols-5">
                  <Field label="Paid by"><Select name="method" defaultValue="BANK" options={PAYMENT_METHODS} /></Field>
                  <Field label="Payment reference"><Input name="reference" placeholder="bank / EcoCash ref" /></Field>
                  <Field label="Internal note" className="sm:col-span-2"><Input name="notes" placeholder="e.g. POP received by email" /></Field>
                  <div className="flex items-end"><SubmitButton pendingText="Approving…">Approve payment</SubmitButton></div>
                </form>
                <form action={voidInvoice.bind(null, i.id)} className="mt-2">
                  <ConfirmButton variant="ghost" className="px-0 text-xs text-slate-400" message={`Void invoice ${i.number}?`}>Void</ConfirmButton>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <CheckCircle2 size={26} className="mb-2 text-emerald-500" />
            <p className="font-semibold text-slate-800">Nothing waiting on you</p>
            <p className="mt-1 text-sm text-slate-500">Every payment that has come in has been approved.</p>
          </div>
        )}
      </Card>

      <Card className="mb-6">
        <CardHeader
          title="2 · Expired and expiring subscriptions"
          subtitle="Grant another term straight away if the client has paid, or raise an invoice for them to settle first."
        />
        <Table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Due / expired</th>
              <th>Grant paid access</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {[...expired, ...dueSoon].map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/platform/clients/${r.id}`} className="font-semibold text-slate-900 hover:text-brand-700 hover:underline">{r.name}</Link>
                  <span className="block text-xs font-normal text-slate-400">{r.email}</span>
                </td>
                <td className="text-sm">{r.plan?.name ?? "—"}</td>
                <td><Badge tone={r.health.tone}>{r.health.label}</Badge></td>
                <td className="text-sm">{fmtDate(r.dueOn)}</td>
                <td>
                  <form action={grantAccess.bind(null, r.id)} className="flex items-end gap-2">
                    <Select name="planCode" defaultValue={r.plan?.code ?? "PRACTICE"} options={plans.map((p) => ({ value: p.code, label: p.name }))} className="w-32 py-1.5" />
                    <Input name="months" type="number" min={1} max={60} defaultValue={12} className="w-20 py-1.5" title="Months" />
                    <Select name="method" defaultValue="BANK" options={PAYMENT_METHODS} className="w-32 py-1.5" />
                    <SubmitButton className="px-3 py-1.5 text-xs" pendingText="Granting…">Grant &amp; approve</SubmitButton>
                  </form>
                </td>
                <td className="text-right">
                  <form action={raiseInvoice.bind(null, r.id)}>
                    <input type="hidden" name="planCode" value={r.plan?.code ?? "PRACTICE"} />
                    <input type="hidden" name="cycle" value={r.billingCycle} />
                    <SubmitButton variant="ghost" className="px-2 py-1 text-xs">Invoice them</SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
            {!expired.length && !dueSoon.length && (
              <tr><td colSpan={6} className="py-10 text-center text-slate-400">No subscriptions expire in the next 60 days.</td></tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="3 · Recently approved" subtitle="The last 20 payments switched on from this console or paid through Paynow" />
        <Table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Client</th>
              <th>Plan</th>
              <th>Period</th>
              <th>Method</th>
              <th>Approved by</th>
              <th>Paid</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {recentPaid.map((i) => (
              <tr key={i.id}>
                <td className="font-semibold">{i.number}</td>
                <td><Link href={`/platform/clients/${i.organization.id}`} className="hover:underline">{i.organization.name}</Link></td>
                <td className="text-sm">{i.planCode} · {i.cycle.toLowerCase()}</td>
                <td className="text-xs text-slate-500">{fmtDate(i.periodStart)} – {fmtDate(i.periodEnd)}</td>
                <td className="text-sm">{i.method ?? "—"}{i.reference && <span className="block text-xs text-slate-400">{i.reference}</span>}</td>
                <td className="text-xs text-slate-500">{i.approvedBy?.name ?? "automatic"}</td>
                <td className="text-xs text-slate-500">{fmtDate(i.paidAt)}</td>
                <td className="num">{money(i.amount)}</td>
              </tr>
            ))}
            {!recentPaid.length && <tr><td colSpan={8} className="py-8 text-center text-slate-400">No payments recorded yet.</td></tr>}
          </tbody>
        </Table>
      </Card>

      <p className="text-xs text-slate-400">
        Plan prices come from <Link href="/platform/plans" className="font-semibold text-brand-700 hover:underline">Plans &amp; pricing</Link>.
        {planOptions.length} plan{planOptions.length === 1 ? "" : "s"} are currently offered.
      </p>
    </>
  );
}
