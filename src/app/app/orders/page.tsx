import Link from "next/link";
import { Plus } from "lucide-react";
import { getContext, branchScope } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table } from "@/components/ui";
import { ORDER_STATUSES, labelOf, toneOf } from "@/lib/constants";
import { cn, fmtDate, fullName, money } from "@/lib/utils";
import { like } from "@/lib/search";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Orders" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const where: Prisma.OrderWhereInput = { orgId: ctx.orgId, ...branchScope(ctx) };
  if (sp.status === "OPEN") where.status = { in: ["AWAITING_AUTH", "ORDERED", "IN_LAB", "READY"] };
  else if (sp.status) where.status = sp.status;
  if (sp.q) where.OR = [{ orderNo: like(sp.q) }, { patient: { lastName: like(sp.q) } }, { patient: { firstName: like(sp.q) } }];

  const [orders, counts] = await Promise.all([
    db.order.findMany({ where, include: { patient: true, branch: true, medicalAid: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.order.groupBy({ by: ["status"], where: { orgId: ctx.orgId, ...branchScope(ctx) }, _count: true }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const tabs = [{ value: "", label: "All" }, { value: "OPEN", label: "Open" }, ...ORDER_STATUSES.map((s) => ({ value: s.value, label: s.label }))];

  return (
    <>
      <PageHeader title="Orders & jobs" subtitle="Spectacle, contact lens, repair and consultation sales" actions={<LinkButton href="/app/orders/new"><Plus size={16} /> New order</LinkButton>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = (sp.status ?? "") === t.value;
          const n = t.value === "" ? null : t.value === "OPEN" ? ["AWAITING_AUTH", "ORDERED", "IN_LAB", "READY"].reduce((s, x) => s + count(x), 0) : count(t.value);
          return (
            <Link key={t.value} href={t.value ? `?status=${t.value}` : "?"} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", active ? "bg-ink-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>
              {t.label}
              {n !== null && <span className={cn("ml-1.5", active ? "text-slate-300" : "text-slate-400")}>{n}</span>}
            </Link>
          );
        })}
      </div>
      <Card>
        <form className="border-b border-slate-100 p-4">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <input name="q" defaultValue={sp.q} placeholder="Search order no. or patient…" className="input max-w-sm" />
        </form>
        {orders.length ? (
          <Table>
            <thead>
              <tr><th>Order</th><th>Patient</th><th>Date</th><th>Status</th><th>Funder</th>{!ctx.branchId && <th>Branch</th>}<th className="num">Total</th><th className="num">Patient balance</th></tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/app/orders/${o.id}`} className="font-semibold text-brand-700 hover:underline">{o.orderNo}</Link></td>
                  <td>{fullName(o.patient)}</td>
                  <td>{fmtDate(o.createdAt)}</td>
                  <td><Badge tone={toneOf(ORDER_STATUSES, o.status)}>{labelOf(ORDER_STATUSES, o.status)}</Badge></td>
                  <td className="text-sm text-slate-500">{o.medicalAid?.name ?? "Private"}</td>
                  {!ctx.branchId && <td className="text-sm text-slate-500">{o.branch.name}</td>}
                  <td className="num">{money(o.total, o.currency)}</td>
                  <td className={cn("num font-semibold", o.patientPortion - o.amountPaid > 0.009 && o.status !== "CANCELLED" ? "text-amber-600" : "text-slate-400")}>
                    {o.status === "CANCELLED" ? "—" : money(o.patientPortion - o.amountPaid, o.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No orders here" text="Create an order from a patient's record or with the New order button." action={<LinkButton href="/app/orders/new">New order</LinkButton>} />
        )}
      </Card>
    </>
  );
}
