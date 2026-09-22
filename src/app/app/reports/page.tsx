import { Download } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardHeader, PageHeader, StatCard, Table } from "@/components/ui";
import { BarsChart, DonutChart } from "@/components/charts";
import { PAYMENT_METHODS, SALE_CATEGORIES, labelOf } from "@/lib/constants";
import { endOfDay, fmtDate, fullName, isoDate, money, round2, startOfMonth } from "@/lib/utils";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("accounting");
  const from = sp.from ? new Date(sp.from) : startOfMonth();
  const to = sp.to ? endOfDay(new Date(sp.to)) : endOfDay();
  const scope = ctx.branchId ? { branchId: ctx.branchId } : {};

  const [orders, receipts, exams, recalled, owing] = await Promise.all([
    db.order.findMany({
      where: { orgId: ctx.orgId, ...scope, invoicedAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      include: { items: { include: { product: true } }, branch: true, prescription: { include: { optometrist: true } } },
    }),
    db.receipt.findMany({ where: { orgId: ctx.orgId, ...scope, voided: false, date: { gte: from, lte: to } } }),
    db.prescription.count({ where: { patient: { orgId: ctx.orgId }, ...scope, examDate: { gte: from, lte: to } } }),
    db.message.findMany({ where: { orgId: ctx.orgId, purpose: "RECALL", createdAt: { gte: from, lte: to } }, select: { patientId: true } }),
    db.order.findMany({ where: { orgId: ctx.orgId, ...scope, invoicedAt: { not: null }, status: { not: "CANCELLED" } }, include: { patient: true } }),
  ]);

  const toBase = (v: number, r: number) => v / (r || 1);
  const cat = new Map<string, number>();
  const branch = new Map<string, number>();
  const optom = new Map<string, number>();
  const frames = new Map<string, { qty: number; value: number }>();
  let gross = 0;
  let cost = 0;
  for (const o of orders) {
    const net = toBase(o.subtotal - o.discount, o.exchangeRate);
    gross += net;
    branch.set(o.branch.name, (branch.get(o.branch.name) ?? 0) + net);
    const who = o.prescription?.optometrist?.name ?? "Unassigned";
    optom.set(who, (optom.get(who) ?? 0) + net);
    for (const i of o.items) {
      const v = toBase(i.lineTotal, o.exchangeRate);
      const label = labelOf(SALE_CATEGORIES, i.category);
      cat.set(label, (cat.get(label) ?? 0) + v);
      cost += i.unitCost * i.quantity;
      if (i.category === "FRAME") {
        const k = i.product?.brand ? `${i.product.brand} ${i.product.model ?? ""}`.trim() : i.description;
        const f = frames.get(k) ?? { qty: 0, value: 0 };
        frames.set(k, { qty: f.qty + i.quantity, value: f.value + v });
      }
    }
  }
  const toArr = (m: Map<string, number>) => [...m].map(([name, value]) => ({ name, value: round2(value) })).sort((a, b) => b.value - a.value);
  const methods = PAYMENT_METHODS.map((m) => ({ name: m.label, value: round2(receipts.filter((r) => r.method === m.value).reduce((s, r) => s + r.baseAmount, 0)) })).filter((x) => x.value);
  const cashIn = round2(receipts.reduce((s, r) => s + r.baseAmount, 0));
  const recalledIds = [...new Set(recalled.map((r) => r.patientId).filter(Boolean))] as string[];
  const returned = recalledIds.length
    ? await db.prescription.groupBy({ by: ["patientId"], where: { patientId: { in: recalledIds }, examDate: { gte: from } } }).then((r) => r.length)
    : 0;

  // Patient receivables ageing (base currency)
  const now = Date.now();
  const ageing = [0, 0, 0, 0];
  const debtors: { name: string; id: string; bal: number; days: number }[] = [];
  for (const o of owing) {
    const bal = toBase(o.patientPortion - o.amountPaid, o.exchangeRate);
    if (bal <= 0.009) continue;
    const days = Math.floor((now - (o.invoicedAt ?? o.createdAt).getTime()) / 86400000);
    ageing[days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3] += bal;
    debtors.push({ name: fullName(o.patient), id: o.id, bal, days });
  }
  debtors.sort((a, b) => b.bal - a.bal);
  const base = ctx.org.baseCurrency;

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={`${fmtDate(from)} – ${fmtDate(to)} · ${ctx.branchId ? ctx.branches.find((b) => b.id === ctx.branchId)?.name : "All branches"}`}
        actions={
          <form className="flex items-end gap-2">
            <input type="date" name="from" defaultValue={isoDate(from)} className="input py-1.5" />
            <input type="date" name="to" defaultValue={isoDate(to)} className="input py-1.5" />
            <button className="rounded-lg bg-ink-900 px-3 py-1.5 text-sm font-semibold text-white">Apply</button>
          </form>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Net sales" value={money(gross, base)} hint={`${orders.length} invoiced orders`} />
        <StatCard label="Avg order value" value={money(orders.length ? gross / orders.length : 0, base)} accent="violet" />
        <StatCard label="Gross margin (stock items)" value={gross ? `${Math.round(((gross - cost) / gross) * 100)}%` : "—"} accent="green" hint={`COGS ${money(cost, base)}`} />
        <StatCard label="Cash collected" value={money(cashIn, base)} accent="amber" />
        <StatCard label="Eye exams" value={exams} hint={recalledIds.length ? `${returned}/${recalledIds.length} recalled patients returned` : "No recalls sent in period"} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card><CardHeader title="Sales by category" /><div className="p-5"><DonutChart data={toArr(cat)} /></div></Card>
        <Card><CardHeader title="Collections by payment method" /><div className="p-5"><DonutChart data={methods} /></div></Card>
        <Card><CardHeader title="Sales by branch" /><div className="p-4"><BarsChart data={toArr(branch)} /></div></Card>
        <Card><CardHeader title="Sales by optometrist" subtitle="Based on the prescription linked to each order" /><div className="p-4"><BarsChart data={toArr(optom)} color="#14b8a6" /></div></Card>
        <Card>
          <CardHeader title="Best-selling frames" />
          <Table>
            <thead><tr><th>Frame</th><th className="num">Units</th><th className="num">Sales</th></tr></thead>
            <tbody>
              {[...frames].sort((a, b) => b[1].value - a[1].value).slice(0, 10).map(([k, v]) => (
                <tr key={k}><td>{k}</td><td className="num">{v.qty}</td><td className="num">{money(v.value)}</td></tr>
              ))}
              {!frames.size && <tr><td colSpan={3} className="py-6 text-center text-slate-400">No frame sales in period.</td></tr>}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Patient debtors ageing" subtitle="All outstanding patient balances today" />
          <div className="grid grid-cols-4 divide-x divide-slate-100 border-b border-slate-100 text-center">
            {["0–30", "31–60", "61–90", "90+"].map((l, i) => (
              <div key={l} className="p-3"><p className="text-xs text-slate-500">{l} days</p><p className={`font-bold ${i === 3 && ageing[3] ? "text-rose-600" : ""}`}>{money(ageing[i])}</p></div>
            ))}
          </div>
          <Table>
            <tbody>
              {debtors.slice(0, 8).map((d) => (
                <tr key={d.id}><td><a className="text-brand-700" href={`/app/orders/${d.id}`}>{d.name}</a></td><td className="text-xs text-slate-500">{d.days} days</td><td className="num font-semibold">{money(d.bal)}</td></tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title="Data export" subtitle="Download CSV files for Excel, your auditor or a migration" />
        <div className="flex flex-wrap gap-2 p-5">
          {[["patients", "Patients"], ["orders", "Orders"], ["receipts", "Receipts"], ["expenses", "Expenses"], ["journal", "General ledger"], ["inventory", "Inventory"]].map(([k, l]) => (
            <a key={k} href={`/api/export/${k}?from=${isoDate(from)}&to=${isoDate(to)}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"><Download size={15} /> {l}</a>
          ))}
        </div>
      </Card>
    </>
  );
}
