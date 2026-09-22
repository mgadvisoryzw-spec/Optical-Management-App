import Link from "next/link";
import { Plus } from "lucide-react";
import { getContext, branchScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, EmptyState, LinkButton, PageHeader, StatCard, Table } from "@/components/ui";
import { PAYMENT_METHODS, labelOf } from "@/lib/constants";
import { endOfDay, fmtDate, fullName, isoDate, money, round2, startOfMonth } from "@/lib/utils";

export const metadata = { title: "Receipts" };

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; method?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const from = sp.from ? new Date(sp.from) : startOfMonth();
  const to = sp.to ? endOfDay(new Date(sp.to)) : endOfDay();
  const where = { orgId: ctx.orgId, ...branchScope(ctx), date: { gte: from, lte: to }, ...(sp.method ? { method: sp.method } : {}) };
  const receipts = await db.receipt.findMany({ where, include: { patient: true, order: true, branch: true }, orderBy: { date: "desc" }, take: 300 });
  const live = receipts.filter((r) => !r.voided);
  const total = round2(live.reduce((s, r) => s + r.baseAmount, 0));
  const byMethod = PAYMENT_METHODS.map((m) => ({ ...m, total: round2(live.filter((r) => r.method === m.value).reduce((s, r) => s + r.baseAmount, 0)) })).filter((m) => m.total);
  const byCurrency = [...new Set(live.map((r) => r.currency))].map((c) => ({ c, total: round2(live.filter((r) => r.currency === c).reduce((s, r) => s + r.amount, 0)) }));

  return (
    <>
      <PageHeader title="Receipts" subtitle="Money received from patients" actions={<LinkButton href="/app/receipts/new"><Plus size={16} /> New receipt</LinkButton>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total received" value={money(total, ctx.org.baseCurrency)} hint={`${live.length} receipts in period`} />
        <StatCard label="By currency" value={<span className="text-base">{byCurrency.map((b) => money(b.total, b.c)).join(" · ") || "—"}</span>} accent="violet" />
        <StatCard label="Top method" value={<span className="text-base">{byMethod.sort((a, b) => b.total - a.total).slice(0, 2).map((m) => `${m.label} ${money(m.total)}`).join(" · ") || "—"}</span>} accent="green" />
      </div>
      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
          <label><span className="label">From</span><input type="date" name="from" defaultValue={isoDate(from)} className="input" /></label>
          <label><span className="label">To</span><input type="date" name="to" defaultValue={isoDate(to)} className="input" /></label>
          <label><span className="label">Method</span>
            <select name="method" defaultValue={sp.method ?? ""} className="input">
              <option value="">All methods</option>
              {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          <button className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white">Apply</button>
        </form>
        {receipts.length ? (
          <Table>
            <thead><tr><th>Receipt</th><th>Date</th><th>Patient</th><th>Order</th><th>Method</th>{!ctx.branchId && <th>Branch</th>}<th className="num">Amount</th><th className="num">{ctx.org.baseCurrency} equiv.</th></tr></thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} className={r.voided ? "opacity-50" : ""}>
                  <td><Link href={`/app/receipts/${r.id}`} className="font-semibold text-brand-700">{r.receiptNo}</Link> {r.voided && <Badge tone="red">Void</Badge>}</td>
                  <td>{fmtDate(r.date)}</td>
                  <td>{r.patient ? fullName(r.patient) : "—"}</td>
                  <td>{r.order ? <Link href={`/app/orders/${r.order.id}`} className="text-brand-700">{r.order.orderNo}</Link> : <span className="text-slate-400">Deposit</span>}</td>
                  <td>{labelOf(PAYMENT_METHODS, r.method)}</td>
                  {!ctx.branchId && <td className="text-slate-500">{r.branch.name}</td>}
                  <td className="num">{money(r.amount, r.currency)}</td>
                  <td className="num text-slate-500">{money(r.baseAmount, ctx.org.baseCurrency)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No receipts in this period" />
        )}
      </Card>
    </>
  );
}
