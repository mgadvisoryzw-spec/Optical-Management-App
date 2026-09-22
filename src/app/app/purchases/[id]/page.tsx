import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, CardHeader, PageHeader, Select, Table } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { PAYMENT_METHODS, PRODUCT_CATEGORIES, labelOf } from "@/lib/constants";
import { fmtDate, money } from "@/lib/utils";
import { paySupplier } from "../actions";

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const p = await db.purchase.findFirst({ where: { id, orgId: ctx.orgId }, include: { supplier: true, branch: true, items: { include: { product: true } } } });
  if (!p) notFound();
  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">{p.purchaseNo} <Badge tone={p.paymentStatus === "PAID" ? "green" : "amber"}>{p.paymentStatus === "PAID" ? "Paid" : "Unpaid"}</Badge></span>}
        subtitle={`${p.supplier?.name ?? "No supplier"} · ${fmtDate(p.date)} · ${p.branch.name}${p.supplierInvoiceNo ? ` · inv ${p.supplierInvoiceNo}` : ""}`}
        back={{ href: "/app/purchases", label: "Purchases" }}
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <Table>
            <thead><tr><th>Item</th><th>Category</th><th>Stock</th><th className="num">Qty</th><th className="num">Unit cost</th><th className="num">Total</th></tr></thead>
            <tbody>
              {p.items.map((i) => (
                <tr key={i.id}>
                  <td className="font-medium">{i.description}</td>
                  <td>{labelOf(PRODUCT_CATEGORIES, i.category)}</td>
                  <td>{i.product?.trackStock ? <Badge tone="green">Added to stock</Badge> : <Badge>Expensed</Badge>}</td>
                  <td className="num">{i.quantity}</td>
                  <td className="num">{money(i.unitCost, p.currency)}</td>
                  <td className="num font-semibold">{money(i.lineTotal, p.currency)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="flex justify-end gap-8 p-5 text-sm">
            {p.currency !== ctx.org.baseCurrency && <span className="text-slate-500">{money(p.baseTotal, ctx.org.baseCurrency)} @ {p.exchangeRate}</span>}
            <span className="text-lg font-bold">{money(p.total, p.currency)}</span>
          </div>
        </Card>
        {p.paymentStatus === "UNPAID" && (
          <Card>
            <CardHeader title="Pay supplier" subtitle={money(p.total, p.currency)} />
            <form action={paySupplier.bind(null, p.id)} className="space-y-3 p-5">
              <Select name="method" defaultValue="BANK_TRANSFER" options={PAYMENT_METHODS} />
              <SubmitButton className="w-full">Record payment</SubmitButton>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
