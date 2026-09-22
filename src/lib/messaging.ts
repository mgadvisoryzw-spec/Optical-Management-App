import { db } from "./db";
import { fmtDate, fmtTime, toE164 } from "./utils";

export const DEFAULT_TEMPLATES = [
  {
    key: "RECALL",
    name: "Eye test recall",
    body: "Hi {firstName}, it's been 2 years since your last eye test at {practice}. Your eyes change over time — book your check-up today by calling {phone}. Reply STOP to opt out.",
  },
  {
    key: "APPOINTMENT",
    name: "Appointment reminder",
    body: "Hi {firstName}, this is a reminder of your {appointmentType} at {practice} ({branch}) on {date} at {time}. Call {phone} to reschedule.",
  },
  {
    key: "ORDER_READY",
    name: "Spectacles ready",
    body: "Good news {firstName}! Your order {orderNo} is ready for collection at {practice} ({branch}). Balance due: {balance}. See you soon.",
  },
  {
    key: "FOLLOW_UP",
    name: "Follow-up",
    body: "Hi {firstName}, {practice} here. We'd like to check how you're getting on with your new eyewear. Please call {phone} if you need any adjustment.",
  },
];

export function renderTemplate(body: string, vars: Record<string, string | number | null | undefined>) {
  return body.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined || vars[k] === null ? "" : String(vars[k])));
}

export function whatsappLink(phone: string, text: string) {
  return `https://wa.me/${toE164(phone).replace("+", "")}?text=${encodeURIComponent(text)}`;
}

type SendResult = { status: "SENT" | "FAILED" | "LOGGED" | "LINK"; provider: string; providerRef?: string; error?: string; link?: string };

async function sendTwilio(to: string, body: string, channel: "SMS" | "WHATSAPP"): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = channel === "SMS" ? process.env.TWILIO_SMS_FROM : process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) return { status: "FAILED", provider: "twilio", error: "Twilio credentials are not configured" };
  const params = new URLSearchParams({
    To: channel === "WHATSAPP" ? `whatsapp:${to}` : to,
    From: channel === "WHATSAPP" ? `whatsapp:${from}` : from,
    Body: body,
  });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  return res.ok ? { status: "SENT", provider: "twilio", providerRef: json.sid } : { status: "FAILED", provider: "twilio", error: json.message ?? res.statusText };
}

async function sendAfricasTalking(to: string, body: string, senderId?: string | null): Promise<SendResult> {
  const username = process.env.AFRICASTALKING_USERNAME;
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  if (!username || !apiKey) return { status: "FAILED", provider: "africastalking", error: "Africa's Talking credentials are not configured" };
  const params = new URLSearchParams({ username, to, message: body });
  if (senderId) params.set("from", senderId);
  const res = await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: { apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const json = (await res.json().catch(() => ({}))) as { SMSMessageData?: { Recipients?: { messageId?: string; status?: string }[] } };
  const r = json.SMSMessageData?.Recipients?.[0];
  return res.ok && r?.status === "Success"
    ? { status: "SENT", provider: "africastalking", providerRef: r.messageId }
    : { status: "FAILED", provider: "africastalking", error: r?.status ?? res.statusText };
}

async function sendWhatsAppCloud(to: string, body: string): Promise<SendResult> {
  const token = process.env.WHATSAPP_CLOUD_TOKEN;
  const phoneId = process.env.WHATSAPP_CLOUD_PHONE_ID;
  if (!token || !phoneId) return { status: "FAILED", provider: "cloud", error: "WhatsApp Cloud API is not configured" };
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace("+", ""), type: "text", text: { body } }),
  });
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message: string } };
  return res.ok ? { status: "SENT", provider: "cloud", providerRef: json.messages?.[0]?.id } : { status: "FAILED", provider: "cloud", error: json.error?.message ?? res.statusText };
}

