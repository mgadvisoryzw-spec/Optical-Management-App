"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getContext, requireWrite } from "@/lib/auth";
import { DEFAULT_TEMPLATES, patientVars, renderTemplate, runRecallReminders, sendMessage } from "@/lib/messaging";

export type RecallState = { ok?: boolean; link?: string; error?: string; status?: string } | undefined;

export async function recallOne(patientId: string, channel: "SMS" | "WHATSAPP"): Promise<RecallState> {
  const ctx = await getContext();
  if (!ctx.subscription.ok) return { error: "Subscription inactive" };
  const p = await db.patient.findFirst({ where: { id: patientId, orgId: ctx.orgId } });
  if (!p) return { error: "Not found" };
  const phone = channel === "WHATSAPP" ? p.whatsapp || p.phone : p.phone;
  if (!phone) return { error: "No number" };
  const tpl = await db.messageTemplate.findUnique({ where: { orgId_key: { orgId: ctx.orgId, key: "RECALL" } } });
  const body = renderTemplate(tpl?.body ?? DEFAULT_TEMPLATES[0].body, patientVars(ctx.org, p));
  const r = await sendMessage({ orgId: ctx.orgId, patientId: p.id, channel, purpose: "RECALL", to: phone, body });
  if (r.status === "FAILED") return { error: r.error };
  await db.patient.update({ where: { id: p.id }, data: { lastRecallSentAt: new Date() } });
  revalidatePath("/app/recalls");
  return { ok: true, link: r.link, status: r.status };
}

export async function sendAllRecalls(fd: FormData) {
  const ctx = await requireWrite("clinical");
  const channels = fd.getAll("channels").map(String).filter((c) => c === "SMS" || c === "WHATSAPP") as ("SMS" | "WHATSAPP")[];
  const res = await runRecallReminders(ctx.orgId, channels.length ? channels : ["SMS"]);
  revalidatePath("/app/recalls");
  return res;
}
