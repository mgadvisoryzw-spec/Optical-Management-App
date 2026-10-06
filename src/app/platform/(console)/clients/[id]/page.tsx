import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLATFORM_ACTIONS, clientHealth, clientMrr } from "@/lib/platform";
import { Alert, Badge, Card, CardHeader, Field, Input, PageHeader, Select, Table, Textarea } from "@/components/ui";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { ROLE_LABELS } from "@/lib/constants";
import { fmtDate, fmtDateTime, money } from "@/lib/utils";
import { approvePayment, extendTrial, grantAccess, raiseInvoice, resetClientUserPassword, saveClientNotes, setSuspended, switchPlan, voidInvoice } from "../../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const org = await db.organization.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: org?.name ?? "Client" };
}

const PAYMENT_METHODS = [
  { value: "BANK", label: "Bank transfer / RTGS" },
  { value: "ECOCASH", label: "EcoCash" },
  { value: "PAYNOW", label: "Paynow" },
  { value: "CASH", label: "Cash" },
  { value: "MANUAL", label: "Other / recorded manually" },
];

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  await requirePlatformOwner();
  const { id } = await params;
  const sp = await searchParams;
  const [org, plans] = await Promise.all([
    db.organization.findUnique({
      where: { id },
      include: {
        plan: true,
        branches: { orderBy: { name: "asc" } },
        users: { orderBy: [{ role: "asc" }, { name: "asc" }] },
        subscriptionInvoices: { orderBy: { createdAt: "desc" }, include: { approvedBy: { select: { name: true } } } },
        _count: { select: { patients: true, orders: true, receipts: true, messages: true } },
      },
    }),
    db.plan.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  if (!org) notFound();

  const audits = await db.platformAudit.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "desc" }, take: 25 });
  const health = clientHealth(org);
  const mrr = clientMrr(org);
  const openInvoices = org.subscriptionInvoices.filter((i) => i.status === "OPEN");
  const paidTotal = org.subscriptionInvoices.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amount, 0);
  const planOptions = plans.map((p) => ({ value: p.code, label: `${p.name} — $${p.priceMonthlyUsd}/mo · $${p.priceYearlyUsd}/yr` }));
  const resettable = org.users.filter((u) => !u.isSuperAdmin);

  return (
    <>
      <PageHeader
        title={org.name}
        subtitle={
          <>
            {org.email ?? "no email on file"} · {org.phone ?? "no phone"} · joined {fmtDate(org.createdAt)}
          </>
        }
        back={{ href: "/platform/clients", label: "Clients" }}
        actions={
          <>
            <Badge tone={health.tone}>{health.label}</Badge>
            {org.suspendedAt ? (
              <form action={setSuspended.bind(null, org.id, false)}>
                <SubmitButton variant="secondary" className="text-xs">Reactivate client</SubmitButton>
              </form>
            ) : (
              <form action={setSuspended.bind(null, org.id, true)}>
                <ConfirmButton variant="secondary" className="text-xs" message={`Suspend ${org.name}? Their staff will keep read access but cannot record anything until you reactivate them.`}>
                  Suspend client
                </ConfirmButton>
              </form>
            )}
          </>
        }
      />

      {sp.done && <div className="mb-6"><Alert tone="green">{sp.done}</Alert></div>}
      {sp.error && <div className="mb-6"><Alert tone="red">{sp.error}</Alert></div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="p-5">
          <p className="label">Plan</p>
          <p className="text-xl font-bold">{org.plan?.name ?? "—"}</p>
          <p className="text-xs text-slate-500">{org.billingCycle.toLowerCase()} · {mrr ? `${money(mrr)}/mo` : "unbilled"}</p>
        </Card>
        <Card className="p-5">
          <p className="label">{org.subscriptionStatus === "TRIALING" ? "Trial ends" : "Paid up to"}</p>
          <p className="text-xl font-bold">{fmtDate(org.subscriptionStatus === "TRIALING" ? org.trialEndsAt : org.currentPeriodEnd)}</p>
          <p className="text-xs text-slate-500">{health.daysLeft !== null ? (health.daysLeft >= 0 ? `${health.daysLeft} days remaining` : `${Math.abs(health.daysLeft)} days overdue`) : "—"}</p>
        </Card>
        <Card className="p-5">
          <p className="label">Billed to date</p>
          <p className="text-xl font-bold">{money(paidTotal)}</p>
          <p className="text-xs text-slate-500">{org.subscriptionInvoices.length} invoice(s)</p>
        </Card>
        <Card className="p-5">
          <p className="label">Usage</p>
          <p className="text-sm"><b>{org.branches.length}</b> / {org.plan?.maxBranches || "∞"} branches</p>
          <p className="text-sm"><b>{org.users.filter((u) => u.active).length}</b> / {org.plan?.maxUsers || "∞"} users</p>
        </Card>
        <Card className="p-5">
          <p className="label">Records</p>
          <p className="text-sm"><b>{org._count.patients.toLocaleString()}</b> patients</p>
          <p className="text-sm"><b>{org._count.orders.toLocaleString()}</b> orders · <b>{org._count.receipts.toLocaleString()}</b> receipts</p>
        </Card>
      </div>

      {openInvoices.length > 0 && (
        <Card className="mb-6 ring-2 ring-amber-300">
          <CardHeader title="Payment awaiting your approval" subtitle="Confirm the money has landed, then approve to switch the subscription on." />
          <div className="divide-y divide-slate-100">
            {openInvoices.map((i) => (
              <div key={i.id} className="p-5">
                <p className="font-semibold">
                  {i.number} — {i.planCode} {i.cycle.toLowerCase()} · {money(i.amount)}
                </p>
                <p className="text-xs text-slate-500">
                  Covers {fmtDate(i.periodStart)} – {fmtDate(i.periodEnd)} · raised {fmtDate(i.createdAt)}
                </p>
                <form action={approvePayment.bind(null, i.id)} className="mt-3 grid gap-3 sm:grid-cols-5">
                  <Field label="Paid by"><Select name="method" defaultValue="BANK" options={PAYMENT_METHODS} /></Field>
                  <Field label="Payment reference"><Input name="reference" placeholder="e.g. RTGS 884412" /></Field>
                  <Field label="Note (internal)" className="sm:col-span-2"><Input name="notes" placeholder="e.g. POP emailed 06/10" /></Field>
                  <div className="flex items-end">
                    <SubmitButton pendingText="Approving…">Approve</SubmitButton>
                  </div>
                </form>
                <form action={voidInvoice.bind(null, i.id)} className="mt-2">
                  <ConfirmButton variant="ghost" className="px-0 text-xs text-slate-400" message={`Void invoice ${i.number}?`}>
                    Void this invoice instead
                  </ConfirmButton>
                </form>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Grant paid access"
            subtitle="Use this when the client has paid MG Advisory directly. It records a paid invoice and opens the plan for the term."
          />
          <form action={grantAccess.bind(null, org.id)} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Plan"><Select name="planCode" defaultValue={org.plan?.code ?? "PRACTICE"} options={planOptions} /></Field>
            <Field label="Months of access" hint="12 months is billed as a yearly subscription"><Input name="months" type="number" min={1} max={60} defaultValue={12} /></Field>
            <Field label="Amount received (USD)" hint="Leave blank to use the plan's list price"><Input name="amount" type="number" step="0.01" placeholder="auto" /></Field>
            <Field label="Paid by"><Select name="method" defaultValue="BANK" options={PAYMENT_METHODS} /></Field>
            <Field label="Payment reference"><Input name="reference" placeholder="e.g. EcoCash MP250106.1234" /></Field>
            <Field label="Internal note"><Input name="notes" placeholder="e.g. 12 months paid upfront" /></Field>
            <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
              <input type="checkbox" name="startNow" className="accent-brand-600" />
              Start the term today instead of when the current paid period ends
            </label>
            <div className="sm:col-span-2">
              <SubmitButton pendingText="Granting access…">Grant access &amp; mark paid</SubmitButton>
            </div>
          </form>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Change plan" subtitle="Moves them onto another plan without changing the paid-up date" />
            <form action={switchPlan.bind(null, org.id)} className="space-y-3 p-5">
              <Select name="planCode" defaultValue={org.plan?.code ?? "PRACTICE"} options={planOptions} />
              <SubmitButton variant="secondary" className="w-full">Apply plan change</SubmitButton>
            </form>
          </Card>
          <Card>
            <CardHeader title="Extend trial" subtitle="Give them more time before they have to pay" />
            <form action={extendTrial.bind(null, org.id)} className="flex items-end gap-2 p-5">
              <Field label="Days" className="flex-1"><Input name="days" type="number" min={1} max={180} defaultValue={14} /></Field>
              <SubmitButton variant="secondary">Extend</SubmitButton>
            </form>
          </Card>
          <Card>
            <CardHeader title="Raise an invoice" subtitle="Send the client something to pay, then approve it when the money arrives" />
            <form action={raiseInvoice.bind(null, org.id)} className="space-y-3 p-5">
              <Select name="planCode" defaultValue={org.plan?.code ?? "PRACTICE"} options={planOptions} />
              <Select name="cycle" defaultValue={org.billingCycle} options={[{ value: "MONTHLY", label: "Monthly" }, { value: "YEARLY", label: "Yearly" }]} />
              <SubmitButton variant="secondary" className="w-full">Raise invoice</SubmitButton>
            </form>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Billing history" />
          <Table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Raised</th>
                <th>Plan</th>
                <th>Period</th>
                <th>Method</th>
                <th>Approved by</th>
                <th>Status</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {org.subscriptionInvoices.map((i) => (
                <tr key={i.id}>
                  <td className="font-semibold">{i.number}</td>
                  <td className="text-xs text-slate-500">{fmtDate(i.createdAt)}</td>
                  <td className="text-sm">{i.planCode} · {i.cycle.toLowerCase()}</td>
                  <td className="text-xs text-slate-500">{fmtDate(i.periodStart)} – {fmtDate(i.periodEnd)}</td>
                  <td className="text-sm">{i.method ?? "—"}{i.reference && <span className="block text-xs text-slate-400">{i.reference}</span>}</td>
                  <td className="text-xs text-slate-500">{i.approvedBy?.name ?? "—"}{i.approvedAt && <span className="block">{fmtDate(i.approvedAt)}</span>}</td>
                  <td><Badge tone={i.status === "PAID" ? "green" : i.status === "OPEN" ? "amber" : "slate"}>{i.status.toLowerCase()}</Badge></td>
                  <td className="num">{money(i.amount)}</td>
                </tr>
              ))}
              {!org.subscriptionInvoices.length && (
                <tr><td colSpan={8} className="py-8 text-center text-slate-400">No invoices yet.</td></tr>
              )}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Account management" subtitle="Internal only — never shown to the client" />
          <form action={saveClientNotes.bind(null, org.id)} className="space-y-3 p-5">
            <Field label="Account manager"><Input name="accountManager" defaultValue={org.accountManager ?? ""} placeholder="MG Advisory staff member" /></Field>
            <Field label="Notes"><Textarea name="platformNotes" rows={6} defaultValue={org.platformNotes ?? ""} placeholder="Payment arrangements, onboarding status, support history…" /></Field>
            <SubmitButton variant="secondary" className="w-full">Save notes</SubmitButton>
          </form>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Users at this practice" subtitle={`${org.users.filter((u) => u.active).length} active of ${org.users.length}`} />
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Branch</th>
                <th>Last sign-in</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {org.users.map((u) => (
                <tr key={u.id} className={u.active ? undefined : "opacity-50"}>
                  <td className="font-semibold">{u.name}<span className="block text-xs font-normal text-slate-400">{u.email}</span></td>
                  <td><Badge tone={u.role === "OWNER" ? "brand" : "slate"}>{ROLE_LABELS[u.role] ?? u.role}</Badge></td>
                  <td className="text-sm">{org.branches.find((b) => b.id === u.branchId)?.name ?? "All"}</td>
                  <td className="text-xs text-slate-500">{fmtDateTime(u.lastLoginAt)}</td>
                  <td className="text-xs">{u.active ? "Active" : "Deactivated"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          {resettable.length > 0 && (
            <div className="border-t border-slate-100 p-5">
              <p className="label mb-3">Reset a password (support request)</p>
              <form action={resetClientUserPassword.bind(null, org.id)} className="flex flex-wrap items-end gap-3">
                <Field label="Account" className="min-w-56 flex-1">
                  <Select name="userId" defaultValue={resettable[0].id} options={resettable.map((u) => ({ value: u.id, label: `${u.name} · ${u.email}` }))} />
                </Field>
                <Field label="New temporary password"><Input name="password" type="text" minLength={8} required placeholder="min 8 characters" /></Field>
                <ConfirmButton variant="secondary" message="Reset this user's password? Share the new one with them over a secure channel.">Reset password</ConfirmButton>
              </form>
              <p className="mt-2 text-xs text-slate-400">The practice can edit its own administrators and staff under Settings → Users &amp; roles.</p>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Branches" />
          <Table>
            <tbody>
              {org.branches.map((b) => (
                <tr key={b.id}>
                  <td className="font-semibold">{b.name}</td>
                  <td><Badge>{b.code}</Badge></td>
                  <td className="text-xs text-slate-500">{b.address ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <CardHeader title="Console activity for this client" />
          <ul className="divide-y divide-slate-100">
            {audits.map((a) => (
              <li key={a.id} className="px-5 py-3 text-sm">
                <p className="font-semibold text-slate-800">{PLATFORM_ACTIONS[a.action as keyof typeof PLATFORM_ACTIONS] ?? a.action}</p>
                {a.detail && <p className="mt-0.5 text-xs text-slate-500">{a.detail}</p>}
                <p className="mt-0.5 text-xs text-slate-400">{a.actorName} · {fmtDateTime(a.createdAt)}</p>
              </li>
            ))}
            {!audits.length && <li className="px-5 py-6 text-center text-sm text-slate-400">Nothing logged for this client yet.</li>}
          </ul>
        </Card>
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Need to look at their books? Sign in with the practice's own credentials — the console deliberately does not
        read patient or clinical records. <Link href="/platform/clients" className="font-semibold text-brand-700 hover:underline">Back to clients</Link>
      </p>
    </>
  );
}
