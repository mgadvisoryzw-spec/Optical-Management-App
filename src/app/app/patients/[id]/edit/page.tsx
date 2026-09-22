import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { PatientForm } from "../../patient-form";
import { updatePatient } from "../../actions";
import { fullName } from "@/lib/utils";

export default async function EditPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const [patient, aids] = await Promise.all([
    db.patient.findFirst({ where: { id, orgId: ctx.orgId } }),
    db.medicalAid.findMany({ where: { orgId: ctx.orgId, active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!patient) notFound();
  return (
    <>
      <PageHeader title={`Edit ${fullName(patient)}`} back={{ href: `/app/patients/${id}`, label: "Back to patient" }} />
      <PatientForm action={updatePatient.bind(null, id)} patient={patient} aids={aids} />
    </>
  );
}
