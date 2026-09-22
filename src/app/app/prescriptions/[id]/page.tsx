import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { PrintButton } from "@/components/client";
import { RxTable } from "@/components/rx-table";
import { LinkButton } from "@/components/ui";
import { LENS_TYPES, labelOf } from "@/lib/constants";
import { age, fmtDate, fullName } from "@/lib/utils";

export const metadata = { title: "Prescription" };

export default async function PrintRx({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const rx = await db.prescription.findFirst({ where: { id, patient: { orgId: ctx.orgId } }, include: { patient: true, optometrist: true, branch: true } });
  if (!rx) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex justify-between">
        <LinkButton variant="ghost" href={`/app/patients/${rx.patientId}`}>← Back</LinkButton>
        <PrintButton label="Print prescription" />
      </div>
      <div className="print-area rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
        <div className="flex items-start justify-between border-b border-slate-200 pb-6">
          <div>
            <h1 className="text-2xl font-bold">{ctx.org.name}</h1>
            <p className="text-sm text-slate-500">{rx.branch?.name}{rx.branch?.address ? ` · ${rx.branch.address}` : ""}</p>
            <p className="text-sm text-slate-500">{[rx.branch?.phone ?? ctx.org.phone, ctx.org.email].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-700">{rx.rxType === "CONTACT_LENS" ? "Contact lens prescription" : "Spectacle prescription"}</p>
            <p className="mt-1 text-sm">Date: <b>{fmtDate(rx.examDate)}</b></p>
            <p className="text-sm">Valid until: <b>{fmtDate(rx.expiresAt)}</b></p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 py-6 text-sm">
          <div>
            <p className="label">Patient</p>
            <p className="font-semibold">{fullName(rx.patient)}</p>
            <p className="text-slate-500">{rx.patient.patientNo}{age(rx.patient.dob) !== null && ` · ${age(rx.patient.dob)} yrs`}</p>
          </div>
          <div>
            <p className="label">Recommended lenses</p>
            <p className="font-semibold">{labelOf(LENS_TYPES, rx.lensRecommendation) || "—"}</p>
          </div>
        </div>
        <RxTable rx={rx} />
        {rx.recommendations && (
          <div className="mt-6 text-sm">
            <p className="label">Advice</p>
            <p>{rx.recommendations}</p>
          </div>
        )}
        <div className="mt-16 flex items-end justify-between text-sm">
          <div>
            <div className="w-64 border-t border-slate-400 pt-1">{rx.optometrist?.name ?? "Optometrist"}</div>
            <p className="text-xs text-slate-500">Optometrist signature</p>
          </div>
          <p className="text-xs text-slate-400">We recommend an eye test every 2 years.</p>
        </div>
      </div>
    </div>
  );
}
