import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Send } from "lucide-react";
import { getContext, branchScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { APPOINTMENT_STATUSES, APPOINTMENT_TYPES, labelOf, toneOf } from "@/lib/constants";
import { addDays, cn, fmtTime, fullName, isoDate, startOfDay } from "@/lib/utils";
import { sendAppointmentReminder, setAppointmentStatus } from "./actions";

export const metadata = { title: "Appointments" };

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const day = sp.date ? startOfDay(new Date(sp.date + "T00:00:00")) : startOfDay();
  // Week view: Monday → Saturday
  const weekStart = addDays(day, -((day.getDay() + 6) % 7));
  const days = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i));
  const appts = await db.appointment.findMany({
    where: { orgId: ctx.orgId, ...branchScope(ctx), startsAt: { gte: weekStart, lt: addDays(weekStart, 7) } },
    include: { patient: true, optometrist: true, branch: true },
    orderBy: { startsAt: "asc" },
  });
  const selected = appts.filter((a) => isoDate(a.startsAt) === isoDate(day));

  return (
    <>
      <PageHeader title="Appointments" subtitle={day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} actions={<LinkButton href={`/app/appointments/new?date=${isoDate(day)}`}><Plus size={16} /> Book appointment</LinkButton>} />

      <Card className="mb-6 p-2">
        <div className="flex items-center gap-2">
          <Link href={`?date=${isoDate(addDays(weekStart, -7))}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ChevronLeft size={18} /></Link>
          <div className="grid flex-1 grid-cols-6 gap-2">
            {days.map((d) => {
              const count = appts.filter((a) => isoDate(a.startsAt) === isoDate(d) && a.status !== "CANCELLED").length;
              const active = isoDate(d) === isoDate(day);
              const today = isoDate(d) === isoDate(new Date());
              return (
                <Link key={d.toISOString()} href={`?date=${isoDate(d)}`} className={cn("rounded-xl px-3 py-2 text-center transition", active ? "bg-ink-900 text-white" : "hover:bg-slate-50")}>
                  <p className={cn("text-[11px] font-semibold uppercase", active ? "text-brand-300" : today ? "text-brand-600" : "text-slate-400")}>{d.toLocaleDateString("en-GB", { weekday: "short" })}</p>
                  <p className="text-lg font-bold">{d.getDate()}</p>
                  <p className={cn("text-[11px]", active ? "text-slate-300" : "text-slate-400")}>{count} booked</p>
                </Link>
              );
            })}
          </div>
          <Link href={`?date=${isoDate(addDays(weekStart, 7))}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ChevronRight size={18} /></Link>
        </div>
      </Card>

      <Card>
        <ul className="divide-y divide-slate-100">
          {selected.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <div className="w-20">
                <p className="text-lg font-bold tabular-nums">{fmtTime(a.startsAt)}</p>
                <p className="text-xs text-slate-400">{a.durationMin} min</p>
              </div>
              <div className="min-w-48 flex-1">
                {a.patient ? (
                  <Link href={`/app/patients/${a.patient.id}`} className="font-semibold hover:text-brand-700">{fullName(a.patient)}</Link>
                ) : (
                  <p className="font-semibold">{a.guestName} <Badge tone="amber">New</Badge></p>
                )}
                <p className="text-sm text-slate-500">
                  {labelOf(APPOINTMENT_TYPES, a.type)}
                  {a.optometrist && ` · ${a.optometrist.name}`}
                  {!ctx.branchId && ` · ${a.branch.name}`}
                  {a.notes && ` · ${a.notes}`}
                </p>
              </div>
              <Badge tone={toneOf(APPOINTMENT_STATUSES, a.status)}>{labelOf(APPOINTMENT_STATUSES, a.status)}</Badge>
              <form action={setAppointmentStatus.bind(null, a.id)} className="flex gap-1">
                {a.status === "BOOKED" && <SubmitButton name="status" value="CONFIRMED" variant="secondary" className="px-2.5 py-1 text-xs">Confirm</SubmitButton>}
                {["BOOKED", "CONFIRMED"].includes(a.status) && <SubmitButton name="status" value="ARRIVED" variant="secondary" className="px-2.5 py-1 text-xs">Arrived</SubmitButton>}
                {a.status === "ARRIVED" && <SubmitButton name="status" value="COMPLETED" className="px-2.5 py-1 text-xs">Complete</SubmitButton>}
                {["BOOKED", "CONFIRMED"].includes(a.status) && <SubmitButton name="status" value="NO_SHOW" variant="ghost" className="px-2.5 py-1 text-xs">No-show</SubmitButton>}
                {["BOOKED", "CONFIRMED"].includes(a.status) && <SubmitButton name="status" value="CANCELLED" variant="ghost" className="px-2.5 py-1 text-xs">Cancel</SubmitButton>}
              </form>
              {a.status === "ARRIVED" && a.patient && <LinkButton href={`/app/patients/${a.patient.id}/prescriptions/new`} className="px-2.5 py-1 text-xs">Start exam</LinkButton>}
              {!a.patient && a.status !== "CANCELLED" && <LinkButton variant="secondary" href={`/app/patients/new`} className="px-2.5 py-1 text-xs">Register</LinkButton>}
              {["BOOKED", "CONFIRMED"].includes(a.status) && (
                <form action={sendAppointmentReminder.bind(null, a.id)}>
                  <SubmitButton variant="ghost" className="px-2 py-1 text-xs" title="Send SMS reminder"><Send size={13} /> {a.reminderSent ? "Resend" : "Remind"}</SubmitButton>
                </form>
              )}
            </li>
          ))}
          {!selected.length && <li className="px-5 py-16 text-center text-slate-400">No appointments on this day.</li>}
        </ul>
      </Card>
    </>
  );
}
