import Link from "next/link";
import { Plus } from "lucide-react";
import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, EmptyState, LinkButton, PageHeader, StatCard, Table } from "@/components/ui";
import { LENS_TYPES, PRODUCT_CATEGORIES, labelOf } from "@/lib/constants";
import { cn, money, round2 } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ cat?: string; q?: string; low?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const where: Prisma.ProductWhereInput = { orgId: ctx.orgId, active: true };
  if (sp.cat) where.category = sp.cat;
  if (sp.q) where.OR = ["name", "sku", "brand", "model", "colour", "reference"].map((f) => ({ [f]: { contains: sp.q } }));
  const products = await db.product.findMany({ where, include: { stock: true, supplier: true }, orderBy: [{ category: "asc" }, { name: "asc" }], take: 500 });
  const qty = (p: (typeof products)[number]) => p.stock.filter((s) => !ctx.branchId || s.branchId === ctx.branchId).reduce((a, s) => a + s.quantity, 0);
  let rows = products.map((p) => ({ ...p, qty: qty(p) }));
  if (sp.low) rows = rows.filter((p) => p.trackStock && p.qty <= p.reorderLevel);
  const value = round2(rows.reduce((s, p) => s + (p.trackStock ? Math.max(0, p.qty) * p.costPrice : 0), 0));
  const retail = round2(rows.reduce((s, p) => s + (p.trackStock ? Math.max(0, p.qty) * p.sellPrice : 0), 0));
  const lowCount = rows.filter((p) => p.trackStock && p.qty <= p.reorderLevel).length;
  const link = (params: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ cat: sp.cat, q: sp.q, low: sp.low, ...params }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle={ctx.branchId ? `Stock at ${ctx.branches.find((b) => b.id === ctx.branchId)?.name}` : "Stock across all branches"}
        actions={
          <>
            <LinkButton variant="secondary" href="/app/inventory/valuation">Stock valuation</LinkButton>
            <LinkButton variant="secondary" href="/app/purchases/new">Receive stock</LinkButton>
            <LinkButton href={`/app/inventory/new${sp.cat ? `?category=${sp.cat}` : ""}`}><Plus size={16} /> Add item</LinkButton>
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Stock value at cost" value={money(value, ctx.org.baseCurrency)} hint={`${rows.length} items`} />
        <StatCard label="Stock value at retail" value={money(retail, ctx.org.baseCurrency)} accent="violet" hint={value ? `Potential margin ${money(retail - value)}` : undefined} />
        <StatCard label="Low / out of stock" value={lowCount} accent={lowCount ? "amber" : "green"} hint={<Link href={link({ low: sp.low ? undefined : "1" })} className="font-semibold text-brand-700">{sp.low ? "Show all" : "Show only these"}</Link>} />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={link({ cat: undefined })} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", !sp.cat ? "bg-ink-900 text-white" : "bg-white ring-1 ring-slate-200")}>All</Link>
        {PRODUCT_CATEGORIES.map((c) => (
          <Link key={c.value} href={link({ cat: c.value })} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", sp.cat === c.value ? "bg-ink-900 text-white" : "bg-white ring-1 ring-slate-200")}>{c.label}</Link>
        ))}
        <form className="ml-auto">
          {sp.cat && <input type="hidden" name="cat" value={sp.cat} />}
          <input name="q" defaultValue={sp.q} placeholder="Search brand, model, colour, ref, SKU…" className="input w-72" />
        </form>
      </div>
      <Card>
        {rows.length ? (
          <Table>
            <thead><tr><th>Item</th><th>Details</th><th>Supplier</th><th className="num">Cost</th><th className="num">Price</th><th className="num">On hand</th><th className="num">Value</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/app/inventory/${p.id}`} className="font-semibold text-slate-900 hover:text-brand-700">{p.name}</Link><span className="block text-xs text-slate-400">{p.sku} · {labelOf(PRODUCT_CATEGORIES, p.category)}</span></td>
                  <td className="text-xs text-slate-500">
                    {p.category === "FRAME" && [p.colour, p.reference && `ref ${p.reference}`, p.frameSize, p.material].filter(Boolean).join(" · ")}
                    {p.category === "LENS" && [labelOf(LENS_TYPES, p.lensType), p.lensIndex, p.coating].filter(Boolean).join(" · ")}
                    {!["FRAME", "LENS"].includes(p.category) && [p.brand, p.reference].filter(Boolean).join(" · ")}
                  </td>
                  <td className="text-sm text-slate-500">{p.supplier?.name ?? "—"}</td>
                  <td className="num">{money(p.costPrice)}</td>
                  <td className="num font-semibold">{money(p.sellPrice)}</td>
                  <td className="num">{p.trackStock ? <Badge tone={p.qty <= 0 ? "red" : p.qty <= p.reorderLevel ? "amber" : "green"}>{p.qty} {p.unit}</Badge> : <span className="text-xs text-slate-400">not tracked</span>}</td>
                  <td className="num text-slate-500">{p.trackStock ? money(Math.max(0, p.qty) * p.costPrice) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No items found" text="Add frames by brand, model, colour and reference, and lenses by type, index and coating." action={<LinkButton href="/app/inventory/new">Add your first item</LinkButton>} />
        )}
      </Card>
    </>
  );
}
