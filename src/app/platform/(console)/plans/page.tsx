import { Check } from "lucide-react";
import { requirePlatformOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientMrr } from "@/lib/platform";
import { Alert, Badge, Card, CardHeader, Field, Input, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { money } from "@/lib/utils";
import { savePlanPricing } from "../actions";

export const metadata = { title: "Plans & pricing" };

export default async function PlansPage() {
  await requirePlatformOwner();
  const plans = await db.plan.findMany({ orderBy: { sortOrder: "asc" }, include: { organizations: { include: { plan: true } } } });

  return (
    <>
      <PageHeader
        title="Plans & pricing"
        subtitle="What MG Advisory charges for OptiVault. Changes show immediately on the public pricing page and on every client's billing screen."
      />
      <Alert tone="amber">
        Changing a price does not re-bill anyone. Clients keep the amount on their current paid invoice until their next
        renewal, which will use the new price.
      </Alert>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {plans.map((p) => {
          const features = JSON.parse(p.features) as string[];
          const subscribers = p.organizations.filter((o) => o.subscriptionStatus === "ACTIVE");
          const planMrr = subscribers.reduce((s, o) => s + clientMrr(o), 0);
          return (
            <Card key={p.id} className="flex flex-col">
              <CardHeader
                title={<span className="flex items-center gap-2">{p.name} <Badge tone="slate">{p.code}</Badge></span>}
                subtitle={`${subscribers.length} paying · ${money(planMrr)}/mo`}
              />
              <form action={savePlanPricing.bind(null, p.id)} className="grid gap-3 p-5 sm:grid-cols-2">
                <Field label="Display name" className="sm:col-span-2"><Input name="name" defaultValue={p.name} /></Field>
                <Field label="Tagline" className="sm:col-span-2"><Input name="tagline" defaultValue={p.tagline} /></Field>
                <Field label="Monthly (USD)"><Input name="priceMonthlyUsd" type="number" step="0.01" min={0} defaultValue={p.priceMonthlyUsd} /></Field>
                <Field label="Yearly (USD)"><Input name="priceYearlyUsd" type="number" step="0.01" min={0} defaultValue={p.priceYearlyUsd} /></Field>
                <Field label="Max branches" hint="0 = unlimited"><Input name="maxBranches" type="number" min={0} defaultValue={p.maxBranches} /></Field>
                <Field label="Max users" hint="0 = unlimited"><Input name="maxUsers" type="number" min={0} defaultValue={p.maxUsers} /></Field>
                <Field label="Messages / month" className="sm:col-span-2"><Input name="monthlyMessages" type="number" min={0} defaultValue={p.monthlyMessages} /></Field>
                <div className="sm:col-span-2"><SubmitButton className="w-full">Save {p.name}</SubmitButton></div>
              </form>
              <div className="border-t border-slate-100 p-5">
                <p className="label mb-2">Included features</p>
                <ul className="space-y-1.5 text-sm text-slate-600">
                  {features.map((f) => (
                    <li key={f} className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-brand-600" />{f}</li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-slate-400">
                  Feature lists are part of the product copy and live in <code>src/lib/plans.ts</code>.
                </p>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
