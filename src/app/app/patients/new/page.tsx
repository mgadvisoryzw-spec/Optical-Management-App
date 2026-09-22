import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { PatientForm } from "../patient-form";
import { createPatient } from "../actions";

export const metadata = { title: "New patient" };

export default async function NewPatientPage() {
  const ctx = await getContext();
  const aids = await db.medicalAid.findMany({ where: { orgId: ctx.orgId, active: true }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Register a patient" back={{ href: "/app/patients", label: "Patients" }} />
      <PatientForm action={createPatient} aids={aids} isNew />
    </>
  );
}
