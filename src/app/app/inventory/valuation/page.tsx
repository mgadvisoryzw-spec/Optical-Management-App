import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { inventoryValuationData } from "@/lib/statements";
import { Alert, Card, CardHeader, PageHeader, StatCard, Table } from "@/components/ui";
import { StatementDownloads } from "@/components/statement-view";
import { BarsChart } from "@/components/charts";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { cn, endOfDay, fmtDate, isoDate, money, round2 } from "@/lib/utils";

export const metadata = { title: "Stock valuation" };

export default async function ValuationPage({ searchParams }: { searchParams: Promise<{ to?: string; cat?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("inventory");
  const to = sp.to ? endOfDay(new Date(sp.to)) : endOfDay();
  const { lines, ledger, ledgerTotal } = await inventoryValuationData(ctx.orgId, to, ctx.branchId);
  const base = ctx.org.baseCurrency;

  const totals = PRODUCT_CATEGORIES.map((c) => {
    const items = lines.filter((l) => l.category === c.value);
    const value = round2(items.reduce((s, l) => s + l.value, 0));
    const retail = round2(items.reduce((s, l) => s + l.retail, 0));
    return { ...c, count: items.length, qty: round2(items.reduce((s, l) => s + Math.max(0, l.qty), 0)), value, retail };
  }).filter((c) => c.count);
  const totalValue = round2(totals.reduce((s, c) => s + c.value, 0));
  const totalRetail = round2(totals.reduce((s, c) => s + c.retail, 0));
  const diff = round2(totalValue - ledgerTotal);
  const negative = lines.filter((l) => l.qty < 0);
  const shown = sp.cat ? lines.filter((l) => l.category === sp.cat) : lines;
  const branchValue = ctx.branchId
    ? []
    : ctx.branches.map((b) => ({ name: b.name, value: round2(lines.reduce((s, l) => s + Math.max(0, l.byBranch[b.id] ?? 0) * l.unitCost, 0)) })).filter((b) => b.value);
  const branchLabel = ctx.branchId ? ctx.branches.find((b) => b.id === ctx.branchId)?.name : "All branches";

  return (
    <>
      <PageHeader
        title="Stock valuation"
        subtitle={`Stock on hand as at ${fmtDate(to)} · ${branchLabel} · valued at weighted-average cost`}
        back={{ href: "/app/inventory", label: "Inventory" }}
        actions={
          <form className="flex items-end gap-2">
            {sp.cat && <input type="hidden" name="cat" value={sp.cat} />}
            <label><span className="label">As at</span><input type="date" name="to" defaultValue={isoDate(to)} className="input w-44 py-1.5" /></label>
            <button className="rounded-lg bg-ink-900 px-3 py-2 text-sm font-semibold text-white">Apply</button>
          </form>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Stock value at cost" value={money(totalValue, base)} hint={`${lines.filter((l) => l.qty > 0).length} items in stock`} />
        <StatCard label="Stock value at selling price" value={money(totalRetail, base)} accent="violet" />
        <StatCard label="Potential gross profit" value={money(totalRetail - totalValue, base)} hint={totalRetail ? `${Math.round(((totalRetail - totalValue) / totalRetail) * 100)}% average margin` : undefined} accent="green" />
        <StatCard label="Inventory per books" value={money(ledgerTotal, base)} hint={Math.abs(diff) < 0.01 ? "Matches the stock count" : `Difference ${money(diff, base)}`} accent={Math.abs(diff) < 0.01 ? "brand" : "amber"} />
      </div>

      {negative.length > 0 && (
        <div className="mb-6">
          <Alert tone="amber">
            {negative.length} item{negative.length > 1 ? "s show" : " shows"} negative stock ({negative.slice(0, 3).map((l) => l.name).join(", ")}{negative.length > 3 ? "…" : ""}). They are valued at zero. Record the missing purchase or post a stock-count adjustment to correct them.
          </Alert>
        </div>
      )}

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="By category" action={<StatementDownloads kind="inventory-valuation" to={isoDate(to)} />} />
          <Table>
            <thead>
              <tr><th>Category</th><th className="num">Items</th><th className="num">Qty</th><th className="num">Value at cost</th><th className="num">Retail value</th><th className="num">Margin</th><th className="num">Share</th></tr>
            </thead>
            <tbody>
              {totals.map((c) => (
                <tr key={c.value}>
                  <td><Link href={`?cat=${c.value}&to=${isoDate(to)}`} className="font-semibold hover:text-brand-700">{c.label}</Link></td>
                  <td className="num">{c.count}</td>
                  <td className="num">{c.qty}</td>
                  <td className="num font-semibold">{money(c.value)}</td>
                  <td className="num">{money(c.retail)}</td>
                  <td className="num">{c.retail ? `${Math.round(((c.retail - c.value) / c.retail) * 100)}%` : "—"}</td>
                  <td className="num text-slate-500">{totalValue ? `${Math.round((c.value / totalValue) * 100)}%` : "—"}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td>Total</td><td className="num">{lines.length}</td><td className="num">{round2(totals.reduce((s, c) => s + c.qty, 0))}</td><td className="num">{money(totalValue)}</td><td className="num">{money(totalRetail)}</td>
                <td className="num">{totalRetail ? `${Math.round(((totalRetail - totalValue) / totalRetail) * 100)}%` : "—"}</td><td className="num">100%</td>
              </tr>
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Reconciliation with the books" subtitle="Stock count value against inventory accounts in the ledger" />
          <Table>
            <tbody>
              {ledger.map((a) => (
                <tr key={a.code}><td><Link href={`/app/accounting/ledger/${a.code}`} className="hover:text-brand-700"><span className="text-slate-400">{a.code}</span> {a.name}</Link></td><td className="num">{money(a.balance)}</td></tr>
              ))}
              <tr className="font-semibold"><td>Inventory per books</td><td className="num">{money(ledgerTotal)}</td></tr>
              <tr><td>Stock count at cost</td><td className="num">{money(totalValue)}</td></tr>
              <tr className={cn("font-semibold", Math.abs(diff) < 0.01 ? "text-emerald-700" : "text-amber-700")}><td>Difference</td><td className="num">{money(diff)}</td></tr>
            </tbody>
          </Table>
          {branchValue.length > 1 && (
            <div className="border-t border-slate-100 p-4">
              <p className="label">Value by branch</p>
              <BarsChart data={branchValue} />
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title={sp.cat ? `${PRODUCT_CATEGORIES.find((c) => c.value === sp.cat)?.label} on hand` : "All items on hand"}
          subtitle={sp.cat ? <Link href={`?to=${isoDate(to)}`} className="text-brand-700">Show all categories</Link> : "Click a category above to filter"}
        />
        <Table>
          <thead>
            <tr>
              <th>Item</th>
              {!ctx.branchId && ctx.branches.length > 1 && ctx.branches.map((b) => <th key={b.id} className="num">{b.code}</th>)}
              <th className="num">Qty</th><th className="num">Unit cost</th><th className="num">Value at cost</th><th className="num">Selling price</th><th className="num">Retail value</th><th className="num">Margin</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.productId}>
                <td>
                  <Link href={`/app/inventory/${l.productId}`} className="font-semibold text-slate-900 hover:text-brand-700">{l.name}</Link>
                  <span className="block text-xs text-slate-400">{l.sku}{l.details ? ` · ${l.details}` : ""}</span>
                </td>
                {!ctx.branchId && ctx.branches.length > 1 && ctx.branches.map((b) => <td key={b.id} className="num text-slate-500">{l.byBranch[b.id] ?? 0}</td>)}
                <td className={cn("num font-semibold", l.qty < 0 && "text-rose-600")}>{l.qty}</td>
                <td className="num">{money(l.unitCost)}</td>
                <td className="num font-semibold">{money(l.value)}</td>
                <td className="num">{money(l.sellPrice)}</td>
                <td className="num">{money(l.retail)}</td>
                <td className="num text-slate-500">{l.sellPrice ? `${Math.round(((l.sellPrice - l.unitCost) / l.sellPrice) * 100)}%` : "—"}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={10} className="py-10 text-center text-slate-400">No stock items yet. Record a purchase to add frames and lenses.</td></tr>}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
