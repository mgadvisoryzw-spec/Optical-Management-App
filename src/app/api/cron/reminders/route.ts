import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { runRecallReminders, renderTemplate, patientVars, appointmentVars, sendMessage } from "@/lib/messaging";
import { subscriptionState } from "@/lib/auth";
import { APPOINTMENT_TYPES, labelOf } from "@/lib/constants";
import { addDays, endOfDay, startOfDay } from "@/lib/utils";

/**
 * Daily job: 2-year recall reminders + tomorrow's appointment reminders for every active tenant.
 * Call with header `Authorization: Bearer $CRON_SECRET` (Vercel Cron, GitHub Actions, cron-job.org, etc.).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return new NextResponse("Unauthorized", { status: 401 });

  const orgs = await db.organization.findMany();
  const results: Record<string, unknown> = {};
  for (const org of orgs) {
    if (!subscriptionState(org).ok) continue;
    const channels: ("SMS" | "WHATSAPP")[] = ["SMS"];
    if (org.whatsappProvider !== "link") channels.push("WHATSAPP");
    const recalls = await runRecallReminders(org.id, channels);

    const tomorrow = addDays(new Date(), 1);
    const appts = await db.appointment.findMany({
      where: { orgId: org.id, reminderSent: false, status: { in: ["BOOKED", "CONFIRMED"] }, startsAt: { gte: startOfDay(tomorrow), lte: endOfDay(tomorrow) } },
      include: { patient: true, branch: true },
    });
    const tpl = await db.messageTemplate.findUnique({ where: { orgId_key: { orgId: org.id, key: "APPOINTMENT" } } });
    let apptSent = 0;
    for (const a of appts) {
      const phone = a.patient?.phone ?? a.guestPhone;
      if (!tpl || !phone || (a.patient && !a.patient.consentSms)) continue;
      const person = a.patient ?? { firstName: a.guestName?.split(" ")[0] ?? "there", lastName: "" };
      const body = renderTemplate(tpl.body, { ...patientVars(org, person), ...appointmentVars(a, labelOf(APPOINTMENT_TYPES, a.type), a.branch.name) });
      const r = await sendMessage({ orgId: org.id, patientId: a.patientId, channel: "SMS", purpose: "APPOINTMENT", to: phone, body });
      if (r.status !== "FAILED") {
        apptSent++;
        await db.appointment.update({ where: { id: a.id }, data: { reminderSent: true } });
      }
    }
    results[org.slug] = { recalls, appointments: apptSent };
  }
  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), results });
}
