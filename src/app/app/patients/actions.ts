"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWrite, getContext } from "@/lib/auth";
import { nextNumber } from "@/lib/ledger";
import { sendMessage } from "@/lib/messaging";
import { addMonths, optDate, optNum, optStr, str } from "@/lib/utils";

function patientData(fd: FormData) {
  return {
    title: optStr(fd.get("title")),
    firstName: str(fd.get("firstName")),
    lastName: str(fd.get("lastName")),
    dob: optDate(fd.get("dob")),
    gender: optStr(fd.get("gender")),
    nationalId: optStr(fd.get("nationalId")),
    phone: optStr(fd.get("phone")),
    whatsapp: optStr(fd.get("whatsapp")),
    email: optStr(fd.get("email")),
    address: optStr(fd.get("address")),
    occupation: optStr(fd.get("occupation")),
    medicalAidId: optStr(fd.get("medicalAidId")),
    medicalAidNo: optStr(fd.get("medicalAidNo")),
    medicalAidPlan: optStr(fd.get("medicalAidPlan")),
    principalMember: optStr(fd.get("principalMember")),
    medicalHistory: optStr(fd.get("medicalHistory")),
    notes: optStr(fd.get("notes")),
    consentSms: fd.get("consentSms") === "on",
    consentWhatsapp: fd.get("consentWhatsapp") === "on",
    nextRecallDate: optDate(fd.get("nextRecallDate")),
  };
}

export async function createPatient(fd: FormData) {
  const ctx = await requireWrite("clinical");
  const data = patientData(fd);
  if (!data.firstName || !data.lastName) throw new Error("First and last name are required");
  const p = await db.$transaction(async (tx) => {
    const patientNo = await nextNumber(tx, ctx.orgId, "PAT", 5);
    return tx.patient.create({ data: { ...data, orgId: ctx.orgId, branchId: ctx.workingBranchId, patientNo } });
  });
  const next = str(fd.get("then"));
  if (next === "exam") redirect(`/app/patients/${p.id}/prescriptions/new`);
  if (next === "book") redirect(`/app/appointments/new?patientId=${p.id}`);
  redirect(`/app/patients/${p.id}`);
}

export async function updatePatient(id: string, fd: FormData) {
  const ctx = await requireWrite("clinical");
  const data = patientData(fd);
  await db.patient.update({ where: { id, orgId: ctx.orgId }, data });
  redirect(`/app/patients/${id}`);
}

export async function savePrescription(patientId: string, fd: FormData) {
  const ctx = await requireWrite("prescribe");
  const patient = await db.patient.findFirstOrThrow({ where: { id: patientId, orgId: ctx.orgId } });
  const examDate = optDate(fd.get("examDate")) ?? new Date();
  const recall = addMonths(examDate, ctx.org.recallMonths);
  const eye = (k: string) => optNum(fd.get(k));
  const int = (k: string) => {
    const n = optNum(fd.get(k));
    return n === null ? null : Math.round(n);
  };
  const rx = await db.prescription.create({
    data: {
      patientId: patient.id,
      branchId: ctx.workingBranchId,
      optometristId: optStr(fd.get("optometristId")) ?? ctx.user.id,
      examDate,
      rxType: str(fd.get("rxType")) || "SPECTACLES",
      odSph: eye("odSph"), odCyl: eye("odCyl"), odAxis: int("odAxis"), odAdd: eye("odAdd"), odPrism: eye("odPrism"), odBase: optStr(fd.get("odBase")), odVa: optStr(fd.get("odVa")),
      osSph: eye("osSph"), osCyl: eye("osCyl"), osAxis: int("osAxis"), osAdd: eye("osAdd"), osPrism: eye("osPrism"), osBase: optStr(fd.get("osBase")), osVa: optStr(fd.get("osVa")),
      pdDistance: eye("pdDistance"), pdNear: eye("pdNear"), segHeight: eye("segHeight"), iopOd: eye("iopOd"), iopOs: eye("iopOs"),
      clBrand: optStr(fd.get("clBrand")), clBaseCurve: optStr(fd.get("clBaseCurve")), clDiameter: optStr(fd.get("clDiameter")),
      chiefComplaint: optStr(fd.get("chiefComplaint")),
      diagnosis: optStr(fd.get("diagnosis")),
      lensRecommendation: optStr(fd.get("lensRecommendation")),
      recommendations: optStr(fd.get("recommendations")),
      notes: optStr(fd.get("notes")),
      expiresAt: recall,
    },
  });
  await db.patient.update({ where: { id: patient.id }, data: { lastExamDate: examDate, nextRecallDate: recall, lastRecallSentAt: null } });

  // Optionally create a follow-up task
  const followDays = optNum(fd.get("followUpDays"));
  if (followDays) {
    await db.followUp.create({
      data: { orgId: ctx.orgId, patientId: patient.id, assignedToId: ctx.user.id, dueDate: new Date(Date.now() + followDays * 86400000), reason: optStr(fd.get("followUpReason")) ?? "Post-dispense check" },
    });
  }
  // Consultation fee: go straight to a new order
  if (str(fd.get("then")) === "order") redirect(`/app/orders/new?patientId=${patient.id}&rxId=${rx.id}`);
  redirect(`/app/patients/${patient.id}?saved=rx`);
}

export async function createFollowUp(fd: FormData) {
  const ctx = await requireWrite("clinical");
  const patientId = str(fd.get("patientId"));
  await db.followUp.create({
    data: {
      orgId: ctx.orgId,
      patientId,
      assignedToId: optStr(fd.get("assignedToId")) ?? ctx.user.id,
      dueDate: optDate(fd.get("dueDate")) ?? new Date(),
      reason: str(fd.get("reason")) || "Follow-up",
    },
  });
  revalidatePath(`/app/patients/${patientId}`);
  revalidatePath("/app/follow-ups");
}

export type MessageState = { ok?: boolean; error?: string; link?: string; status?: string } | undefined;

export async function sendPatientMessage(_: MessageState, fd: FormData): Promise<MessageState> {
  const ctx = await getContext();
  if (!ctx.subscription.ok) return { error: "Your subscription is inactive." };
  const patient = await db.patient.findFirst({ where: { id: str(fd.get("patientId")), orgId: ctx.orgId } });
  if (!patient) return { error: "Patient not found" };
  const channel = str(fd.get("channel")) === "WHATSAPP" ? "WHATSAPP" : "SMS";
  const to = channel === "WHATSAPP" ? patient.whatsapp || patient.phone : patient.phone;
  if (!to) return { error: "This patient has no phone number on file." };
  const body = str(fd.get("body"));
  if (!body) return { error: "Type a message first." };
  const purpose = str(fd.get("purpose")) || "CUSTOM";
  const r = await sendMessage({ orgId: ctx.orgId, patientId: patient.id, channel, purpose, to, body });
  if (purpose === "RECALL" && r.status !== "FAILED") await db.patient.update({ where: { id: patient.id }, data: { lastRecallSentAt: new Date() } });
  revalidatePath(`/app/patients/${patient.id}`);
  if (r.status === "FAILED") return { error: r.error ?? "Sending failed" };
  return { ok: true, link: r.link, status: r.status };
}
