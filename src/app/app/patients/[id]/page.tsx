import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, Eye, Pencil, Printer, ShoppingBag, Phone, Mail, MapPin, HeartPulse, BellRing } from "lucide-react";
import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Alert, Badge, Card, CardHeader, Field, Input, LinkButton, Table } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { RxTable } from "@/components/rx-table";
import { MessageComposer } from "@/components/message-composer";
import { APPOINTMENT_STATUSES, APPOINTMENT_TYPES, LENS_TYPES, ORDER_STATUSES, PAYMENT_METHODS, can, labelOf, toneOf } from "@/lib/constants";
import { age, fmtDate, fmtDateTime, fullName, isoDate, money, addDays } from "@/lib/utils";
import { patientVars, renderTemplate } from "@/lib/messaging";
import { createFollowUp } from "../actions";

export default async function PatientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await getContext();
  const p = await db.patient.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      medicalAid: true,
      branch: true,
      prescriptions: { include: { optometrist: true }, orderBy: { examDate: "desc" } },
      orders: { orderBy: { createdAt: "desc" }, include: { items: true } },
      receipts: { where: { voided: false }, orderBy: { date: "desc" }, take: 10 },
      appointments: { orderBy: { startsAt: "desc" }, take: 8, include: { optometrist: true } },
      followUps: { orderBy: { dueDate: "desc" }, take: 8 },
      messages: { orderBy: { createdAt: "desc" }, take: 8 },
    },
  });
  if (!p) notFound();
  const templates = await db.messageTemplate.findMany({ where: { orgId: ctx.orgId } });
  const readyOrder = p.orders.find((o) => o.status === "READY");
  const rendered = templates.map((t) => ({
    key: t.key,
    name: t.name,
    body: renderTemplate(
      t.body,
      patientVars(ctx.org, p, {
        branch: p.branch?.name ?? ctx.branches[0]?.name,
        orderNo: readyOrder?.orderNo ?? "",
        balance: readyOrder ? money(readyOrder.patientPortion - readyOrder.amountPaid, readyOrder.currency) : "",
      }),
    ),
  }));
  const latest = p.prescriptions[0];
  const balance = p.orders.filter((o) => o.status !== "CANCELLED" && o.status !== "QUOTE").reduce((s, o) => s + (o.patientPortion - o.amountPaid) / (o.exchangeRate || 1), 0);
  const overdue = p.nextRecallDate && p.nextRecallDate < new Date();
  const canRx = can(ctx.user.role, "prescribe");

  return (
    <div className="space-y-6">
      {sp.saved === "rx" && <Alert tone="green">Prescription saved. The next recall is set for <b>{fmtDate(p.nextRecallDate)}</b>.</Alert>}

      {/* Header */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-5 bg-gradient-to-r from-ink-900 to-ink-700 px-6 py-6 text-white">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-indigo-500 text-xl font-bold">
            {p.firstName[0]}
            {p.lastName[0]}
          </div>
          <div className="flex-1">
            <Link href="/app/patients" className="text-xs font-semibold text-brand-300 hover:underline">← Patients</Link>
            <h1 className="text-2xl font-bold">{[p.title, p.firstName, p.lastName].filter(Boolean).join(" ")}</h1>
            <p className="text-sm text-slate-300">
              {p.patientNo}
              {age(p.dob) !== null && ` · ${age(p.dob)} years`}
              {p.gender && ` · ${p.gender}`}
              {p.occupation && ` · ${p.occupation}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <LinkButton variant="secondary" href={`/app/patients/${p.id}/edit`}><Pencil size={15} /> Edit</LinkButton>
            <LinkButton variant="secondary" href={`/app/appointments/new?patientId=${p.id}`}><CalendarPlus size={15} /> Book</LinkButton>
            {canRx && <LinkButton variant="secondary" href={`/app/patients/${p.id}/prescriptions/new`}><Eye size={15} /> New exam</LinkButton>}
            <LinkButton href={`/app/orders/new?patientId=${p.id}${latest ? `&rxId=${latest.id}` : ""}`} className="bg-brand-500 text-ink-950 hover:bg-brand-400"><ShoppingBag size={15} /> New order</LinkButton>
          </div>
        </div>
        <div className="grid divide-y divide-slate-100 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          <div className="p-4">
            <p className="label">Last exam</p>
            <p className="font-semibold">{fmtDate(p.lastExamDate)}</p>
          </div>
          <div className="p-4">
            <p className="label">Recall due</p>
            <p className={`font-semibold ${overdue ? "text-rose-600" : ""}`}>{fmtDate(p.nextRecallDate)}{overdue && " · overdue"}</p>
          </div>
          <div className="p-4">
            <p className="label">Account balance</p>
            <p className={`font-semibold ${balance > 0.009 ? "text-amber-600" : "text-emerald-600"}`}>{money(balance, ctx.org.baseCurrency)}</p>
          </div>
          <div className="p-4">
            <p className="label">Lifetime orders</p>
            <p className="font-semibold">{p.orders.filter((o) => o.status !== "CANCELLED").length}</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {/* Prescriptions */}
          <Card>
            <CardHeader title="Prescriptions & eye exams" subtitle={`${p.prescriptions.length} on record`} action={canRx && <LinkButton variant="secondary" href={`/app/patients/${p.id}/prescriptions/new`}>New exam</LinkButton>} />
            <div className="space-y-5 p-5">
              {p.prescriptions.map((rx, i) => (
                <div key={rx.id} className={i > 0 ? "border-t border-dashed border-slate-200 pt-5" : ""}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{fmtDate(rx.examDate)}</p>
                      <Badge tone={i === 0 ? "brand" : "slate"}>{i === 0 ? "Current" : "Previous"}</Badge>
                      <Badge>{rx.rxType === "CONTACT_LENS" ? "Contact lens" : "Spectacles"}</Badge>
                      {rx.lensRecommendation && <Badge tone="violet">{labelOf(LENS_TYPES, rx.lensRecommendation)}</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      {rx.optometrist && <span>by {rx.optometrist.name}</span>}
                      <Link href={`/app/prescriptions/${rx.id}`} className="inline-flex items-center gap-1 font-semibold text-brand-700"><Printer size={13} /> Print Rx</Link>
                    </div>
                  </div>
                  <RxTable rx={rx} compact={i > 0} />
                  {(rx.diagnosis || rx.recommendations || rx.chiefComplaint) && (
                    <div className="mt-2 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                      {rx.chiefComplaint && <p><span className="text-xs font-semibold uppercase text-slate-400">Complaint</span><br />{rx.chiefComplaint}</p>}
                      {rx.diagnosis && <p><span className="text-xs font-semibold uppercase text-slate-400">Diagnosis</span><br />{rx.diagnosis}</p>}
                      {rx.recommendations && <p><span className="text-xs font-semibold uppercase text-slate-400">Advice</span><br />{rx.recommendations}</p>}
                    </div>
                  )}
                </div>
              ))}
              {!p.prescriptions.length && <p className="py-6 text-center text-sm text-slate-400">No eye exams recorded yet.</p>}
            </div>
          </Card>

          {/* Orders */}
          <Card>
            <CardHeader title="Orders & spectacles" />
            {p.orders.length ? (
              <Table>
                <thead>
                  <tr><th>Order</th><th>Date</th><th>Items</th><th>Status</th><th className="num">Total</th><th className="num">Balance</th></tr>
                </thead>
                <tbody>
                  {p.orders.map((o) => (
                    <tr key={o.id}>
                      <td><Link href={`/app/orders/${o.id}`} className="font-semibold text-brand-700">{o.orderNo}</Link></td>
                      <td>{fmtDate(o.createdAt)}</td>
                      <td className="max-w-64 truncate text-xs text-slate-500">{o.items.map((i) => i.description).join(", ")}</td>
                      <td><Badge tone={toneOf(ORDER_STATUSES, o.status)}>{labelOf(ORDER_STATUSES, o.status)}</Badge></td>
                      <td className="num">{money(o.total, o.currency)}</td>
                      <td className="num">{o.status === "CANCELLED" ? "—" : money(o.patientPortion - o.amountPaid, o.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="p-6 text-center text-sm text-slate-400">No orders yet.</p>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Recent payments" />
              <ul className="divide-y divide-slate-100 text-sm">
                {p.receipts.map((r) => (
                  <li key={r.id} className="flex justify-between px-5 py-2.5">
                    <span><b>{r.receiptNo}</b> <span className="text-slate-500">· {fmtDate(r.date)} · {labelOf(PAYMENT_METHODS, r.method)}</span></span>
                    <span className="font-semibold tabular-nums">{money(r.amount, r.currency)}</span>
                  </li>
                ))}
                {!p.receipts.length && <li className="px-5 py-6 text-center text-slate-400">No payments yet.</li>}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Appointments" />
              <ul className="divide-y divide-slate-100 text-sm">
                {p.appointments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between px-5 py-2.5">
                    <span>{fmtDateTime(a.startsAt)} <span className="text-slate-500">· {labelOf(APPOINTMENT_TYPES, a.type)}</span></span>
                    <Badge tone={toneOf(APPOINTMENT_STATUSES, a.status)}>{labelOf(APPOINTMENT_STATUSES, a.status)}</Badge>
                  </li>
                ))}
                {!p.appointments.length && <li className="px-5 py-6 text-center text-slate-400">No appointments.</li>}
              </ul>
            </Card>
          </div>
        </div>

        {/* Right rail */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Contact" />
            <ul className="space-y-3 p-5 text-sm">
              <li className="flex items-center gap-3"><Phone size={15} className="text-slate-400" /> {p.phone ?? "—"} {p.whatsapp && p.whatsapp !== p.phone && <span className="text-xs text-slate-400">(WA {p.whatsapp})</span>}</li>
              <li className="flex items-center gap-3"><Mail size={15} className="text-slate-400" /> {p.email ?? "—"}</li>
              <li className="flex items-center gap-3"><MapPin size={15} className="text-slate-400" /> {p.address ?? "—"}</li>
              <li className="flex items-center gap-3"><HeartPulse size={15} className="text-slate-400" /> {p.medicalAid ? `${p.medicalAid.name} · ${p.medicalAidNo ?? "no member no."}${p.medicalAidPlan ? ` · ${p.medicalAidPlan}` : ""}` : "Private patient"}</li>
              <li className="flex items-center gap-3"><BellRing size={15} className="text-slate-400" /> SMS {p.consentSms ? "✓" : "✗"} · WhatsApp {p.consentWhatsapp ? "✓" : "✗"}</li>
            </ul>
            {p.medicalHistory && <div className="border-t border-slate-100 px-5 py-4 text-sm"><p className="label">History</p>{p.medicalHistory}</div>}
          </Card>

          <Card>
            <CardHeader title="Send a message" subtitle="SMS or WhatsApp" />
            <div className="p-5">
              <MessageComposer patientId={p.id} templates={rendered} hasPhone={!!(p.phone || p.whatsapp)} defaultKey={readyOrder ? "ORDER_READY" : overdue ? "RECALL" : undefined} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Follow-ups" />
            <ul className="divide-y divide-slate-100 text-sm">
              {p.followUps.map((f) => (
                <li key={f.id} className="flex items-center justify-between px-5 py-2.5">
                  <span>{f.reason}<span className="block text-xs text-slate-500">{fmtDate(f.dueDate)}</span></span>
                  <Badge tone={f.status === "DONE" ? "green" : f.dueDate < new Date() ? "red" : "amber"}>{f.status === "DONE" ? "Done" : "Pending"}</Badge>
                </li>
              ))}
            </ul>
            <form action={createFollowUp} className="space-y-3 border-t border-slate-100 p-5">
              <input type="hidden" name="patientId" value={p.id} />
              <Field label="Reason"><Input name="reason" placeholder="e.g. Check adaptation to progressives" required /></Field>
              <Field label="Due date"><Input name="dueDate" type="date" defaultValue={isoDate(addDays(new Date(), 14))} /></Field>
              <SubmitButton variant="secondary" className="w-full">Add follow-up</SubmitButton>
            </form>
          </Card>

          <Card>
            <CardHeader title="Message history" />
            <ul className="divide-y divide-slate-100 text-sm">
              {p.messages.map((m) => (
                <li key={m.id} className="px-5 py-2.5">
                  <div className="flex items-center justify-between">
                    <Badge tone={m.channel === "WHATSAPP" ? "green" : "blue"}>{m.channel === "WHATSAPP" ? "WhatsApp" : "SMS"}</Badge>
                    <span className="text-xs text-slate-400">{fmtDateTime(m.createdAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">{m.body}</p>
                </li>
              ))}
              {!p.messages.length && <li className="px-5 py-6 text-center text-slate-400">No messages sent.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
