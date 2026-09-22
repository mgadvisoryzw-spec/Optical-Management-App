import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { APPOINTMENT_TYPES } from "@/lib/constants";
import { fullName } from "@/lib/utils";
import { createAppointment } from "../actions";

export const metadata = { title: "Book appointment" };

export default async function NewAppointment({ searchParams }: { searchParams: Promise<{ patientId?: string; date?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const [patient, optoms, recent] = await Promise.all([
    sp.patientId ? db.patient.findFirst({ where: { id: sp.patientId, orgId: ctx.orgId } }) : null,
    db.user.findMany({ where: { orgId: ctx.orgId, active: true, role: { in: ["OPTOMETRIST", "OWNER", "ADMIN"] } }, orderBy: { name: "asc" } }),
    sp.patientId ? [] : db.patient.findMany({ where: { orgId: ctx.orgId }, orderBy: { lastName: "asc" }, take: 500, select: { id: true, firstName: true, lastName: true, patientNo: true } }),
  ]);
  const defaultStart = `${sp.date ?? new Date().toISOString().slice(0, 10)}T09:00`;

  return (
    <>
      <PageHeader title="Book an appointment" back={{ href: "/app/appointments", label: "Diary" }} />
      <Card className="max-w-2xl">
        <form action={createAppointment} className="grid gap-4 p-6 sm:grid-cols-2">
          {patient ? (
            <div className="sm:col-span-2">
              <input type="hidden" name="patientId" value={patient.id} />
              <p className="label">Patient</p>
              <p className="font-semibold">{fullName(patient)} · {patient.patientNo}</p>
            </div>
          ) : (
            <>
              <Field label="Existing patient" className="sm:col-span-2" hint="Or leave blank and enter a new person's details below">
                <Select name="patientId" placeholder="— New / walk-in —" options={recent.map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName} (${p.patientNo})` }))} />
              </Field>
              <Field label="New person's name"><Input name="guestName" /></Field>
              <Field label="New person's phone"><Input name="guestPhone" /></Field>
            </>
          )}
          <Field label="Date & time"><Input type="datetime-local" name="startsAt" defaultValue={defaultStart} required /></Field>
          <Field label="Duration">
            <Select name="durationMin" defaultValue="30" options={[15, 20, 30, 45, 60].map((m) => ({ value: String(m), label: `${m} minutes` }))} />
          </Field>
          <Field label="Type"><Select name="type" options={APPOINTMENT_TYPES} /></Field>
          <Field label="Optometrist"><Select name="optometristId" placeholder="Any" options={optoms.map((o) => ({ value: o.id, label: o.name }))} /></Field>
          {ctx.branches.length > 1 && (
            <Field label="Branch"><Select name="branchId" defaultValue={ctx.workingBranchId} options={ctx.branches.map((b) => ({ value: b.id, label: b.name }))} /></Field>
          )}
          <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" rows={2} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="sendConfirmation" defaultChecked className="h-4 w-4 accent-brand-600" /> Send an SMS confirmation to the patient
          </label>
          <div className="sm:col-span-2"><SubmitButton>Book appointment</SubmitButton></div>
        </form>
      </Card>
    </>
  );
}
