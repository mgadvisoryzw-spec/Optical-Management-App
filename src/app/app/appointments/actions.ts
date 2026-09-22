"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWrite } from "@/lib/auth";
import { appointmentVars, patientVars, renderTemplate, sendMessage } from "@/lib/messaging";
import { APPOINTMENT_TYPES, labelOf } from "@/lib/constants";
import { isoDate, num, optDate, optStr, str } from "@/lib/utils";

export async function createAppointment(fd: FormData) {
  const ctx = await requireWrite("clinical");
  const startsAt = optDate(fd.get("startsAt"));
  if (!startsAt) throw new Error("Choose a date and time");
  const patientId = optStr(fd.get("patientId"));
  if (patientId) await db.patient.findFirstOrThrow({ where: { id: patientId, orgId: ctx.orgId } });
  const branchId = optStr(fd.get("branchId")) ?? ctx.workingBranchId;
  const a = await db.appointment.create({
    data: {
      orgId: ctx.orgId,
      branchId,
      patientId,
      guestName: patientId ? null : optStr(fd.get("guestName")),
      guestPhone: patientId ? null : optStr(fd.get("guestPhone")),
      optometristId: optStr(fd.get("optometristId")),
      startsAt,
      durationMin: num(fd.get("durationMin"), 30),
      type: str(fd.get("type")) || "EYE_EXAM",
      notes: optStr(fd.get("notes")),
    },
    include: { patient: true, branch: true },
  });
  if (fd.get("sendConfirmation") === "on") await remind(a.id, ctx.orgId);
  redirect(`/app/appointments?date=${isoDate(startsAt)}`);
}

export async function setAppointmentStatus(id: string, fd: FormData) {
  const ctx = await requireWrite("clinical");
  await db.appointment.update({ where: { id, orgId: ctx.orgId }, data: { status: str(fd.get("status")) } });
  revalidatePath("/app/appointments");
}

async function remind(id: string, orgId: string) {
  const a = await db.appointment.findFirstOrThrow({ where: { id, orgId }, include: { patient: true, branch: true, organization: true } });
  const tpl = await db.messageTemplate.findUnique({ where: { orgId_key: { orgId, key: "APPOINTMENT" } } });
  const phone = a.patient?.phone ?? a.guestPhone;
  if (!tpl || !phone) return null;
  const person = a.patient ?? { firstName: a.guestName?.split(" ")[0] ?? "there", lastName: "" };
  const body = renderTemplate(tpl.body, { ...patientVars(a.organization, person), ...appointmentVars(a, labelOf(APPOINTMENT_TYPES, a.type), a.branch.name) });
  const r = await sendMessage({ orgId, patientId: a.patientId, channel: "SMS", purpose: "APPOINTMENT", to: phone, body });
  await db.appointment.update({ where: { id }, data: { reminderSent: true } });
  return r;
}

export async function sendAppointmentReminder(id: string) {
  const ctx = await requireWrite("clinical");
  await remind(id, ctx.orgId);
  revalidatePath("/app/appointments");
}
