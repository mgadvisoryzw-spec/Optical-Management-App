import Link from "next/link";
import { Plus } from "lucide-react";
import { getContext, branchScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, EmptyState, LinkButton, PageHeader, StatCard, Table } from "@/components/ui";
import { fmtDate, money, round2 } from "@/lib/utils";

export const metadata = { title: "Purchases" };

export default async function PurchasesPage() {
  const ctx = await getContext();
  const purchases = await db.purchase.findMany({ where: { orgId: ctx.orgId, ...branchScope(ctx) }, include: { supplier: true, branch: true, items: true }, orderBy: { date: "desc" }, take: 200 });
  const unpaid = round2(purchases.filter((p) => p.paymentStatus === "UNPAID").reduce((s, p) => s + p.baseTotal, 0));
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const month = round2(purchases.filter((p) => p.date >= monthStart).reduce((s, p) => s + p.baseTotal, 0));

  return (
    <>
      <PageHeader title="Purchases" subtitle="Stock and consumables bought from suppliers and labs" actions={<LinkButton href="/app/purchases/new"><Plus size={16} /> New purchase</LinkButton>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Purchases this month" value={money(month, ctx.org.baseCurrency)} />
        <StatCard label="Owed to suppliers" value={money(unpaid, ctx.org.baseCurrency)} accent="amber" />
      </div>
      <Card>
        {purchases.length ? (
          <Table>
            <thead><tr><th>Purchase</th><th>Date</th><th>Supplier</th><th>Items</th>{!ctx.branchId && <th>Branch</th>}<th>Status</th><th className="num">Total</th></tr></thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/app/purchases/${p.id}`} className="font-semibold text-brand-700">{p.purchaseNo}</Link><span className="block text-xs text-slate-400">{p.supplierInvoiceNo}</span></td>
                  <td>{fmtDate(p.date)}</td>
                  <td>{p.supplier?.name ?? "—"}</td>
                  <td className="max-w-72 truncate text-xs text-slate-500">{p.items.map((i) => `${i.quantity}× ${i.description}`).join(", ")}</td>
                  {!ctx.branchId && <td className="text-slate-500">{p.branch.name}</td>}
                  <td><Badge tone={p.paymentStatus === "PAID" ? "green" : "amber"}>{p.paymentStatus === "PAID" ? "Paid" : "Unpaid"}</Badge></td>
                  <td className="num font-semibold">{money(p.total, p.currency)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No purchases yet" text="Record frames, lenses and consumables you buy so stock and costs stay accurate." action={<LinkButton href="/app/purchases/new">Record a purchase</LinkButton>} />
        )}
      </Card>
    </>
  );
}
