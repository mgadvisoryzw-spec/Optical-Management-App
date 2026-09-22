"use server";

import { redirect } from "next/navigation";
import { db, type Tx } from "@/lib/db";
import { requireWrite } from "@/lib/auth";
import {
  deleteAppointment,
  deleteAsset,
  deleteClaim,
  deleteExpense,
  deleteFollowUp,
  deleteManualJournal,
  deleteOrder,
  deletePatient,
  deleteProduct,
  deletePurchase,
  deleteReceipt,
  recordRefund,
} from "@/lib/deletion";
import { num, optStr, str } from "@/lib/utils";

const DELETERS = {
  order: deleteOrder,
  receipt: deleteReceipt,
  claim: deleteClaim,
  expense: deleteExpense,
  purchase: deletePurchase,
  asset: deleteAsset,
  patient: deletePatient,
  product: deleteProduct,
  appointment: deleteAppointment,
  followUp: deleteFollowUp,
  journal: deleteManualJournal,
} satisfies Record<string, (tx: Tx, orgId: string, id: string, userId?: string) => Promise<{ label: string; redirect: string }>>;

export type DeletableKind = keyof typeof DELETERS;

const withParam = (url: string, key: string, value: string) => `${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;

/** Permanently deletes a record. Bound with the kind and id; the form may pass `back` for where to return on error. */
export async function deleteRecordAction(kind: DeletableKind, id: string, fd: FormData) {
  const ctx = await requireWrite("delete");
  const back = str(fd.get("back")) || "/app";
  let result: { label: string; redirect: string } | null = null;
  let error: string | null = null;
  try {
    result = await db.$transaction((tx) => DELETERS[kind](tx, ctx.orgId, id, ctx.user.id), { timeout: 30000 });
  } catch (e) {
    error = (e as Error).message.includes("Record to delete does not exist") || (e as Error).message.includes("No ") ? "That record no longer exists." : (e as Error).message;
  }
  if (error || !result) redirect(withParam(back, "error", error ?? "Could not delete"));
  redirect(withParam(result.redirect, "deleted", result.label));
}

/** Refunds a patient who has overpaid on an order. */
export async function refundAction(orderId: string, fd: FormData) {
  const ctx = await requireWrite("sales");
  await db.order.findFirstOrThrow({ where: { id: orderId, orgId: ctx.orgId } });
  let receiptId: string | null = null;
  let error: string | null = null;
  try {
    const r = await db.$transaction(
      (tx) =>
        recordRefund(tx, {
          orgId: ctx.orgId,
          orderId,
          amount: num(fd.get("amount")),
          method: str(fd.get("method")) || "CASH",
          reference: optStr(fd.get("reference")),
          notes: optStr(fd.get("notes")),
          userId: ctx.user.id,
        }),
      { timeout: 20000 },
    );
    receiptId = r.id;
  } catch (e) {
    error = (e as Error).message;
  }
  if (error || !receiptId) redirect(withParam(`/app/orders/${orderId}`, "error", error ?? "Refund failed"));
  redirect(`/app/receipts/${receiptId}`);
}
