import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { PurchaseBuilder } from "./purchase-builder";
import { createPurchase } from "../actions";
import { isoDate } from "@/lib/utils";

export const metadata = { title: "New purchase" };

export default async function NewPurchase() {
  const ctx = await getContext();
  const [products, suppliers, currencies] = await Promise.all([
    db.product.findMany({ where: { orgId: ctx.orgId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true, category: true, costPrice: true } }),
    db.supplier.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.currency.findMany({ where: { orgId: ctx.orgId, active: true }, orderBy: { isBase: "desc" } }),
  ]);
  return (
    <>
      <PageHeader title="Record a purchase" subtitle="Frames, lenses, contact lenses, accessories and consumables from suppliers and labs" back={{ href: "/app/purchases", label: "Purchases" }} />
      <PurchaseBuilder
        action={createPurchase}
        products={products}
        suppliers={suppliers}
        currencies={currencies.map((c) => ({ code: c.code, rate: c.rate }))}
        branches={ctx.branches.map((b) => ({ id: b.id, name: b.name }))}
        defaultBranch={ctx.workingBranchId}
        baseCurrency={ctx.org.baseCurrency}
        today={isoDate(new Date())}
      />
    </>
  );
}