/**
 * Sends (or logs) a message and records it in the message log.
 * - SMS: provider "log" records without sending (useful before a gateway is configured).
 * - WhatsApp: provider "link" produces a click-to-chat wa.me link staff open on their phone/desktop.
 */
export async function sendMessage(args: {
  orgId: string;
  patientId?: string | null;
  channel: "SMS" | "WHATSAPP";
  purpose: string;
  to: string;
  body: string;
}) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: args.orgId } });
  const to = toE164(args.to);
  let result: SendResult;
  try {
    if (args.channel === "SMS") {
      if (org.smsProvider === "twilio") result = await sendTwilio(to, args.body, "SMS");
      else if (org.smsProvider === "africastalking") result = await sendAfricasTalking(to, args.body, org.smsSenderId);
      else result = { status: "LOGGED", provider: "log" };
    } else {
      if (org.whatsappProvider === "twilio") result = await sendTwilio(to, args.body, "WHATSAPP");
      else if (org.whatsappProvider === "cloud") result = await sendWhatsAppCloud(to, args.body);
      else result = { status: "LINK", provider: "link", link: whatsappLink(to, args.body) };
    }
  } catch (e) {
    result = { status: "FAILED", provider: args.channel === "SMS" ? org.smsProvider : org.whatsappProvider, error: (e as Error).message };
  }
  const msg = await db.message.create({
    data: {
      orgId: args.orgId,
      patientId: args.patientId ?? null,
      channel: args.channel,
      purpose: args.purpose,
      to,
      body: args.body,
      status: result.status,
      provider: result.provider,
      providerRef: result.providerRef,
      error: result.error,
      sentAt: result.status === "FAILED" ? null : new Date(),
    },
  });
  return { ...result, messageId: msg.id };
}

/** Variables available to templates for a patient. */
export function patientVars(
  org: { name: string; phone: string | null },
  p: { firstName: string; lastName: string; nextRecallDate?: Date | null },
  extra: Record<string, string | number | null | undefined> = {},
) {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    practice: org.name,
    phone: org.phone ?? "",
    dueDate: p.nextRecallDate ? fmtDate(p.nextRecallDate) : "",
    ...extra,
  };
}

export function appointmentVars(a: { startsAt: Date; type: string }, typeLabel: string, branch: string) {
  return { date: fmtDate(a.startsAt, { weekday: "short", day: "numeric", month: "short" }), time: fmtTime(a.startsAt), appointmentType: typeLabel.toLowerCase(), branch };
}

/** Sends recall reminders to every consenting patient whose recall falls within the lead window. Used by cron + "Send all". */
export async function runRecallReminders(orgId: string, channels: ("SMS" | "WHATSAPP")[] = ["SMS"]) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  const tpl = await db.messageTemplate.findUnique({ where: { orgId_key: { orgId, key: "RECALL" } } });
  const horizon = new Date(Date.now() + org.recallLeadDays * 86400000);
  const resendAfter = new Date(Date.now() - 30 * 86400000);
  const patients = await db.patient.findMany({
    where: {
      orgId,
      nextRecallDate: { lte: horizon },
      OR: [{ lastRecallSentAt: null }, { lastRecallSentAt: { lt: resendAfter } }],
    },
    take: 500,
  });
  let sent = 0;
  for (const p of patients) {
    const body = renderTemplate(tpl?.body ?? DEFAULT_TEMPLATES[0].body, patientVars(org, p));
    let any = false;
    for (const ch of channels) {
      const phone = ch === "WHATSAPP" ? p.whatsapp || p.phone : p.phone;
      const consent = ch === "WHATSAPP" ? p.consentWhatsapp : p.consentSms;
      if (!phone || !consent) continue;
      const r = await sendMessage({ orgId, patientId: p.id, channel: ch, purpose: "RECALL", to: phone, body });
      if (r.status !== "FAILED") any = true;
    }
    if (any) {
      sent++;
      await db.patient.update({ where: { id: p.id }, data: { lastRecallSentAt: new Date() } });
    }
  }
  return { candidates: patients.length, sent };
}
