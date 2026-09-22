"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWrite } from "@/lib/auth";
import { cancelOrder, recordCashSale, recordReceipt, voidReceipt, type OrderLineInput } from "@/lib/services";
import { nextNumber } from "@/lib/ledger";
import { SALE_CATEGORIES } from "@/lib/constants";
import { num, optDate, optStr, round2, str } from "@/lib/utils";

export async function createReceipt(fd: FormData) {
  const ctx = await requireWrite("sales");
  const currency = str(fd.get("currency")) || ctx.org.baseCurrency;
  const cur = await db.currency.findUniqueOrThrow({ where: { orgId_code: { orgId: ctx.orgId, code: currency } } });
  const orderId = optStr(fd.get("orderId"));
  const patientId = optStr(fd.get("patientId"));
  if (orderId) await db.order.findFirstOrThrow({ where: { id: orderId, orgId: ctx.orgId } });
  if (patientId) await db.patient.findFirstOrThrow({ where: { id: patientId, orgId: ctx.orgId } });
  const amount = round2(num(fd.get("amount")));
  if (amount <= 0) throw new Error("Enter an amount");
  const r = await db.$transaction((tx) =>
    recordReceipt(tx, {
      orgId: ctx.orgId,
      branchId: ctx.workingBranchId,
      patientId,
      orderId,
      amount,
      currency,
      exchangeRate: num(fd.get("exchangeRate"), cur.rate) || cur.rate,
      method: str(fd.get("method")) || "CASH",
      reference: optStr(fd.get("reference")),
      notes: optStr(fd.get("notes")),
      date: optDate(fd.get("date")) ?? new Date(),
      userId: ctx.user.id,
    }),
  );
  redirect(`/app/receipts/${r.id}`);
}

export type CashSaleState = { error?: string } | undefined;

/** Over-the-counter cash sale: the patient pays in full for frames, lenses, repairs, cases, etc. */
export async function createCashSale(_: CashSaleState, fd: FormData): Promise<CashSaleState> {
  const ctx = await requireWrite("sales");
  const items = (JSON.parse(str(fd.get("items")) || "[]") as OrderLineInput[])
    .filter((i) => i.description && i.quantity > 0 && i.unitPrice >= 0)
    .map((i) => ({ ...i, category: SALE_CATEGORIES.some((c) => c.value === i.category) ? i.category : "OTHER" }));
  if (!items.length) return { error: "Choose at least one item the patient is paying for." };
  for (const i of items) if (i.productId) await db.product.findFirstOrThrow({ where: { id: i.productId, orgId: ctx.orgId } });

  let patientId = optStr(fd.get("patientId"));
  const walkInName = str(fd.get("walkInName"));
  if (patientId) await db.patient.findFirstOrThrow({ where: { id: patientId, orgId: ctx.orgId } });
  else if (!walkInName) return { error: "Choose the patient, or type the name of a walk-in customer." };

  const currency = str(fd.get("currency")) || ctx.org.baseCurrency;
  const cur = await db.currency.findUniqueOrThrow({ where: { orgId_code: { orgId: ctx.orgId, code: currency } } });
  const receipt = await db.$transaction(async (tx) => {
    if (!patientId) {
      // Walk-in customers get a lightweight patient record so they can be recalled and found later
      const [firstName, ...rest] = walkInName.split(/\s+/);
      const p = await tx.patient.create({
        data: { orgId: ctx.orgId, branchId: ctx.workingBranchId, patientNo: await nextNumber(tx, ctx.orgId, "PAT", 5), firstName, lastName: rest.join(" ") || "-", phone: optStr(fd.get("walkInPhone")) },
      });
      patientId = p.id;
    }
    return recordCashSale(tx, {
      orgId: ctx.orgId,
      branchId: ctx.workingBranchId,
      patientId,
      items,
      discount: round2(num(fd.get("discount"))),
      taxRate: num(fd.get("taxRate")),
      currency,
      exchangeRate: num(fd.get("exchangeRate"), cur.rate) || cur.rate,
      method: str(fd.get("method")) || "CASH",
      reference: optStr(fd.get("reference")),
      notes: optStr(fd.get("notes")),
      date: optDate(fd.get("date")) ?? new Date(),
      userId: ctx.user.id,
    });
  });
  redirect(`/app/receipts/${receipt.id}`);
}

export async function voidReceiptAction(id: string) {
  const ctx = await requireWrite("accounting");
  const r = await db.receipt.findFirstOrThrow({ where: { id, orgId: ctx.orgId }, include: { order: true } });
  await db.$transaction(async (tx) => {
    await voidReceipt(tx, id);
    // Voiding a cash sale also reverses the sale itself and returns the items to stock
    if (r.order?.isCashSale && r.order.status !== "CANCELLED") await cancelOrder(tx, r.order.id);
  });
  revalidatePath(`/app/receipts/${id}`);
}
