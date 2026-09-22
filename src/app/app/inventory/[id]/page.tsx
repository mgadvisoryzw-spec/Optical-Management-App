import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ProductForm } from "../product-form";
import { adjustStockAction, transferStockAction, updateProduct } from "../actions";
import { fmtDateTime, money } from "@/lib/utils";
import { can } from "@/lib/constants";
import { DeleteButton } from "@/components/delete-button";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const p = await db.product.findFirst({
    where: { id, orgId: ctx.orgId },
    include: { stock: { include: { branch: true } }, movements: { orderBy: { createdAt: "desc" }, take: 30, include: { branch: true } } },
  });
  if (!p) notFound();
  const suppliers = await db.supplier.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const total = p.stock.reduce((s, x) => s + x.quantity, 0);
  const branchOpts = ctx.branches.map((b) => ({ value: b.id, label: b.name }));

  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={`${p.sku} · ${total} on hand across all branches`}
        back={{ href: "/app/inventory", label: "Inventory" }}
        actions={can(ctx.user.role, "delete") && <DeleteButton kind="product" id={p.id} back={`/app/inventory/${p.id}`} confirm={`Permanently delete ${p.name}? Only items that have never been bought or sold can be deleted. This cannot be undone.`} />}
      />
      {p.trackStock && (
        <div className="mb-6 grid gap-6 xl:grid-cols-3">
          <Card>
            <CardHeader title="Stock by branch" />
            <ul className="divide-y divide-slate-100 text-sm">
              {ctx.branches.map((b) => {
                const q = p.stock.find((s) => s.branchId === b.id)?.quantity ?? 0;
                return (
                  <li key={b.id} className="flex items-center justify-between px-5 py-3">
                    <span>{b.name}</span>
                    <Badge tone={q <= 0 ? "red" : q <= p.reorderLevel ? "amber" : "green"}>{q} {p.unit}</Badge>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Adjust stock" subtitle="After a stock count, or for damage or loss. Posted to the ledger at cost." />
            <form action={adjustStockAction.bind(null, p.id)} className="space-y-3 p-5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Branch"><Select name="branchId" defaultValue={ctx.workingBranchId} options={branchOpts} /></Field>
                <Field label="Qty (+/−)"><Input name="qty" type="number" step="1" required placeholder="-1" /></Field>
              </div>
              <Field label="Reason"><Select name="reason" options={["Stock count", "Damaged", "Lost / stolen", "Found", "Opening stock", "Returned to supplier"].map((r) => ({ value: r, label: r }))} /></Field>
              <SubmitButton variant="secondary" className="w-full">Post adjustment</SubmitButton>
            </form>
          </Card>
          {ctx.branches.length > 1 && (
            <Card>
              <CardHeader title="Transfer between branches" />
              <form action={transferStockAction.bind(null, p.id)} className="space-y-3 p-5">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="From"><Select name="fromBranchId" defaultValue={ctx.workingBranchId} options={branchOpts} /></Field>
                  <Field label="To"><Select name="toBranchId" options={branchOpts} /></Field>
                </div>
                <Field label="Quantity"><Input name="qty" type="number" min="1" step="1" required /></Field>
                <Field label="Note"><Input name="note" /></Field>
                <SubmitButton variant="secondary" className="w-full">Transfer</SubmitButton>
              </form>
            </Card>
          )}
        </div>
      )}
      <ProductForm action={updateProduct.bind(null, p.id)} product={p} suppliers={suppliers} baseCurrency={ctx.org.baseCurrency} />
      <Card className="mt-6">
        <CardHeader title="Stock movements" subtitle="Latest 30" />
        <Table>
          <thead><tr><th>Date</th><th>Type</th><th>Branch</th><th>Reference</th><th className="num">Qty</th><th className="num">Unit cost</th></tr></thead>
          <tbody>
            {p.movements.map((m) => (
              <tr key={m.id}>
                <td>{fmtDateTime(m.createdAt)}</td>
                <td><Badge tone={m.quantity > 0 ? "green" : "slate"}>{m.type.replace("_", " ").toLowerCase()}</Badge></td>
                <td>{m.branch.name}</td>
                <td className="text-slate-500">{m.reference ?? m.note ?? "—"}</td>
                <td className={`num font-semibold ${m.quantity > 0 ? "text-emerald-600" : "text-slate-700"}`}>{m.quantity > 0 ? "+" : ""}{m.quantity}</td>
                <td className="num">{money(m.unitCost)}</td>
              </tr>
            ))}
            {!p.movements.length && <tr><td colSpan={6} className="py-6 text-center text-slate-400">No movements yet.</td></tr>}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
