import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Alert, Badge, Card, CardHeader, Field, Input, LinkButton, PageHeader, Select, Textarea } from "@/components/ui";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { CLAIM_STATUSES, PAYMENT_METHODS, can, labelOf, toneOf } from "@/lib/constants";
import { DeleteButton } from "@/components/delete-button";
import { fmtDate, fullName, isoDate, money } from "@/lib/utils";
import { authoriseClaim, claimPayment, rejectClaim, submitClaim, updateClaim } from "../actions";

export default async function ClaimPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
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
        actions={
          <>
            <LinkButton variant="secondary" href={`/app/orders/${c.orderId}/edit`}>Edit order items</LinkButton>
            {can(ctx.user.role, "delete") && (
              <DeleteButton
                kind="claim"
                id={c.id}
                back={`/app/medical-aid/${c.id}`}
                confirm={`Permanently delete ${c.claimNo}? The whole of ${c.order.orderNo} becomes the patient's responsibility${c.paidAmount > 0 ? ", and the medical aid payments on this claim are removed from your books" : ""}. This cannot be undone.`}
              />
            )}
          </>
        }
      />
      {sp.saved && <div className="mb-4"><Alert tone="green">Claim updated.</Alert></div>}
      {sp.error && <div className="mb-4"><Alert tone="red">{sp.error}</Alert></div>}
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

          <Card id="edit">
            <CardHeader title="Edit claim details" subtitle="Correct the member number, authorisation, amount claimed or status" />
            <form action={updateClaim.bind(null, c.id)} className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Member number"><Input name="memberNo" defaultValue={c.memberNo ?? ""} /></Field>
              <Field label="Authorisation number"><Input name="authNumber" defaultValue={c.authNumber ?? ""} /></Field>
              <Field label={`Amount claimed (${c.currency})`} hint={`The rest of the order (${money(c.order.total, c.order.currency)}) is billed to the patient. Can't be less than already paid (${money(c.paidAmount, c.currency)}).`}>
                <Input name="amount" type="number" step="0.01" min={c.paidAmount} max={c.order.total} defaultValue={c.amount} required />
              </Field>
              <Field label="Status" hint={["PAID", "PART_PAID", "REJECTED"].includes(c.status) ? "Set automatically by remittances" : undefined}>
                {["PENDING_AUTH", "AUTHORISED", "SUBMITTED"].includes(c.status) ? (
                  <Select name="status" defaultValue={c.status} options={CLAIM_STATUSES.filter((s) => ["PENDING_AUTH", "AUTHORISED", "SUBMITTED"].includes(s.value)).map((s) => ({ value: s.value, label: s.label }))} />
                ) : (
                  <>
                    <input type="hidden" name="status" value={c.status} />
                    <Input value={labelOf(CLAIM_STATUSES, c.status)} disabled />
                  </>
                )}
              </Field>
              <Field label="Date submitted"><Input name="submittedAt" type="date" defaultValue={isoDate(c.submittedAt)} /></Field>
              <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" rows={2} defaultValue={c.notes ?? ""} /></Field>
              <div className="sm:col-span-2"><SubmitButton>Save claim</SubmitButton></div>
            </form>
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
