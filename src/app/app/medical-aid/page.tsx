import Link from "next/link";
import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table } from "@/components/ui";
import { CLAIM_STATUSES, labelOf, toneOf } from "@/lib/constants";
import { cn, fmtDate, fullName, money, round2 } from "@/lib/utils";
import { AutoSubmitSelect } from "@/components/client";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Medical aid claims" };

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ status?: string; aid?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const where: Prisma.MedicalAidClaimWhereInput = { orgId: ctx.orgId };
  if (sp.status === "OPEN") where.status = { in: ["PENDING_AUTH", "AUTHORISED", "SUBMITTED", "PART_PAID"] };
  else if (sp.status) where.status = sp.status;
  if (sp.aid) where.medicalAidId = sp.aid;

  const [claims, all, aids] = await Promise.all([
    db.medicalAidClaim.findMany({ where, include: { patient: true, medicalAid: true, order: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.medicalAidClaim.findMany({ where: { orgId: ctx.orgId, status: { in: ["PENDING_AUTH", "AUTHORISED", "SUBMITTED", "PART_PAID"] } }, include: { medicalAid: true } }),
    db.medicalAid.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
  ]);

  // Ageing by funder (base currency)
  const now = Date.now();
  const buckets = ["0–30", "31–60", "61–90", "90+"];
  const ageing = new Map<string, number[]>();
  for (const c of all) {
    const out = (c.amount - c.paidAmount) / (c.exchangeRate || 1);
    const days = (now - (c.submittedAt ?? c.createdAt).getTime()) / 86400000;
    const b = days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3;
    const row = ageing.get(c.medicalAid.name) ?? [0, 0, 0, 0];
    row[b] += out;
    ageing.set(c.medicalAid.name, row);
  }

  const tabs = [{ v: "", l: "All" }, { v: "OPEN", l: "Open" }, ...CLAIM_STATUSES.map((s) => ({ v: s.value, l: s.label }))];

  return (
    <>
      <PageHeader title="Medical aid claims" subtitle="Pre-authorisations, submissions, remittances and shortfalls" />
      <Card className="mb-6">
        <CardHeader title="Outstanding by funder" subtitle={`Ageing in ${ctx.org.baseCurrency}, from submission date (or creation if not yet submitted)`} />
        {ageing.size ? (
          <Table>
            <thead><tr><th>Funder</th>{buckets.map((b) => <th key={b} className="num">{b} days</th>)}<th className="num">Total</th></tr></thead>
            <tbody>
              {[...ageing.entries()].map(([name, row]) => (
                <tr key={name}>
                  <td className="font-semibold">{name}</td>
                  {row.map((v, i) => <td key={i} className={cn("num", i === 3 && v > 0 && "font-semibold text-rose-600")}>{money(round2(v))}</td>)}
                  <td className="num font-bold">{money(round2(row.reduce((a, b) => a + b, 0)))}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="p-6 text-center text-sm text-slate-400">No outstanding claims.</p>
        )}
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <Link
            key={t.v}
            href={`?${new URLSearchParams({ ...(t.v ? { status: t.v } : {}), ...(sp.aid ? { aid: sp.aid } : {}) })}`}
            className={cn("whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold", (sp.status ?? "") === t.v ? "bg-ink-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}
          >
            {t.l}
          </Link>
        ))}
        <form className="ml-auto">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <AutoSubmitSelect name="aid" defaultValue={sp.aid ?? ""} className="w-52 py-1.5" options={[{ value: "", label: "All funders" }, ...aids.map((a) => ({ value: a.id, label: a.name }))]} />
        </form>
      </div>

      <Card>
        {claims.length ? (
          <Table>
            <thead><tr><th>Claim</th><th>Patient</th><th>Funder</th><th>Order</th><th>Status</th><th>Auth no.</th><th className="num">Claimed</th><th className="num">Paid</th><th /></tr></thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/app/medical-aid/${c.id}`} className="font-semibold text-brand-700">{c.claimNo}</Link><span className="block text-xs text-slate-400">{fmtDate(c.createdAt)}</span></td>
                  <td>{fullName(c.patient)}<span className="block text-xs text-slate-400">{c.memberNo}</span></td>
                  <td>{c.medicalAid.name}</td>
                  <td><Link href={`/app/orders/${c.orderId}`} className="text-brand-700">{c.order.orderNo}</Link></td>
                  <td><Badge tone={toneOf(CLAIM_STATUSES, c.status)}>{labelOf(CLAIM_STATUSES, c.status)}</Badge></td>
                  <td>{c.authNumber ?? "—"}</td>
                  <td className="num">{money(c.amount, c.currency)}</td>
                  <td className="num">{money(c.paidAmount, c.currency)}</td>
                  <td className="text-right"><Link href={`/app/medical-aid/${c.id}#edit`} className="text-xs font-semibold text-brand-700 hover:underline">Edit</Link></td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No claims" text="A claim is created when you add a medical aid portion to an order." />
        )}
      </Card>
    </>
  );
}
