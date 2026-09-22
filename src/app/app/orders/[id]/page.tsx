import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, FileText, MessageCircle, Pencil } from "lucide-react";
import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Alert, Badge, Card, CardHeader, Field, Input, LinkButton, PageHeader, Select, Table } from "@/components/ui";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { RxTable } from "@/components/rx-table";
import { CLAIM_STATUSES, ORDER_STATUSES, PAYMENT_METHODS, SALE_CATEGORIES, can, labelOf, toneOf } from "@/lib/constants";
import { DeleteButton } from "@/components/delete-button";
import { orderCredit } from "@/lib/deletion";
import { refundAction } from "../../record-actions";
import { cn, fmtDate, fullName, money } from "@/lib/utils";
import { addOrderPayment, setOrderStatus } from "../actions";

const PIPELINE = ["QUOTE", "AWAITING_AUTH", "ORDERED", "IN_LAB", "READY", "COLLECTED"];
const NEXT: Record<string, { status: string; label: string }[]> = {
  QUOTE: [{ status: "ORDERED", label: "Confirm order" }],
  AWAITING_AUTH: [{ status: "ORDERED", label: "Medical aid approved – confirm" }],
  ORDERED: [{ status: "IN_LAB", label: "Sent to lab" }, { status: "READY", label: "Mark ready" }],
  IN_LAB: [{ status: "READY", label: "Back from lab – ready" }],
  READY: [{ status: "COLLECTED", label: "Patient collected" }],
};

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ wa?: string; saved?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await getContext();
  const o = await db.order.findFirst({
    where: { id, orgId: ctx.orgId },
    include: { patient: true, branch: true, items: true, prescription: true, medicalAid: true, receipts: { orderBy: { date: "desc" } }, claims: true },
  });
  if (!o) notFound();
  const currencies = await db.currency.findMany({ where: { orgId: ctx.orgId, active: true } });
  const balance = o.patientPortion - o.amountPaid;
  const credit = orderCredit(o);
  const canDelete = can(ctx.user.role, "delete");
  const step = PIPELINE.indexOf(o.status);
  const claim = o.claims[0];

  return (
    <div className="space-y-6">
      {sp.saved && <Alert tone="green">Order updated.{o.invoicedAt ? " Your books and stock have been adjusted to match." : ""}</Alert>}
      {sp.wa && (
        <Alert tone="green">
          Order marked ready. <a href={sp.wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold underline"><MessageCircle size={14} /> Open WhatsApp to send the message</a>
        </Alert>
      )}
      <PageHeader
        title={<span className="flex items-center gap-3">{o.orderNo} <Badge tone={toneOf(ORDER_STATUSES, o.status)}>{labelOf(ORDER_STATUSES, o.status)}</Badge></span>}
        subtitle={<><Link className="font-semibold text-brand-700" href={`/app/patients/${o.patientId}`}>{fullName(o.patient)}</Link> · {o.branch.name} · created {fmtDate(o.createdAt)}</>}
        back={{ href: "/app/orders", label: "Orders" }}
        actions={
          <>
            {o.status !== "CANCELLED" && <LinkButton href={`/app/orders/${o.id}/edit`}><Pencil size={15} /> Edit order</LinkButton>}
            <LinkButton variant="secondary" href={`/app/orders/${o.id}/print?doc=invoice`}><FileText size={15} /> {o.status === "QUOTE" ? "Quotation" : "Invoice"}</LinkButton>
            <LinkButton variant="secondary" href={`/app/orders/${o.id}/print?doc=job`}><FileText size={15} /> Job card</LinkButton>
            {canDelete && (
              <DeleteButton
                kind="order"
                id={o.id}
                back={`/app/orders/${o.id}`}
                confirm={`Permanently delete ${o.orderNo}? Its ${o.receipts.length} receipt(s)${o.claims.length ? ` and medical aid claim` : ""} are deleted too, the entries are removed from your books and any stock is returned. This cannot be undone. To keep a record, use Cancel order instead.`}
              />
            )}
          </>
        }
      />

      {/* Pipeline */}
      {o.status !== "CANCELLED" && (
        <Card className="p-5">
          <ol className="flex items-center">
            {PIPELINE.filter((s) => s !== "AWAITING_AUTH" || o.medicalAidId).map((s, i, arr) => {
              const idx = PIPELINE.indexOf(s);
              const done = idx < step || o.status === "COLLECTED";
              const current = s === o.status;
              return (
                <li key={s} className={cn("flex items-center", i < arr.length - 1 && "flex-1")}>
                  <div className="flex flex-col items-center gap-1.5">
                    <span className={cn("grid h-8 w-8 place-items-center rounded-full text-xs font-bold", done ? "bg-brand-600 text-white" : current ? "bg-ink-900 text-white ring-4 ring-brand-100" : "bg-slate-100 text-slate-400")}>
                      {done ? <Check size={15} /> : i + 1}
                    </span>
                    <span className={cn("whitespace-nowrap text-[11px] font-semibold", current ? "text-slate-900" : "text-slate-400")}>{labelOf(ORDER_STATUSES, s)}</span>
                  </div>
                  {i < arr.length - 1 && <span className={cn("mx-2 mb-5 h-0.5 flex-1 rounded", done ? "bg-brand-500" : "bg-slate-200")} />}
                </li>
              );
            })}
          </ol>
          {NEXT[o.status] && (
            <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-5">
              {NEXT[o.status].map((n) => (
                <form key={n.status} action={setOrderStatus.bind(null, o.id)} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="status" value={n.status} />
                  {n.status === "IN_LAB" && <Input name="labReference" placeholder="Lab job / ref no." className="w-44" defaultValue={o.labReference ?? ""} />}
                  {n.status === "READY" && (
                    <span className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <input type="checkbox" name="notify" defaultChecked className="accent-brand-600" /> Notify via
                      <select name="channel" className="bg-transparent font-semibold outline-none">
                        <option value="WHATSAPP">WhatsApp</option>
                        <option value="SMS">SMS</option>
                      </select>
                    </span>
                  )}
                  <SubmitButton>{n.label}</SubmitButton>
                </form>
              ))}
              <form action={setOrderStatus.bind(null, o.id)} className="ml-auto">
                <input type="hidden" name="status" value="CANCELLED" />
                <ConfirmButton variant="ghost" message={o.invoicedAt ? "Cancel this order? The sale will be reversed in your books and any stock returned." : "Cancel this quote?"}>Cancel order</ConfirmButton>
              </form>
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Items" subtitle={`${o.currency}${o.currency !== ctx.org.baseCurrency ? ` @ ${o.exchangeRate} per ${ctx.org.baseCurrency}` : ""}`} />
            <Table>
              <thead><tr><th>Description</th><th>Category</th><th>Eye</th><th className="num">Qty</th><th className="num">Unit</th><th className="num">Total</th></tr></thead>
              <tbody>
                {o.items.map((i) => (
                  <tr key={i.id}>
                    <td className="font-medium">{i.description}</td>
                    <td className="text-slate-500">{labelOf(SALE_CATEGORIES, i.category)}</td>
                    <td>{i.eye ?? "—"}</td>
                    <td className="num">{i.quantity}</td>
                    <td className="num">{money(i.unitPrice, o.currency)}</td>
                    <td className="num font-semibold">{money(i.lineTotal, o.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <dl className="ml-auto max-w-xs space-y-1.5 p-5 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{money(o.subtotal, o.currency)}</dd></div>
              {o.discount > 0 && <div className="flex justify-between"><dt className="text-slate-500">Discount</dt><dd>-{money(o.discount, o.currency)}</dd></div>}
              {o.tax > 0 && <div className="flex justify-between"><dt className="text-slate-500">VAT ({o.taxRate}%)</dt><dd>{money(o.tax, o.currency)}</dd></div>}
              <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold"><dt>Total</dt><dd>{money(o.total, o.currency)}</dd></div>
              {o.medicalAidPortion > 0 && <div className="flex justify-between text-slate-500"><dt>{o.medicalAid?.name} portion</dt><dd>{money(o.medicalAidPortion, o.currency)}</dd></div>}
              <div className="flex justify-between"><dt className="text-slate-500">Patient portion</dt><dd>{money(o.patientPortion, o.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Paid</dt><dd>{money(o.amountPaid, o.currency)}</dd></div>
              {credit > 0.009 ? (
                <div className="flex justify-between text-base font-bold text-violet-700"><dt>Owed to patient</dt><dd>{money(credit, o.currency)}</dd></div>
              ) : (
                <div className={cn("flex justify-between text-base font-bold", balance > 0.009 ? "text-amber-600" : "text-emerald-600")}><dt>Balance due</dt><dd>{money(o.status === "CANCELLED" ? 0 : balance, o.currency)}</dd></div>
              )}
            </dl>
          </Card>

          {o.prescription && (
            <Card>
              <CardHeader title="Prescription for this job" subtitle={`Exam ${fmtDate(o.prescription.examDate)}`} />
              <div className="p-5"><RxTable rx={o.prescription} /></div>
            </Card>
          )}

          <Card>
            <CardHeader title="Payments & refunds" />
            <Table>
              <thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th>Reference</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {o.receipts.map((r) => (
                  <tr key={r.id} className={r.voided ? "opacity-50 line-through" : ""}>
                    <td><Link href={`/app/receipts/${r.id}`} className="font-semibold text-brand-700">{r.receiptNo}</Link> {r.kind === "REFUND" && <Badge tone="violet">Refund</Badge>}</td>
                    <td>{fmtDate(r.date)}</td>
                    <td>{labelOf(PAYMENT_METHODS, r.method)}</td>
                    <td className="text-slate-500">{r.reference ?? "—"}</td>
                    <td className={cn("num", r.kind === "REFUND" && "text-violet-700")}>{money(r.kind === "REFUND" ? -r.amount : r.amount, r.currency)}</td>
                  </tr>
                ))}
                {!o.receipts.length && <tr><td colSpan={5} className="py-6 text-center text-slate-400">No payments yet.</td></tr>}
              </tbody>
            </Table>
          </Card>
        </div>

        <div className="space-y-6">
          {credit > 0.009 && (
            <Card className="border-violet-200">
              <CardHeader title="Refund the patient" subtitle={`The patient has paid ${money(credit, o.currency)} more than they owe${o.status === "CANCELLED" ? " on this cancelled order" : ""}`} />
              <form action={refundAction.bind(null, o.id)} className="space-y-3 p-5">
                <Field label={`Amount to refund (${o.currency})`}><Input name="amount" type="number" step="0.01" min="0.01" max={credit.toFixed(2)} defaultValue={credit.toFixed(2)} required /></Field>
                <Field label="Paid back via"><Select name="method" defaultValue="CASH" options={PAYMENT_METHODS} /></Field>
                <Field label="Reference"><Input name="reference" placeholder="EcoCash ref, cheque no…" /></Field>
                <Field label="Reason"><Input name="notes" placeholder="e.g. Price corrected, order cancelled" /></Field>
                <ConfirmButton message="Record this refund? The money is shown as paid out of the account you selected." variant="primary" className="w-full">Record refund</ConfirmButton>
              </form>
            </Card>
          )}
          {o.status !== "CANCELLED" && balance > 0.009 && (
            <Card>
              <CardHeader title="Take a payment" subtitle={`Balance ${money(balance, o.currency)}`} />
              <form action={addOrderPayment.bind(null, o.id)} className="space-y-3 p-5">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Amount"><Input name="amount" type="number" step="0.01" min="0.01" defaultValue={balance.toFixed(2)} required /></Field>
                  <Field label="Currency"><Select name="currency" defaultValue={o.currency} options={currencies.map((c) => ({ value: c.code, label: `${c.code} (${c.rate})` }))} /></Field>
                </div>
                <Field label="Method"><Select name="method" options={PAYMENT_METHODS} /></Field>
                <Field label="Reference" hint="EcoCash ref, POS slip or bank ref"><Input name="reference" /></Field>
                <SubmitButton className="w-full">Record payment</SubmitButton>
                <p className="text-xs text-slate-400">If the payment is in a different currency, it is converted at the rate currently set in Settings.</p>
              </form>
            </Card>
          )}

          {claim && (
            <Card>
              <CardHeader title="Medical aid claim" action={<Link href={`/app/medical-aid/${claim.id}`} className="text-xs font-semibold text-brand-700">Manage →</Link>} />
              <dl className="space-y-2 p-5 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Claim</dt><dd className="font-semibold">{claim.claimNo}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Funder</dt><dd>{o.medicalAid?.name}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Member no.</dt><dd>{claim.memberNo ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd><Badge tone={toneOf(CLAIM_STATUSES, claim.status)}>{labelOf(CLAIM_STATUSES, claim.status)}</Badge></dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Auth no.</dt><dd>{claim.authNumber ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Claimed / paid</dt><dd>{money(claim.amount, claim.currency)} / {money(claim.paidAmount, claim.currency)}</dd></div>
              </dl>
            </Card>
          )}

          <Card>
            <CardHeader title="Job details" />
            <dl className="space-y-2 p-5 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Lab</dt><dd>{o.labName ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Lab reference</dt><dd>{o.labReference ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Promised</dt><dd>{fmtDate(o.promisedDate)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Collected</dt><dd>{fmtDate(o.collectedAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Posted to ledger</dt><dd>{o.invoicedAt ? fmtDate(o.invoicedAt) : "Not yet (quote)"}</dd></div>
              {o.notes && <p className="border-t border-slate-100 pt-2 text-slate-600">{o.notes}</p>}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
