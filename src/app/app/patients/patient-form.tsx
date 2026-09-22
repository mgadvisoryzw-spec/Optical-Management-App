import type { MedicalAid, Patient } from "@prisma/client";
import { Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { isoDate } from "@/lib/utils";

export function PatientForm({ action, patient, aids, isNew }: { action: (fd: FormData) => Promise<void>; patient?: Patient | null; aids: MedicalAid[]; isNew?: boolean }) {
  const p = patient;
  return (
    <form action={action} className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <Card>
          <CardHeader title="Personal details" />
          <div className="grid gap-4 p-5 sm:grid-cols-6">
            <Field label="Title" className="sm:col-span-1">
              <Select name="title" defaultValue={p?.title ?? ""} placeholder="—" options={["Mr", "Mrs", "Ms", "Miss", "Dr", "Prof", "Master"].map((t) => ({ value: t, label: t }))} />
            </Field>
            <Field label="First name *" className="sm:col-span-2">
              <Input name="firstName" required defaultValue={p?.firstName} autoFocus={isNew} />
            </Field>
            <Field label="Surname *" className="sm:col-span-3">
              <Input name="lastName" required defaultValue={p?.lastName} />
            </Field>
            <Field label="Date of birth" className="sm:col-span-2">
              <Input name="dob" type="date" defaultValue={isoDate(p?.dob)} />
            </Field>
            <Field label="Gender" className="sm:col-span-2">
              <Select name="gender" defaultValue={p?.gender ?? ""} placeholder="—" options={[{ value: "Female", label: "Female" }, { value: "Male", label: "Male" }, { value: "Other", label: "Other" }]} />
            </Field>
            <Field label="National ID / Passport" className="sm:col-span-2">
              <Input name="nationalId" defaultValue={p?.nationalId ?? ""} placeholder="63-123456-X-47" />
            </Field>
            <Field label="Occupation" className="sm:col-span-3" hint="Screen work, driving and similar help with lens advice">
              <Input name="occupation" defaultValue={p?.occupation ?? ""} />
            </Field>
            <Field label="Address" className="sm:col-span-3">
              <Input name="address" defaultValue={p?.address ?? ""} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Contact & communication" subtitle="Used for recalls, appointment reminders and 'order ready' messages" />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Field label="Mobile (SMS)">
              <Input name="phone" defaultValue={p?.phone ?? ""} placeholder="077 123 4567" />
            </Field>
            <Field label="WhatsApp number" hint="Leave blank if it's the same as mobile">
              <Input name="whatsapp" defaultValue={p?.whatsapp ?? ""} />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" defaultValue={p?.email ?? ""} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="consentSms" defaultChecked={p?.consentSms ?? true} className="h-4 w-4 accent-brand-600" /> Consents to SMS reminders
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="consentWhatsapp" defaultChecked={p?.consentWhatsapp ?? true} className="h-4 w-4 accent-brand-600" /> Consents to WhatsApp messages
            </label>
          </div>
        </Card>

        <Card>
          <CardHeader title="Clinical notes" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="General & ocular history" hint="Diabetes, hypertension, glaucoma in the family, medication…">
              <Textarea name="medicalHistory" defaultValue={p?.medicalHistory ?? ""} />
            </Field>
            <Field label="Other notes">
              <Textarea name="notes" defaultValue={p?.notes ?? ""} />
            </Field>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Medical aid" />
          <div className="space-y-4 p-5">
            <Field label="Medical aid / funder">
              <Select name="medicalAidId" defaultValue={p?.medicalAidId ?? ""} placeholder="Private (cash) patient" options={aids.map((a) => ({ value: a.id, label: a.name }))} />
            </Field>
            <Field label="Membership number">
              <Input name="medicalAidNo" defaultValue={p?.medicalAidNo ?? ""} />
            </Field>
            <Field label="Package / plan">
              <Input name="medicalAidPlan" defaultValue={p?.medicalAidPlan ?? ""} placeholder="e.g. Premier, Standard" />
            </Field>
            <Field label="Principal member (if dependant)">
              <Input name="principalMember" defaultValue={p?.principalMember ?? ""} />
            </Field>
          </div>
        </Card>
        {!isNew && (
          <Card>
            <CardHeader title="Recall" />
            <div className="p-5">
              <Field label="Next recall date" hint="Set automatically to 2 years after each eye test">
                <Input name="nextRecallDate" type="date" defaultValue={isoDate(p?.nextRecallDate)} />
              </Field>
            </div>
          </Card>
        )}
        <Card className="p-5">
          <div className="flex flex-col gap-2">
            {isNew ? (
              <>
                <SubmitButton name="then" value="exam">Save & start eye exam</SubmitButton>
                <SubmitButton name="then" value="book" variant="secondary">Save & book appointment</SubmitButton>
                <SubmitButton name="then" value="" variant="ghost">Save only</SubmitButton>
              </>
            ) : (
              <SubmitButton>Save changes</SubmitButton>
            )}
          </div>
        </Card>
      </div>
    </form>
  );
}
