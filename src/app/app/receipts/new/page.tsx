import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { PAYMENT_METHODS } from "@/lib/constants";
import { fullName, isoDate, money } from "@/lib/utils";
import { createReceipt } from "../actions";

export const metadata = { title: "New receipt" };

export default async function NewReceipt({ searchParams }: { searchParams: Promise<{ orderId?: string; patientId?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const [currencies, openOrders] = await Promise.all([
    db.currency.findMany({ where: { orgId: ctx.orgId, active: true }, orderBy: { isBase: "desc" } }),
    db.order.findMany({
      where: { orgId: ctx.orgId, status: { notIn: ["CANCELLED"] }, ...(sp.patientId ? { patientId: sp.patientId } : {}) },
      include: { patient: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);
  const owing = openOrders.filter((o) => o.patientPortion - o.amountPaid > 0.009);

  return (
    <>
      <PageHeader title="New receipt" subtitle="Record a payment from a patient" back={{ href: "/app/receipts", label: "Receipts" }} />
      <Card className="max-w-2xl">
        <form action={createReceipt} className="grid gap-4 p-6 sm:grid-cols-2">
          <Field label="Against order" className="sm:col-span-2" hint="Leave blank to record an unallocated deposit">
            <Select
              name="orderId"
              defaultValue={sp.orderId ?? ""}
              placeholder="No order (deposit)"
              options={owing.map((o) => ({ value: o.id, label: `${o.orderNo} · ${fullName(o.patient)} · balance ${money(o.patientPortion - o.amountPaid, o.currency)}` }))}
            />
          </Field>
          <Field label="Date"><Input type="date" name="date" defaultValue={isoDate(new Date())} /></Field>
          <Field label="Method"><Select name="method" options={PAYMENT_METHODS} /></Field>
          <Field label="Amount"><Input type="number" name="amount" step="0.01" min="0.01" required /></Field>
          <Field label="Currency"><Select name="currency" options={currencies.map((c) => ({ value: c.code, label: `${c.code} (rate ${c.rate})` }))} /></Field>
          <Field label="Reference" className="sm:col-span-2"><Input name="reference" placeholder="EcoCash confirmation, POS slip, bank ref…" /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" rows={2} /></Field>
          {sp.patientId && <input type="hidden" name="patientId" value={sp.patientId} />}
          <div className="sm:col-span-2"><SubmitButton>Save receipt</SubmitButton></div>
        </form>
      </Card>
    </>
  );
}
