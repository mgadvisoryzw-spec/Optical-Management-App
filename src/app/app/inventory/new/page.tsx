import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Alert, PageHeader } from "@/components/ui";
import { ProductForm } from "../product-form";
import { createProduct } from "../actions";

export const metadata = { title: "New inventory item" };

export default async function NewProduct({ searchParams }: { searchParams: Promise<{ category?: string; saved?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const suppliers = await db.supplier.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="Add inventory item" back={{ href: "/app/inventory", label: "Inventory" }} />
      {sp.saved && <div className="mb-4"><Alert tone="green">Saved “{sp.saved}”. Add the next one.</Alert></div>}
      <ProductForm action={createProduct} suppliers={suppliers} defaultCategory={sp.category} baseCurrency={ctx.org.baseCurrency} />
    </>
  );
}
