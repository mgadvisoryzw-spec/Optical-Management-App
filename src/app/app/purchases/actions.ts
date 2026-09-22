"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWrite } from "@/lib/auth";
import { paySupplierInvoice, recordPurchase, type PurchaseLineInput } from "@/lib/services";
import { num, optDate, optStr, round2, str } from "@/lib/utils";

/** Details for an item that is being added to inventory for the first time as part of a purchase. */
type NewStockItem = {
  brand?: string; model?: string; colour?: string; reference?: string; frameSize?: string; material?: string;
  lensType?: string; lensIndex?: string; coating?: string; name?: string; sellPrice?: number; unit?: string;
};
type PurchaseLinePayload = PurchaseLineInput & { newItem?: NewStockItem | null };

const SKU_PREFIX: Record<string, string> = { FRAME: "FR", LENS: "LN", CONTACT_LENS: "CL", ACCESSORY: "AC", CONSUMABLE: "CS" };
const LENS_LABEL: Record<string, string> = { SINGLE_VISION: "Single vision", BIFOCAL: "Bifocal", MULTIFOCAL: "Progressive", OFFICE: "Office" };

function newItemName(category: string, n: NewStockItem) {
  const clean = (xs: (string | undefined)[]) => xs.map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
  if (n.name?.trim()) return n.name.trim();
  if (category === "FRAME") return clean([n.brand, n.model, n.colour]);
  if (category === "LENS") return clean([LENS_LABEL[n.lensType ?? ""] ?? "", n.lensIndex, n.coating, "(pair)"]);
  return clean([n.brand, n.model]);
}

export async function createPurchase(fd: FormData) {
  const ctx = await requireWrite("inventory");
  const fail = (msg: string) => redirect(`/app/purchases/new?error=${encodeURIComponent(msg)}`);
  const lines = (JSON.parse(str(fd.get("items")) || "[]") as PurchaseLinePayload[]).filter((i) => i.quantity > 0 && (i.description || i.newItem));
  if (!lines.length) fail("Add at least one item to the purchase.");
  for (const i of lines) if (i.productId) await db.product.findFirstOrThrow({ where: { id: i.productId, orgId: ctx.orgId } });
  for (const i of lines) if (i.newItem && !newItemName(i.category, i.newItem)) fail("Give each new stock item a brand and model (frames), a lens type (lenses) or a name.");
  const currency = str(fd.get("currency")) || ctx.org.baseCurrency;
  const cur = await db.currency.findUniqueOrThrow({ where: { orgId_code: { orgId: ctx.orgId, code: currency } } });
  const exchangeRate = num(fd.get("exchangeRate"), cur.rate) || cur.rate;
  const paid = str(fd.get("paid")) === "yes";
  const newSupplierName = str(fd.get("newSupplierName"));
  let supplierId = optStr(fd.get("supplierId"));
  if (supplierId === "__new") supplierId = null;
  if (supplierId) await db.supplier.findFirstOrThrow({ where: { id: supplierId, orgId: ctx.orgId } });

  const p = await db.$transaction(async (tx) => {
    if (!supplierId && newSupplierName) {
      supplierId = (await tx.supplier.create({ data: { orgId: ctx.orgId, name: newSupplierName, isLab: fd.get("newSupplierIsLab") === "on" } })).id;
    }
    // Create inventory items that are being bought for the first time
    const items: PurchaseLineInput[] = [];
    for (const l of lines) {
      if (!l.newItem) {
        items.push({ productId: l.productId || null, category: l.category, description: l.description, quantity: l.quantity, unitCost: l.unitCost });
        continue;
      }
      const n = l.newItem;
      const name = newItemName(l.category, n);
      const prefix = SKU_PREFIX[l.category] ?? "IT";
      const count = await tx.product.count({ where: { orgId: ctx.orgId, category: l.category } });
      let sku = `${prefix}-${String(count + 1).padStart(4, "0")}`;
      while (await tx.product.findUnique({ where: { orgId_sku: { orgId: ctx.orgId, sku } } })) sku = `${sku}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      const product = await tx.product.create({
        data: {
          orgId: ctx.orgId, category: l.category, sku, name,
          brand: n.brand?.trim() || null, model: n.model?.trim() || null, colour: n.colour?.trim() || null,
          reference: n.reference?.trim() || null, frameSize: n.frameSize?.trim() || null, material: n.material?.trim() || null,
          lensType: n.lensType || null, lensIndex: n.lensIndex || null, coating: n.coating || null,
          unit: n.unit || (l.category === "LENS" ? "pair" : "pcs"),
          costPrice: 0, // set from this purchase by the weighted-average costing
          sellPrice: round2(n.sellPrice ?? 0),
          supplierId,
        },
      });
      items.push({ productId: product.id, category: l.category, description: name, quantity: l.quantity, unitCost: l.unitCost });
    }
    return recordPurchase(tx, {
      orgId: ctx.orgId,
      branchId: str(fd.get("branchId")) || ctx.workingBranchId,
      supplierId,
      supplierInvoiceNo: optStr(fd.get("supplierInvoiceNo")),
      date: optDate(fd.get("date")) ?? new Date(),
      currency,
      exchangeRate,
      paid,
      paymentMethod: paid ? str(fd.get("paymentMethod")) : null,
      notes: optStr(fd.get("notes")),
      items,
    });
  }, { timeout: 30000 });
  redirect(`/app/purchases/${p.id}`);
}

export async function paySupplier(id: string, fd: FormData) {
  const ctx = await requireWrite("accounting");
  await db.purchase.findFirstOrThrow({ where: { id, orgId: ctx.orgId } });
  await db.$transaction((tx) => paySupplierInvoice(tx, id, str(fd.get("method")) || "BANK_TRANSFER"));
  revalidatePath(`/app/purchases/${id}`);
}

export async function createSupplier(fd: FormData) {
  const ctx = await requireWrite("inventory");
  await db.supplier.create({
    data: {
      orgId: ctx.orgId,
      name: str(fd.get("name")),
      contactName: optStr(fd.get("contactName")),
      phone: optStr(fd.get("phone")),
      email: optStr(fd.get("email")),
      address: optStr(fd.get("address")),
      isLab: fd.get("isLab") === "on",
    },
  });
  revalidatePath("/app/suppliers");
}
