"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWrite } from "@/lib/auth";
import { recordReceipt, voidReceipt } from "@/lib/services";
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

export async function voidReceiptAction(id: string) {
  const ctx = await requireWrite("accounting");
  await db.receipt.findFirstOrThrow({ where: { id, orgId: ctx.orgId } });
  await db.$transaction((tx) => voidReceipt(tx, id));
  revalidatePath(`/app/receipts/${id}`);
}
