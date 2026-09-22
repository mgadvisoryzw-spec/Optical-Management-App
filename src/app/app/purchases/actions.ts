"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWrite } from "@/lib/auth";
import { paySupplierInvoice, recordPurchase, type PurchaseLineInput } from "@/lib/services";
import { num, optDate, optStr, str } from "@/lib/utils";

export async function createPurchase(fd: FormData) {
  const ctx = await requireWrite("inventory");
  const items = (JSON.parse(str(fd.get("items")) || "[]") as PurchaseLineInput[]).filter((i) => i.description && i.quantity > 0);
  if (!items.length) throw new Error("Add at least one line");
  for (const i of items) if (i.productId) await db.product.findFirstOrThrow({ where: { id: i.productId, orgId: ctx.orgId } });
  const currency = str(fd.get("currency")) || ctx.org.baseCurrency;
  const cur = await db.currency.findUniqueOrThrow({ where: { orgId_code: { orgId: ctx.orgId, code: currency } } });
  const paid = str(fd.get("paid")) === "yes";
  const p = await db.$transaction((tx) =>
    recordPurchase(tx, {
      orgId: ctx.orgId,
      branchId: str(fd.get("branchId")) || ctx.workingBranchId,
      supplierId: optStr(fd.get("supplierId")),
      supplierInvoiceNo: optStr(fd.get("supplierInvoiceNo")),
      date: optDate(fd.get("date")) ?? new Date(),
      currency,
      exchangeRate: num(fd.get("exchangeRate"), cur.rate) || cur.rate,
      paid,
      paymentMethod: paid ? str(fd.get("paymentMethod")) : null,
      notes: optStr(fd.get("notes")),
      items,
    }),
  );
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
