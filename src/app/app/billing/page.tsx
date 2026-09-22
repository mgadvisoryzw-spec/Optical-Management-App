import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { activateInvoice, createSubscriptionInvoice, paynowConfigured, paynowInitiate } from "@/lib/billing";
import { Alert, Badge, Card, CardHeader, PageHeader, Table } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { cn, fmtDate, money, str } from "@/lib/utils";

export const metadata = { title: "Plan & billing" };

const sandboxAllowed = () => process.env.NODE_ENV !== "production" || process.env.ALLOW_SANDBOX_BILLING === "true";

async function checkout(fd: FormData) {
  "use server";
  const ctx = await requirePermission("billing");
  const plan = str(fd.get("plan"));
  const cycle = str(fd.get("cycle")) === "YEARLY" ? "YEARLY" : "MONTHLY";
  const method = str(fd.get("method"));
  const inv = await createSubscriptionInvoice(ctx.orgId, plan, cycle);
  if (method === "PAYNOW" && paynowConfigured()) {
    const url = await paynowInitiate({ invoiceId: inv.id, number: inv.number, amount: inv.amount, email: ctx.user.email, appUrl: process.env.APP_URL ?? "http://localhost:3000" });
    redirect(url);
  }
  // Sandbox activation is for development/demo only — never in production
  if (method === "SANDBOX" && !paynowConfigured() && sandboxAllowed()) {
    await activateInvoice(inv.id, "SANDBOX", "sandbox");
    redirect(`/app/billing?paid=${inv.number}`);
  }
  redirect(`/app/billing?invoice=${inv.id}&bank=1`);
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ locked?: string; paid?: string; bank?: string; invoice?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("billing");
  const [plans, invoices, users] = await Promise.all([
    db.plan.findMany({ orderBy: { sortOrder: "asc" } }),
    db.subscriptionInvoice.findMany({ where: { orgId: ctx.orgId }, orderBy: { createdAt: "desc" } }),
    db.user.count({ where: { orgId: ctx.orgId, active: true } }),
  ]);
  const org = ctx.org;
  const live = paynowConfigured();
  const pending = sp.bank && sp.invoice ? invoices.find((i) => i.id === sp.invoice) : null;

  return (
    <>
      <PageHeader title="Plan & billing" subtitle="Your OptiVault subscription" />
      <div className="space-y-4">
        {sp.locked && <Alert tone="red">{ctx.subscription.reason || "Your subscription needs attention."} You can still view your data, but you can't add or change records until you renew.</Alert>}
        {sp.paid && <Alert tone="green">Payment received for {sp.paid}. Your subscription is active. Thank you!</Alert>}
        {pending && (
          <Alert tone="amber">
            Invoice <b>{pending.number}</b> for <b>{money(pending.amount)}</b> has been created. To pay by bank transfer or EcoCash merchant, use <b>{pending.number}</b> as the payment reference and send the proof of payment to billing@optivault.app. Your account will be activated once the payment is confirmed.
          </Alert>
        )}
      </div>

      <div className="my-6 grid gap-4 md:grid-cols-4">
        <Card className="p-5"><p className="label">Current plan</p><p className="text-xl font-bold">{org.plan?.name ?? "—"}</p><p className="text-xs text-slate-500">{org.billingCycle.toLowerCase()}</p></Card>
        <Card className="p-5"><p className="label">Status</p><Badge tone={org.subscriptionStatus === "ACTIVE" ? "green" : org.subscriptionStatus === "TRIALING" ? "brand" : "red"}>{org.subscriptionStatus.toLowerCase().replace("_", " ")}</Badge><p className="mt-1 text-xs text-slate-500">{ctx.subscription.reason}</p></Card>
        <Card className="p-5"><p className="label">{org.subscriptionStatus === "TRIALING" ? "Trial ends" : "Renews"}</p><p className="text-xl font-bold">{fmtDate(org.subscriptionStatus === "TRIALING" ? org.trialEndsAt : org.currentPeriodEnd)}</p></Card>
        <Card className="p-5"><p className="label">Usage</p><p className="text-sm"><b>{ctx.branches.length}</b> / {org.plan?.maxBranches || "∞"} branches</p><p className="text-sm"><b>{users}</b> / {org.plan?.maxUsers || "∞"} users</p></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {plans.map((p) => {
          const current = org.planId === p.id;
          const features = JSON.parse(p.features) as string[];
          return (
            <Card key={p.id} className={cn("flex flex-col p-6", p.code === "PRACTICE" && "ring-2 ring-brand-500")}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">{p.name}</h3>
                {current && <Badge tone="brand">Current</Badge>}
              </div>
              <p className="text-sm text-slate-500">{p.tagline}</p>
              <p className="mt-4"><span className="text-4xl font-extrabold">${p.priceMonthlyUsd}</span><span className="text-slate-500">/mo</span></p>
              <p className="text-xs text-slate-500">or ${p.priceYearlyUsd}/year (2 months free)</p>
              <ul className="my-6 flex-1 space-y-2 text-sm">
                {features.map((f) => <li key={f} className="flex gap-2"><Check size={16} className="shrink-0 text-brand-600" />{f}</li>)}
              </ul>
              <form action={checkout} className="space-y-2">
                <input type="hidden" name="plan" value={p.code} />
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><input type="radio" name="cycle" value="MONTHLY" defaultChecked className="accent-brand-600" /> Monthly</label>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><input type="radio" name="cycle" value="YEARLY" className="accent-brand-600" /> Yearly</label>
                </div>
                {live ? (
                  <SubmitButton name="method" value="PAYNOW" className="w-full">Pay with Paynow (EcoCash / card)</SubmitButton>
                ) : sandboxAllowed() ? (
                  <SubmitButton name="method" value="SANDBOX" className="w-full">{current ? "Renew" : "Switch"} (sandbox payment)</SubmitButton>
                ) : null}
                <SubmitButton name="method" value="BANK" variant="ghost" className="w-full">Pay by bank transfer instead</SubmitButton>
              </form>
            </Card>
          );
        })}
      </div>
      {!live && <p className="mt-4 text-center text-xs text-slate-400">Sandbox mode: set PAYNOW_INTEGRATION_ID and PAYNOW_INTEGRATION_KEY to take real payments through Paynow (EcoCash, OneMoney, Visa/Mastercard).</p>}

      <Card className="mt-6">
        <CardHeader title="Billing history" />
        <Table>
          <thead><tr><th>Invoice</th><th>Date</th><th>Plan</th><th>Period</th><th>Method</th><th>Status</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td className="font-semibold">{i.number}</td>
                <td>{fmtDate(i.createdAt)}</td>
                <td>{i.planCode} · {i.cycle.toLowerCase()}</td>
                <td className="text-sm">{fmtDate(i.periodStart)} – {fmtDate(i.periodEnd)}</td>
                <td>{i.method ?? "—"}</td>
                <td><Badge tone={i.status === "PAID" ? "green" : i.status === "OPEN" ? "amber" : "slate"}>{i.status.toLowerCase()}</Badge></td>
                <td className="num">{money(i.amount)}</td>
              </tr>
            ))}
            {!invoices.length && <tr><td colSpan={7} className="py-8 text-center text-slate-400">No invoices yet.</td></tr>}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
