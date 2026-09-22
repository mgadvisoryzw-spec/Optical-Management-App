import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { CLAIM_STATUSES, PAYMENT_METHODS, labelOf, toneOf } from "@/lib/constants";
import { fmtDate, fullName, money } from "@/lib/utils";
import { authoriseClaim, claimPayment, rejectClaim, submitClaim } from "../actions";

export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const c = await db.medicalAidClaim.findFirst({ where: { id, orgId: ctx.orgId }, include: { patient: true, medicalAid: true, order: { include: { items: true } } } });
  if (!c) notFound();
  const outstanding = c.amount - c.paidAmount;
  const open = !["PAID", "REJECTED"].includes(c.status);

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">{c.claimNo} <Badge tone={toneOf(CLAIM_STATUSES, c.status)}>{labelOf(CLAIM_STATUSES, c.status)}</Badge></span>}
        subtitle={`${c.medicalAid.name} · ${fullName(c.patient)} · member ${c.memberNo ?? "—"}`}
        back={{ href: "/app/medical-aid", label: "Claims" }}
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Claim summary" />
            <dl className="grid gap-4 p-5 text-sm sm:grid-cols-3">
              <div><dt className="label">Order</dt><dd><Link className="font-semibold text-brand-700" href={`/app/orders/${c.orderId}`}>{c.order.orderNo}</Link></dd></div>
              <div><dt className="label">Order total</dt><dd>{money(c.order.total, c.order.currency)}</dd></div>
              <div><dt className="label">Claimed</dt><dd className="font-semibold">{money(c.amount, c.currency)}</dd></div>
              <div><dt className="label">Paid by funder</dt><dd>{money(c.paidAmount, c.currency)}</dd></div>
              <div><dt className="label">Outstanding</dt><dd className="font-semibold text-amber-600">{money(outstanding, c.currency)}</dd></div>
              <div><dt className="label">Shortfall</dt><dd>{money(c.shortfall, c.currency)}</dd></div>
              <div><dt className="label">Auth number</dt><dd>{c.authNumber ?? "—"}</dd></div>
              <div><dt className="label">Submitted</dt><dd>{fmtDate(c.submittedAt)}</dd></div>
              <div><dt className="label">Last payment</dt><dd>{fmtDate(c.paidAt)}</dd></div>
            </dl>
            <div className="border-t border-slate-100 p-5">
              <p className="label">Items on claim</p>
              <ul className="text-sm text-slate-600">
                {c.order.items.map((i) => <li key={i.id}>• {i.description} × {i.quantity} — {money(i.lineTotal, c.order.currency)}</li>)}
              </ul>
            </div>
            {c.notes && <p className="border-t border-slate-100 p-5 text-sm text-slate-600">{c.notes}</p>}
          </Card>
        </div>
        <div className="space-y-6">
          {c.status === "PENDING_AUTH" && (
            <Card>
              <CardHeader title="1. Record authorisation" subtitle="When the funder approves the quote" />
              <form action={authoriseClaim.bind(null, c.id)} className="space-y-3 p-5">
                <Field label="Authorisation number"><Input name="authNumber" required /></Field>
                <Field label="Approved amount" hint="If the funder approves less, the rest is added to the patient's portion"><Input name="approvedAmount" type="number" step="0.01" defaultValue={c.amount} /></Field>
                <SubmitButton className="w-full">Authorise & confirm order</SubmitButton>
              </form>
            </Card>
          )}
          {c.status === "AUTHORISED" && (
            <Card>
              <CardHeader title="2. Submit claim" subtitle="After dispensing, send the claim to the funder" />
              <form action={submitClaim.bind(null, c.id)} className="p-5"><SubmitButton className="w-full">Mark as submitted</SubmitButton></form>
            </Card>
          )}
          {open && c.status !== "PENDING_AUTH" && (
            <Card>
              <CardHeader title="3. Record remittance" subtitle="Payment received from the funder" />
              <form action={claimPayment.bind(null, c.id)} className="space-y-3 p-5">
                <Field label={`Amount received (${c.currency})`}><Input name="amount" type="number" step="0.01" min="0" defaultValue={outstanding.toFixed(2)} /></Field>
                <Field label="Received into"><Select name="method" defaultValue="BANK_TRANSFER" options={PAYMENT_METHODS} /></Field>
                <Field label="Remittance ref"><Input name="reference" /></Field>
                <Field label="If paid less than claimed">
                  <Select name="remainder" options={[{ value: "KEEP_OPEN", label: "Keep the rest open (more to come)" }, { value: "BILL_PATIENT", label: "Bill the shortfall to the patient" }, { value: "WRITE_OFF", label: "Write off the shortfall" }]} />
                </Field>
                <SubmitButton className="w-full">Record remittance</SubmitButton>
              </form>
            </Card>
          )}
          {open && (
            <Card>
              <CardHeader title="Reject claim" />
              <form action={rejectClaim.bind(null, c.id)} className="space-y-3 p-5">
                <Field label="Reason"><Textarea name="notes" rows={2} /></Field>
                <ConfirmButton variant="danger" className="w-full" message="Reject this claim? The whole amount will be billed to the patient.">Reject & bill patient</ConfirmButton>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
