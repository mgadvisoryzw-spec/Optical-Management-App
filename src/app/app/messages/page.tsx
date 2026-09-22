import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getContext, requireWrite } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, CardHeader, PageHeader, StatCard, Table } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { fmtDateTime, fullName, str } from "@/lib/utils";

export const metadata = { title: "Messages" };

async function saveTemplate(id: string, fd: FormData) {
  "use server";
  const ctx = await requireWrite("settings");
  await db.messageTemplate.update({ where: { id, orgId: ctx.orgId }, data: { body: str(fd.get("body")) } });
  revalidatePath("/app/messages");
}

const statusTone: Record<string, string> = { SENT: "green", DELIVERED: "green", LOGGED: "slate", LINK: "teal", FAILED: "red", QUEUED: "amber" };
const statusLabel: Record<string, string> = { SENT: "Sent", DELIVERED: "Delivered", LOGGED: "Logged (no gateway)", LINK: "WhatsApp link", FAILED: "Failed", QUEUED: "Queued" };

export default async function MessagesPage() {
  const ctx = await getContext();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [messages, templates, monthCount] = await Promise.all([
    db.message.findMany({ where: { orgId: ctx.orgId }, include: { patient: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.messageTemplate.findMany({ where: { orgId: ctx.orgId }, orderBy: { key: "asc" } }),
    db.message.count({ where: { orgId: ctx.orgId, createdAt: { gte: monthStart }, status: { in: ["SENT", "DELIVERED"] } } }),
  ]);
  const allowance = ctx.org.plan?.monthlyMessages ?? 0;

  return (
    <>
      <PageHeader title="Messages" subtitle="SMS and WhatsApp to patients" />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Sent this month" value={monthCount} hint={allowance ? `${allowance.toLocaleString()} included in your ${ctx.org.plan?.name} plan` : undefined} />
        <StatCard label="SMS gateway" value={<span className="text-base capitalize">{ctx.org.smsProvider === "log" ? "Not connected" : ctx.org.smsProvider}</span>} accent="violet" hint={<Link href="/app/settings" className="text-brand-700">Configure →</Link>} />
        <StatCard label="WhatsApp" value={<span className="text-base">{ctx.org.whatsappProvider === "link" ? "Click-to-chat links" : ctx.org.whatsappProvider === "cloud" ? "WhatsApp Cloud API" : "Twilio"}</span>} accent="green" />
      </div>
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Message log" subtitle="Latest 100" />
          <Table>
            <thead><tr><th>When</th><th>Patient</th><th>Channel</th><th>Purpose</th><th>Status</th></tr></thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap text-xs">{fmtDateTime(m.createdAt)}</td>
                  <td>{m.patient ? <Link href={`/app/patients/${m.patient.id}`} className="font-semibold text-brand-700">{fullName(m.patient)}</Link> : m.to}<p className="max-w-80 truncate text-xs text-slate-400" title={m.body}>{m.body}</p></td>
                  <td><Badge tone={m.channel === "WHATSAPP" ? "green" : "blue"}>{m.channel === "WHATSAPP" ? "WhatsApp" : "SMS"}</Badge></td>
                  <td className="text-xs">{m.purpose.replace("_", " ").toLowerCase()}</td>
                  <td><Badge tone={statusTone[m.status] ?? "slate"}>{statusLabel[m.status] ?? m.status}</Badge>{m.error && <p className="text-xs text-rose-500">{m.error}</p>}</td>
                </tr>
              ))}
              {!messages.length && <tr><td colSpan={5} className="py-10 text-center text-slate-400">No messages yet.</td></tr>}
            </tbody>
          </Table>
        </Card>
        <div className="space-y-6 xl:col-span-2">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardHeader title={t.name} subtitle="Placeholders: {firstName} {lastName} {practice} {phone} {branch} {date} {time} {appointmentType} {orderNo} {balance} {dueDate}" />
              <form action={saveTemplate.bind(null, t.id)} className="space-y-3 p-5">
                <textarea name="body" defaultValue={t.body} rows={4} className="input" />
                <SubmitButton variant="secondary">Save template</SubmitButton>
              </form>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
