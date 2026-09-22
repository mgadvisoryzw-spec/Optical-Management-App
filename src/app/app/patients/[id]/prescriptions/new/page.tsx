import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardHeader, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { RxTable } from "@/components/rx-table";
import { LENS_TYPES } from "@/lib/constants";
import { fmtDate, fullName, isoDate } from "@/lib/utils";
import { savePrescription } from "../../../actions";

export const metadata = { title: "Eye examination" };

function RxRow({ eye, prefix, prev }: { eye: string; prefix: "od" | "os"; prev?: Record<string, unknown> | null }) {
  const v = (k: string) => {
    const x = prev?.[prefix + k];
    return x === null || x === undefined ? "" : String(x);
  };
  return (
    <tr>
      <td className="pr-3 text-sm font-semibold text-slate-700">{eye}</td>
      <td><input name={`${prefix}Sph`} type="number" step="0.25" min="-30" max="30" defaultValue={v("Sph")} placeholder="0.00" /></td>
      <td><input name={`${prefix}Cyl`} type="number" step="0.25" min="-10" max="10" defaultValue={v("Cyl")} placeholder="0.00" /></td>
      <td><input name={`${prefix}Axis`} type="number" step="1" min="0" max="180" defaultValue={v("Axis")} placeholder="°" /></td>
      <td><input name={`${prefix}Add`} type="number" step="0.25" min="0" max="4" defaultValue={v("Add")} placeholder="+" /></td>
      <td><input name={`${prefix}Prism`} type="number" step="0.25" min="0" max="20" defaultValue={v("Prism")} /></td>
      <td>
        <select name={`${prefix}Base`} defaultValue={v("Base")}>
          <option value="">—</option>
          <option>Up</option><option>Down</option><option>In</option><option>Out</option>
        </select>
      </td>
      <td><input name={`${prefix}Va`} defaultValue="" placeholder="6/6" /></td>
    </tr>
  );
}

export default async function NewRxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("prescribe");
  const patient = await db.patient.findFirst({ where: { id, orgId: ctx.orgId }, include: { prescriptions: { orderBy: { examDate: "desc" }, take: 1 } } });
  if (!patient) notFound();
  const prev = patient.prescriptions[0] ?? null;
  const optoms = await db.user.findMany({ where: { orgId: ctx.orgId, active: true, role: { in: ["OPTOMETRIST", "OWNER", "ADMIN"] } }, orderBy: { name: "asc" } });

  return (
    <>
      <PageHeader title="Eye examination" subtitle={`${fullName(patient)} · ${patient.patientNo}`} back={{ href: `/app/patients/${id}`, label: "Back to patient" }} />
      <form action={savePrescription.bind(null, id)} className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Refraction" subtitle={prev ? `Pre-filled from the exam on ${fmtDate(prev.examDate)}. Update any values that have changed.` : "Enter the final prescription"} />
            <div className="space-y-5 p-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Exam date"><Input type="date" name="examDate" defaultValue={isoDate(new Date())} /></Field>
                <Field label="Prescription type">
                  <Select name="rxType" defaultValue="SPECTACLES" options={[{ value: "SPECTACLES", label: "Spectacles" }, { value: "CONTACT_LENS", label: "Contact lenses" }]} />
                </Field>
                <Field label="Optometrist">
                  <Select name="optometristId" defaultValue={ctx.user.id} options={optoms.map((o) => ({ value: o.id, label: o.name }))} />
                </Field>
              </div>
              <div className="rx-grid overflow-x-auto">
                <table className="w-full border-separate border-spacing-1.5">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="text-left">Eye</th><th>SPH</th><th>CYL</th><th>Axis</th><th>ADD</th><th>Prism Δ</th><th>Base</th><th>VA</th>
                    </tr>
                  </thead>
                  <tbody>
                    <RxRow eye="Right (OD)" prefix="od" prev={prev as unknown as Record<string, unknown>} />
                    <RxRow eye="Left (OS)" prefix="os" prev={prev as unknown as Record<string, unknown>} />
                  </tbody>
                </table>
              </div>
              <div className="grid gap-4 sm:grid-cols-5">
                <Field label="PD distance (mm)"><Input name="pdDistance" type="number" step="0.5" defaultValue={prev?.pdDistance ?? ""} /></Field>
                <Field label="PD near (mm)"><Input name="pdNear" type="number" step="0.5" defaultValue={prev?.pdNear ?? ""} /></Field>
                <Field label="Seg / fitting ht"><Input name="segHeight" type="number" step="0.5" /></Field>
                <Field label="IOP right"><Input name="iopOd" type="number" step="1" placeholder="mmHg" /></Field>
                <Field label="IOP left"><Input name="iopOs" type="number" step="1" placeholder="mmHg" /></Field>
              </div>
              <details className="rounded-xl border border-slate-200 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">Contact lens parameters</summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <Field label="Brand / product"><Input name="clBrand" defaultValue={prev?.clBrand ?? ""} placeholder="e.g. Acuvue Oasys" /></Field>
                  <Field label="Base curve"><Input name="clBaseCurve" defaultValue={prev?.clBaseCurve ?? ""} placeholder="8.4" /></Field>
                  <Field label="Diameter"><Input name="clDiameter" defaultValue={prev?.clDiameter ?? ""} placeholder="14.0" /></Field>
                </div>
              </details>
            </div>
          </Card>
          <Card>
            <CardHeader title="Clinical findings" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Chief complaint"><Textarea name="chiefComplaint" placeholder="Blurred distance vision, headaches when reading…" /></Field>
              <Field label="Diagnosis"><Textarea name="diagnosis" placeholder="Myopia with astigmatism, presbyopia…" /></Field>
              <Field label="Advice & recommendations"><Textarea name="recommendations" placeholder="Full-time wear, blue-cut lenses for screen use…" /></Field>
              <Field label="Internal notes"><Textarea name="notes" /></Field>
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Dispensing" />
            <div className="space-y-4 p-5">
              <Field label="Recommended lens type">
                <Select name="lensRecommendation" defaultValue={prev?.lensRecommendation ?? ""} placeholder="—" options={LENS_TYPES} />
              </Field>
              <p className="rounded-lg bg-brand-50 p-3 text-xs text-brand-900">
                Saving this exam sets the patient's next recall to <b>{ctx.org.recallMonths} months</b> from the exam date. They will get an automatic SMS/WhatsApp reminder when it's due.
              </p>
            </div>
          </Card>
          <Card>
            <CardHeader title="Follow-up (optional)" />
            <div className="space-y-4 p-5">
              <Field label="Follow up in">
                <Select name="followUpDays" defaultValue="" placeholder="No follow-up" options={[{ value: "7", label: "1 week" }, { value: "14", label: "2 weeks" }, { value: "30", label: "1 month" }, { value: "90", label: "3 months" }, { value: "180", label: "6 months" }]} />
              </Field>
              <Field label="Reason"><Input name="followUpReason" placeholder="Post-dispense adaptation check" /></Field>
            </div>
          </Card>
          {prev && (
            <Card>
              <CardHeader title="Previous Rx" subtitle={fmtDate(prev.examDate)} />
              <div className="p-3"><RxTable rx={prev} compact /></div>
            </Card>
          )}
          <Card className="flex flex-col gap-2 p-5">
            <SubmitButton name="then" value="order">Save & create order</SubmitButton>
            <SubmitButton name="then" value="" variant="secondary">Save exam only</SubmitButton>
          </Card>
        </div>
      </form>
    </>
  );
}
