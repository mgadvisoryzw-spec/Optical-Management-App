import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Alert, Badge, Card, CardHeader, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { fmtDate } from "@/lib/utils";
import { addBranch, addMedicalAid, saveCurrency, saveMessaging, saveOrganization } from "./actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("settings");
  const org = ctx.org;
  const [currencies, aids] = await Promise.all([
    db.currency.findMany({ where: { orgId: ctx.orgId }, orderBy: { isBase: "desc" } }),
    db.medicalAid.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
  ]);
  const env = {
    twilio: !!process.env.TWILIO_ACCOUNT_SID,
    at: !!process.env.AFRICASTALKING_API_KEY,
    cloud: !!process.env.WHATSAPP_CLOUD_TOKEN,
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Practice profile, branches, currencies, medical aids and messaging" actions={<Link href="/app/settings/users" className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold shadow-sm">Users & roles →</Link>} />
      {sp.error && <div className="mb-6"><Alert tone="red">{sp.error} <Link href="/app/billing" className="font-semibold underline">See plans</Link></Alert></div>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Practice profile" subtitle="Shown on invoices, receipts, prescriptions and messages" />
          <form action={saveOrganization} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Practice / company name" className="sm:col-span-2"><Input name="name" defaultValue={org.name} /></Field>
            <Field label="Email"><Input name="email" defaultValue={org.email ?? ""} /></Field>
            <Field label="Phone"><Input name="phone" defaultValue={org.phone ?? ""} /></Field>
            <Field label="Address" className="sm:col-span-2"><Input name="address" defaultValue={org.address ?? ""} /></Field>
            <Field label="VAT / BP number"><Input name="taxNumber" defaultValue={org.taxNumber ?? ""} /></Field>
            <Field label="Default VAT %" hint="Set to 0 if you are not VAT-registered"><Input name="vatRate" type="number" step="0.1" defaultValue={org.vatRate} /></Field>
            <Field label={`Consultation fee (${org.baseCurrency})`}><Input name="consultationFee" type="number" step="0.01" defaultValue={org.consultationFee} /></Field>
            <Field label="Base currency" hint="Your books are kept in this currency"><Input value={org.baseCurrency} disabled /></Field>
            <Field label="Recall interval (months)"><Input name="recallMonths" type="number" defaultValue={org.recallMonths} /></Field>
            <Field label="Remind this many days before due"><Input name="recallLeadDays" type="number" defaultValue={org.recallLeadDays} /></Field>
            <div className="sm:col-span-2"><SubmitButton>Save profile</SubmitButton></div>
          </form>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Branches" subtitle={`${ctx.branches.length} of ${org.plan?.maxBranches ? org.plan.maxBranches : "unlimited"} on your ${org.plan?.name ?? ""} plan`} />
            <Table>
              <tbody>
                {ctx.branches.map((b) => (
                  <tr key={b.id}><td className="font-semibold">{b.name}</td><td><Badge>{b.code}</Badge></td><td className="text-sm text-slate-500">{b.address ?? ""} {b.phone ?? ""}</td></tr>
                ))}
              </tbody>
            </Table>
            <form action={addBranch} className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-4">
              <Input name="name" placeholder="Branch name" required className="sm:col-span-2" />
              <Input name="code" placeholder="Code (e.g. BYO)" maxLength={6} />
              <Input name="phone" placeholder="Phone" />
              <Input name="address" placeholder="Address" className="sm:col-span-3" />
              <SubmitButton variant="secondary">Add branch</SubmitButton>
            </form>
          </Card>

          <Card>
            <CardHeader title="Currencies & exchange rates" subtitle={`Rates are units of each currency per 1 ${org.baseCurrency}. Every transaction saves the rate used at the time.`} />
            <Table>
              <thead><tr><th>Currency</th><th className="num">Rate</th><th>Updated</th></tr></thead>
              <tbody>
                {currencies.map((c) => (
                  <tr key={c.id}><td className="font-semibold">{c.code} <span className="font-normal text-slate-500">{c.name}</span> {c.isBase && <Badge tone="brand">Base</Badge>}</td><td className="num">{c.rate}</td><td className="text-sm text-slate-500">{fmtDate(c.updatedAt)}</td></tr>
                ))}
              </tbody>
            </Table>
            <form action={saveCurrency} className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-4">
              <Input name="code" placeholder="Code (ZWG)" required />
              <Input name="rate" type="number" step="0.0001" placeholder="Rate" required />
              <Input name="name" placeholder="Name (new only)" />
              <SubmitButton variant="secondary">Update rate</SubmitButton>
            </form>
          </Card>
        </div>

        <Card>
          <CardHeader title="Medical aids / funders" />
          <Table>
            <tbody>
              {aids.map((a) => (
                <tr key={a.id}><td className="font-semibold">{a.name}</td><td className="text-sm text-slate-500">{a.code}</td><td className="text-sm text-slate-500">{a.paymentTermsDays} day terms</td><td>{a.requiresPreAuth && <Badge tone="amber">Pre-auth</Badge>}</td></tr>
              ))}
            </tbody>
          </Table>
          <form action={addMedicalAid} className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-4">
            <Input name="name" placeholder="Name" required className="sm:col-span-2" />
            <Input name="code" placeholder="Code" />
            <Input name="paymentTermsDays" type="number" placeholder="Terms (days)" />
            <Input name="phone" placeholder="Claims phone" className="sm:col-span-2" />
            <Input name="email" placeholder="Claims email" />
            <SubmitButton variant="secondary">Add funder</SubmitButton>
          </form>
        </Card>

        <Card>
          <CardHeader title="Messaging" subtitle="How SMS and WhatsApp messages are delivered" />
          <form action={saveMessaging} className="space-y-4 p-5">
            <Field label="SMS provider">
              <Select
                name="smsProvider"
                defaultValue={org.smsProvider}
                options={[
                  { value: "log", label: "Log only (no gateway yet)" },
                  { value: "africastalking", label: `Africa's Talking${env.at ? " ✓ configured" : " (needs API key)"}` },
                  { value: "twilio", label: `Twilio${env.twilio ? " ✓ configured" : " (needs credentials)"}` },
                ]}
              />
            </Field>
            <Field label="SMS sender ID" hint="Alphanumeric sender name, if your gateway supports it"><Input name="smsSenderId" defaultValue={org.smsSenderId ?? ""} maxLength={11} placeholder="CLEARVIEW" /></Field>
            <Field label="WhatsApp">
              <Select
                name="whatsappProvider"
                defaultValue={org.whatsappProvider}
                options={[
                  { value: "link", label: "Click-to-chat links (no setup, staff press send)" },
                  { value: "cloud", label: `WhatsApp Business Cloud API${env.cloud ? " ✓ configured" : " (needs token)"}` },
                  { value: "twilio", label: `Twilio WhatsApp${env.twilio ? " ✓ configured" : " (needs credentials)"}` },
                ]}
              />
            </Field>
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Gateway credentials are kept in server environment variables (see <code>.env.example</code>), never in the database. Automatic recalls run daily through <code>/api/cron/reminders</code>.</p>
            <SubmitButton>Save messaging</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
