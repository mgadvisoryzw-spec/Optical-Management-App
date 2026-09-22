import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { PrintButton } from "@/components/client";
import { LinkButton } from "@/components/ui";
import { RxTable } from "@/components/rx-table";
import { PAYMENT_METHODS, labelOf } from "@/lib/constants";
import { fmtDate, fullName, money } from "@/lib/utils";

export default async function PrintOrder({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string }> }) {
  const { id } = await params;
  const { doc = "invoice" } = await searchParams;
  const ctx = await getContext();
  const o = await db.order.findFirst({
    where: { id, orgId: ctx.orgId },
    include: { patient: true, branch: true, items: true, prescription: true, medicalAid: true, receipts: { where: { voided: false } } },
  });
  if (!o) notFound();
  const isJob = doc === "job";
  const title = isJob ? "Job card" : o.status === "QUOTE" ? "Quotation" : "Tax invoice";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex justify-between">
        <LinkButton variant="ghost" href={`/app/orders/${o.id}`}>← Back to order</LinkButton>
        <PrintButton label={`Print ${title.toLowerCase()}`} />
      </div>
      <div className="print-area rounded-2xl border border-slate-200 bg-white p-10 text-sm shadow-sm">
        <div className="flex items-start justify-between border-b border-slate-200 pb-6">
          <div>
            <h1 className="text-xl font-bold">{ctx.org.name}</h1>
            <p className="text-slate-500">{o.branch.name}{o.branch.address ? `, ${o.branch.address}` : ""}</p>
            <p className="text-slate-500">{[o.branch.phone ?? ctx.org.phone, ctx.org.email].filter(Boolean).join(" · ")}</p>
            {ctx.org.taxNumber && <p className="text-slate-500">VAT/BP No: {ctx.org.taxNumber}</p>}
          </div>
          <div className="text-right">
            <p className="text-lg font-bold uppercase tracking-wider text-brand-700">{title}</p>
            <p>No: <b>{o.orderNo}</b></p>
            <p>Date: {fmtDate(o.createdAt)}</p>
            {o.promisedDate && <p>Promised: {fmtDate(o.promisedDate)}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 py-5">
          <div>
            <p className="label">Patient</p>
            <p className="font-semibold">{fullName(o.patient)}</p>
            <p className="text-slate-500">{o.patient.patientNo} · {o.patient.phone}</p>
          </div>
          <div>
            <p className="label">Funder</p>
            <p className="font-semibold">{o.medicalAid?.name ?? "Private"}</p>
            {o.medicalAid && <p className="text-slate-500">Member no: {o.patient.medicalAidNo ?? "—"}</p>}
          </div>
        </div>

        {isJob && o.prescription && (
          <div className="mb-5">
            <p className="label">Prescription ({fmtDate(o.prescription.examDate)})</p>
            <RxTable rx={o.prescription} />
          </div>
        )}

        <table className="w-full">
          <thead className="border-y border-slate-200 text-left text-xs uppercase text-slate-500">
            <tr><th className="py-2">Item</th><th>Eye</th><th className="text-right">Qty</th>{!isJob && <><th className="text-right">Unit</th><th className="text-right">Amount</th></>}</tr>
          </thead>
          <tbody>
            {o.items.map((i) => (
              <tr key={i.id} className="border-b border-slate-100">
                <td className="py-2">{i.description}</td>
                <td>{i.eye ?? ""}</td>
                <td className="text-right">{i.quantity}</td>
                {!isJob && <><td className="text-right">{money(i.unitPrice, o.currency)}</td><td className="text-right">{money(i.lineTotal, o.currency)}</td></>}
              </tr>
            ))}
          </tbody>
        </table>

        {!isJob ? (
          <dl className="ml-auto mt-4 max-w-xs space-y-1">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(o.subtotal, o.currency)}</dd></div>
            {o.discount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>-{money(o.discount, o.currency)}</dd></div>}
            {o.tax > 0 && <div className="flex justify-between"><dt>VAT {o.taxRate}%</dt><dd>{money(o.tax, o.currency)}</dd></div>}
            <div className="flex justify-between border-t border-slate-300 pt-1 font-bold"><dt>Total</dt><dd>{money(o.total, o.currency)}</dd></div>
            {o.medicalAidPortion > 0 && <div className="flex justify-between"><dt>Medical aid</dt><dd>{money(o.medicalAidPortion, o.currency)}</dd></div>}
            <div className="flex justify-between"><dt>Paid</dt><dd>{money(o.amountPaid, o.currency)}</dd></div>
            <div className="flex justify-between font-bold"><dt>Balance due</dt><dd>{money(o.patientPortion - o.amountPaid, o.currency)}</dd></div>
          </dl>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-6">
            <div><p className="label">Lab</p><p>{o.labName ?? "—"} {o.labReference && `· ref ${o.labReference}`}</p></div>
            <div><p className="label">Instructions</p><p>{o.notes ?? "—"}</p></div>
            <div className="col-span-2 mt-8 grid grid-cols-3 gap-6 text-xs text-slate-500">
              <div className="border-t border-slate-300 pt-1">Glazed / checked by</div>
              <div className="border-t border-slate-300 pt-1">Fitted by</div>
              <div className="border-t border-slate-300 pt-1">Collected (patient signature)</div>
            </div>
          </div>
        )}

        {!isJob && o.receipts.length > 0 && (
          <div className="mt-6 text-xs text-slate-500">
            Payments received: {o.receipts.map((r) => `${r.receiptNo} ${money(r.amount, r.currency)} (${labelOf(PAYMENT_METHODS, r.method)})`).join("; ")}
          </div>
        )}
        <p className="mt-10 text-center text-xs text-slate-400">Thank you for choosing {ctx.org.name}. Please keep this document for your records.</p>
      </div>
    </div>
  );
}
