"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWrite } from "@/lib/auth";
import { stockAdjustment, stockTransfer } from "@/lib/services";
import { num, optStr, str } from "@/lib/utils";

function productData(fd: FormData) {
  const category = str(fd.get("category"));
  const brand = optStr(fd.get("brand"));
  const model = optStr(fd.get("model"));
  const colour = optStr(fd.get("colour"));
  const lensType = optStr(fd.get("lensType"));
  const lensIndex = optStr(fd.get("lensIndex"));
  const coating = optStr(fd.get("coating"));
  let name = str(fd.get("name"));
  if (!name) {
    name = category === "FRAME" ? [brand, model, colour].filter(Boolean).join(" ") : category === "LENS" ? [lensType?.replace("_", " ").toLowerCase(), lensIndex, coating].filter(Boolean).join(" ") : [brand, model].filter(Boolean).join(" ");
    name = name.charAt(0).toUpperCase() + name.slice(1);
  }
  return {
    category,
    name: name || "Unnamed item",
    brand,
    model,
    colour,
    reference: optStr(fd.get("reference")),
    frameSize: optStr(fd.get("frameSize")),
    material: optStr(fd.get("material")),
    gender: optStr(fd.get("gender")),
    lensType,
    lensIndex,
    coating,
    unit: str(fd.get("unit")) || "pcs",
    costPrice: num(fd.get("costPrice")),
    sellPrice: num(fd.get("sellPrice")),
    reorderLevel: num(fd.get("reorderLevel"), 2),
    trackStock: fd.get("trackStock") === "on",
    supplierId: optStr(fd.get("supplierId")),
  };
}

export async function createProduct(fd: FormData) {
  const ctx = await requireWrite("inventory");
  const data = productData(fd);
  const prefix = { FRAME: "FR", LENS: "LN", CONTACT_LENS: "CL", ACCESSORY: "AC", CONSUMABLE: "CS" }[data.category] ?? "IT";
  let sku = str(fd.get("sku")).toUpperCase();
  if (!sku) {
    const count = await db.product.count({ where: { orgId: ctx.orgId, category: data.category } });
    sku = `${prefix}-${String(count + 1).padStart(4, "0")}`;
  }
  if (await db.product.findUnique({ where: { orgId_sku: { orgId: ctx.orgId, sku } } })) sku = `${sku}-${Date.now().toString(36).slice(-3).toUpperCase()}`;
  const p = await db.product.create({ data: { ...data, sku, orgId: ctx.orgId } });
  // Opening stock is recorded as an adjustment so the ledger reflects inventory on hand
  const opening = num(fd.get("openingQty"));
  if (opening > 0 && p.trackStock) {
    await db.$transaction((tx) => stockAdjustment(tx, { orgId: ctx.orgId, productId: p.id, branchId: ctx.workingBranchId, qty: opening, reason: "Opening stock" }));
  }
  if (fd.get("another") === "1") redirect(`/app/inventory/new?category=${data.category}&saved=${encodeURIComponent(p.name)}`);
  redirect(`/app/inventory/${p.id}`);
}

export async function updateProduct(id: string, fd: FormData) {
  const ctx = await requireWrite("inventory");
  await db.product.update({ where: { id, orgId: ctx.orgId }, data: { ...productData(fd), active: fd.get("active") === "on" } });
  redirect(`/app/inventory/${id}`);
}

export async function adjustStockAction(id: string, fd: FormData) {
  const ctx = await requireWrite("inventory");
  await db.product.findFirstOrThrow({ where: { id, orgId: ctx.orgId } });
  const qty = num(fd.get("qty"));
  if (!qty) return;
  await db.$transaction((tx) => stockAdjustment(tx, { orgId: ctx.orgId, productId: id, branchId: str(fd.get("branchId")) || ctx.workingBranchId, qty, reason: str(fd.get("reason")) || "Stock count" }));
  revalidatePath(`/app/inventory/${id}`);
}

export async function transferStockAction(id: string, fd: FormData) {
  const ctx = await requireWrite("inventory");
  await db.product.findFirstOrThrow({ where: { id, orgId: ctx.orgId } });
  const from = str(fd.get("fromBranchId"));
  const to = str(fd.get("toBranchId"));
  const qty = num(fd.get("qty"));
  if (!qty || from === to) return;
  if (!ctx.branches.some((b) => b.id === from) || !ctx.branches.some((b) => b.id === to)) throw new Error("Invalid branch");
  await db.$transaction((tx) => stockTransfer(tx, { productId: id, fromBranchId: from, toBranchId: to, qty, note: optStr(fd.get("note")) ?? undefined }));
  revalidatePath(`/app/inventory/${id}`);
}
