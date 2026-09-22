import Link from "next/link";
import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { PAYMENT_METHODS } from "@/lib/constants";
import { cn, fullName, isoDate, money } from "@/lib/utils";
import { createReceipt } from "../actions";
import { CashSaleForm } from "./cash-sale-form";

export const metadata = { title: "New receipt" };

export default async function NewReceipt({ searchParams }: { searchParams: Promise<{ orderId?: string; patientId?: string; mode?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const mode = sp.mode === "order" || sp.orderId ? "order" : "sale";
  const currencies = await db.currency.findMany({ where: { orgId: ctx.orgId, active: true }, orderBy: { isBase: "desc" } });
  const qs = (m: string) => `?mode=${m}${sp.patientId ? `&patientId=${sp.patientId}` : ""}`;

  const tabs = (
    <div className="mb-6 flex gap-2">
      {[
        ["sale", "Cash sale", "Frames, lenses, repairs, cases… paid for today"],
        ["order", "Payment on an order", "Deposit or balance on an existing order"],
      ].map(([v, l, d]) => (
        <Link key={v} href={qs(v)} className={cn("rounded-xl border px-4 py-2.5", mode === v ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white hover:bg-slate-50")}>
          <span className={cn("block text-sm font-semibold", mode === v ? "text-brand-800" : "text-slate-700")}>{l}</span>
          <span className="block text-xs text-slate-500">{d}</span>
        </Link>
      ))}
    </div>
  );

  if (mode === "sale") {
    const [patients, products] = await Promise.all([
      db.patient.findMany({ where: { orgId: ctx.orgId }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true, patientNo: true, phone: true } }),
      db.product.findMany({ where: { orgId: ctx.orgId, active: true, category: { not: "CONSUMABLE" } }, include: { stock: true }, orderBy: { name: "asc" } }),
    ]);
    return (
      <>
        <PageHeader title="New receipt" subtitle="Record what the patient is paying for" back={{ href: "/app/receipts", label: "Receipts" }} />
        {tabs}
        <CashSaleForm
          patients={patients.map((p) => ({ id: p.id, label: `${fullName(p)} · ${p.patientNo}${p.phone ? ` · ${p.phone}` : ""}` }))}
          products={products.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            sellPrice: p.sellPrice,
            stock: p.stock.filter((s) => s.branchId === ctx.workingBranchId).reduce((a, s) => a + s.quantity, 0),
            detail: [p.colour && p.category !== "FRAME" ? p.colour : null, p.reference && `ref ${p.reference}`, p.lensIndex, p.coating].filter(Boolean).join(" · "),
          }))}
          currencies={currencies.map((c) => ({ code: c.code, rate: c.rate }))}
          baseCurrency={ctx.org.baseCurrency}
          vatRate={ctx.org.vatRate}
          consultationFee={ctx.org.consultationFee}
          defaultPatientId={sp.patientId}
          today={isoDate(new Date())}
        />
      </>
    );
  }

  const openOrders = await db.order.findMany({
    where: { orgId: ctx.orgId, status: { notIn: ["CANCELLED"] }, ...(sp.patientId ? { patientId: sp.patientId } : {}) },
    include: { patient: true, items: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const owing = openOrders.filter((o) => o.patientPortion - o.amountPaid > 0.009);

  return (
    <>
      <PageHeader title="New receipt" subtitle="Record a payment against an existing order" back={{ href: "/app/receipts", label: "Receipts" }} />
      {tabs}
      <Card className="max-w-2xl">
        <form action={createReceipt} className="grid gap-4 p-6 sm:grid-cols-2">
          <Field label="Order being paid for" className="sm:col-span-2" hint="Only orders with a balance are listed. The items on the order are shown on the receipt.">
            <Select
              name="orderId"
              required
              defaultValue={sp.orderId ?? ""}
              placeholder="Select order…"
              options={owing.map((o) => ({
                value: o.id,
                label: `${o.orderNo} · ${fullName(o.patient)} · ${o.items.map((i) => i.description).join(", ").slice(0, 60)} · balance ${money(o.patientPortion - o.amountPaid, o.currency)}`,
              }))}
            />
          </Field>
          <Field label="Date"><Input type="date" name="date" defaultValue={isoDate(new Date())} /></Field>
          <Field label="Method"><Select name="method" options={PAYMENT_METHODS} /></Field>
          <Field label="Amount"><Input type="number" name="amount" step="0.01" min="0.01" required /></Field>
          <Field label="Currency"><Select name="currency" options={currencies.map((c) => ({ value: c.code, label: `${c.code} (rate ${c.rate})` }))} /></Field>
          <Field label="Reference" className="sm:col-span-2"><Input name="reference" placeholder="EcoCash confirmation, POS slip, bank ref…" /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" rows={2} /></Field>
          <div className="sm:col-span-2"><SubmitButton>Save receipt</SubmitButton></div>
        </form>
      </Card>
    </>
  );
}
