import Link from "next/link";
import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader, StatCard, Table } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { addDays, cn, fmtDate, fullName } from "@/lib/utils";
import { RecallButtons } from "./recall-buttons";
import { sendAllRecalls } from "./actions";

export const metadata = { title: "Recalls" };

export default async function RecallsPage({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const win = sp.window ?? "due";
  const now = new Date();
  const horizon = win === "overdue" ? now : win === "90" ? addDays(now, 90) : addDays(now, ctx.org.recallLeadDays);

  const [patients, overdue, next30, next90, sentMonth] = await Promise.all([
    db.patient.findMany({ where: { orgId: ctx.orgId, nextRecallDate: { lte: horizon } }, orderBy: { nextRecallDate: "asc" }, take: 300 }),
    db.patient.count({ where: { orgId: ctx.orgId, nextRecallDate: { lt: now } } }),
    db.patient.count({ where: { orgId: ctx.orgId, nextRecallDate: { gte: now, lte: addDays(now, 30) } } }),
    db.patient.count({ where: { orgId: ctx.orgId, nextRecallDate: { gte: now, lte: addDays(now, 90) } } }),
    db.message.count({ where: { orgId: ctx.orgId, purpose: "RECALL", createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } } }),
  ]);
  const recent = (d: Date | null) => !!d && d > addDays(now, -30);

  return (
    <>
      <PageHeader title="Recalls" subtitle={`Patients are due back ${ctx.org.recallMonths} months after their last eye test`} />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard label="Overdue" value={overdue} accent="rose" />
        <StatCard label="Due in 30 days" value={next30} accent="amber" />
        <StatCard label="Due in 90 days" value={next90} />
        <StatCard label="Reminders sent this month" value={sentMonth} accent="green" />
      </div>

      <Card className="mb-6">
        <CardHeader title="Send reminders to everyone due" subtitle={`Patients due within ${ctx.org.recallLeadDays} days or overdue, who haven't had a reminder in the last 30 days and have agreed to messages`} />
        <form action={async (fd) => { "use server"; await sendAllRecalls(fd); }} className="flex flex-wrap items-center gap-4 p-5">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="channels" value="SMS" defaultChecked className="h-4 w-4 accent-brand-600" /> SMS</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="channels" value="WHATSAPP" className="h-4 w-4 accent-brand-600" /> WhatsApp {ctx.org.whatsappProvider === "link" && <span className="text-xs text-slate-400">(needs the WhatsApp API for bulk sending)</span>}</label>
          <SubmitButton pendingText="Sending reminders…">Send reminders now</SubmitButton>
          <p className="w-full text-xs text-slate-400">
            This also runs automatically every day if a scheduler calls <code className="rounded bg-slate-100 px-1">/api/cron/reminders</code>. Change the template under <Link href="/app/messages" className="underline">Messages</Link>.
          </p>
        </form>
      </Card>
      {ctx.org.smsProvider === "log" && (
        <div className="mb-6"><Alert tone="amber">SMS gateway not set up yet. SMS reminders are saved to the message log but not sent. Connect Twilio or Africa's Talking in <Link href="/app/settings" className="font-semibold underline">Settings</Link>. WhatsApp click-to-chat works without any setup.</Alert></div>
      )}

      <div className="mb-4 flex gap-2">
        {[["due", `Due ≤ ${ctx.org.recallLeadDays} days`], ["overdue", "Overdue only"], ["90", "Next 90 days"]].map(([v, l]) => (
          <Link key={v} href={`?window=${v}`} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", win === v ? "bg-ink-900 text-white" : "bg-white ring-1 ring-slate-200")}>{l}</Link>
        ))}
      </div>
      <Card>
        {patients.length ? (
          <Table>
            <thead><tr><th>Patient</th><th>Phone</th><th>Last exam</th><th>Recall due</th><th>Last reminder</th><th className="text-right">Remind</th></tr></thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/app/patients/${p.id}`} className="font-semibold text-brand-700">{fullName(p)}</Link><span className="block text-xs text-slate-400">{p.patientNo}</span></td>
                  <td>{p.phone ?? "—"}</td>
                  <td>{fmtDate(p.lastExamDate)}</td>
                  <td><Badge tone={p.nextRecallDate && p.nextRecallDate < now ? "red" : "amber"}>{fmtDate(p.nextRecallDate)}</Badge></td>
                  <td className="text-sm text-slate-500">{fmtDate(p.lastRecallSentAt)}</td>
                  <td><RecallButtons patientId={p.id} hasPhone={!!(p.phone || p.whatsapp)} sent={recent(p.lastRecallSentAt)} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No recalls due" text="Recall dates are set automatically when you save an eye exam." />
        )}
      </Card>
    </>
  );
}
