import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { ConfirmButton, PrintButton } from "@/components/client";
import { Alert, LinkButton } from "@/components/ui";
import { PAYMENT_METHODS, can, labelOf } from "@/lib/constants";
import { fmtDateTime, fullName, money } from "@/lib/utils";
import { voidReceiptAction } from "../actions";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const r = await db.receipt.findFirst({ where: { id, orgId: ctx.orgId }, include: { patient: true, order: true, branch: true } });
  if (!r) notFound();
  return (
    <div className="mx-auto max-w-md">
      <div className="no-print mb-4 flex items-center justify-between gap-2">
        <LinkButton variant="ghost" href="/app/receipts">← Receipts</LinkButton>
        <div className="flex gap-2">
          {!r.voided && can(ctx.user.role, "accounting") && (
            <form action={voidReceiptAction.bind(null, r.id)}>
              <ConfirmButton message="Void this receipt? This reverses the entry in the ledger." variant="ghost">Void</ConfirmButton>
            </form>
          )}
          <PrintButton />
        </div>
      </div>
      {r.voided && <div className="mb-4"><Alert tone="red">This receipt has been voided.</Alert></div>}
      <div className="print-area rounded-2xl border border-slate-200 bg-white p-8 text-sm shadow-sm">
        <div className="text-center">
          <h1 className="text-lg font-bold">{ctx.org.name}</h1>
          <p className="text-slate-500">{r.branch.name}{r.branch.phone ? ` · ${r.branch.phone}` : ""}</p>
          <p className="mt-4 text-xs font-bold uppercase tracking-widest text-brand-700">Payment receipt</p>
          <p className="text-2xl font-bold">{r.receiptNo}</p>
        </div>
        <dl className="mt-6 space-y-2 border-y border-dashed border-slate-300 py-4">
          <div className="flex justify-between"><dt className="text-slate-500">Date</dt><dd>{fmtDateTime(r.date)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Received from</dt><dd>{r.patient ? fullName(r.patient) : "—"}</dd></div>
          {r.order && <div className="flex justify-between"><dt className="text-slate-500">For order</dt><dd>{r.order.orderNo}</dd></div>}
          <div className="flex justify-between"><dt className="text-slate-500">Method</dt><dd>{labelOf(PAYMENT_METHODS, r.method)}</dd></div>
          {r.reference && <div className="flex justify-between"><dt className="text-slate-500">Reference</dt><dd>{r.reference}</dd></div>}
        </dl>
        <div className="flex items-baseline justify-between py-4">
          <span className="font-semibold">Amount paid</span>
          <span className="text-2xl font-bold">{money(r.amount, r.currency)}</span>
        </div>
        {r.order && <p className="text-right text-slate-500">Balance remaining on order: {money(r.order.patientPortion - r.order.amountPaid, r.order.currency)}</p>}
        <p className="mt-8 text-center text-xs text-slate-400">Thank you!</p>
      </div>
    </div>
  );
}
