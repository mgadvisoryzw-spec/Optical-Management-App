import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Table } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { money, round2 } from "@/lib/utils";
import { createSupplier } from "../purchases/actions";

export const metadata = { title: "Suppliers & labs" };

export default async function SuppliersPage() {
  const ctx = await getContext();
  const suppliers = await db.supplier.findMany({ where: { orgId: ctx.orgId }, include: { purchases: true, _count: { select: { products: true } } }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Suppliers & labs" subtitle="Frame distributors, lens labs and consumables suppliers" />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <Table>
            <thead><tr><th>Supplier</th><th>Contact</th><th>Type</th><th className="num">Products</th><th className="num">Purchased</th><th className="num">Owed</th></tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td className="font-semibold">{s.name}</td>
                  <td className="text-sm">{s.contactName ?? "—"}<span className="block text-xs text-slate-400">{[s.phone, s.email].filter(Boolean).join(" · ")}</span></td>
                  <td>{s.isLab ? <Badge tone="violet">Lab</Badge> : <Badge>Supplier</Badge>}</td>
                  <td className="num">{s._count.products}</td>
                  <td className="num">{money(round2(s.purchases.reduce((a, p) => a + p.baseTotal, 0)))}</td>
                  <td className="num font-semibold text-amber-600">{money(round2(s.purchases.filter((p) => p.paymentStatus === "UNPAID").reduce((a, p) => a + p.baseTotal, 0)))}</td>
                </tr>
              ))}
              {!suppliers.length && <tr><td colSpan={6} className="py-10 text-center text-slate-400">No suppliers yet.</td></tr>}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Add supplier" />
          <form action={createSupplier} className="space-y-3 p-5">
            <Field label="Name *"><Input name="name" required /></Field>
            <Field label="Contact person"><Input name="contactName" /></Field>
            <Field label="Phone"><Input name="phone" /></Field>
            <Field label="Email"><Input name="email" type="email" /></Field>
            <Field label="Address"><Input name="address" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isLab" className="h-4 w-4 accent-brand-600" /> This is a lens lab / glazing service</label>
            <SubmitButton className="w-full">Add supplier</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
