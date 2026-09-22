/**
 * Refunds and permanent deletion. Deleting a record removes its journals (and any that were
 * raised off it), undoes stock movements and re-posts related documents so the books, stock and
 * balances read as if the record had never been captured. Every deletion is written to the audit log.
 */
import type { Tx } from "./db";
import { nextNumber, postJournal, reverseSource, toBase } from "./ledger";
import { adjustStock, invoiceOrder, unpostOrder } from "./services";
import { paymentAccount } from "./constants";
import { round2 } from "./utils";

/** Amount the patient has overpaid on an order, in the order's currency (whole payments count on cancelled orders). */
export function orderCredit(o: { status: string; patientPortion: number; amountPaid: number }) {
  const owed = o.status === "CANCELLED" ? 0 : o.patientPortion;
  return round2(o.amountPaid - owed);
}

/** Pays money back to a patient who overpaid on an order. */
export async function recordRefund(
  tx: Tx,
  args: { orgId: string; orderId: string; amount: number; method: string; reference?: string | null; notes?: string | null; date?: Date; userId?: string },
) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: args.orderId }, include: { receipts: { select: { id: true } } } });
  const credit = orderCredit(order);
  const amount = round2(args.amount);
  if (amount <= 0) throw new Error("Enter the amount to refund");
  if (amount - credit > 0.005) throw new Error(`The most that can be refunded on this order is ${credit.toFixed(2)} ${order.currency}`);
  const rate = order.exchangeRate || 1;
  const base = toBase(amount, rate);

  // Take the refund from unapplied deposits first, then from the patient's credit balance
  const ids = [order.id, ...order.receipts.map((r) => r.id)];
  const dep = await tx.journalLine.aggregate({ where: { account: { orgId: args.orgId, code: "2200" }, entry: { orgId: args.orgId, sourceId: { in: ids } } }, _sum: { debit: true, credit: true } });
  const inDeposits = Math.max(0, round2((dep._sum.credit ?? 0) - (dep._sum.debit ?? 0)));
  const fromDeposits = Math.min(inDeposits, base);

  const receipt = await tx.receipt.create({
    data: {
      orgId: args.orgId,
      branchId: order.branchId,
      receiptNo: await nextNumber(tx, args.orgId, "RFD"),
      kind: "REFUND",
      patientId: order.patientId,
      orderId: order.id,
      amount,
      currency: order.currency,
      exchangeRate: rate,
      baseAmount: base,
      method: args.method,
      reference: args.reference,
      notes: args.notes,
      date: args.date ?? new Date(),
      createdById: args.userId,
    },
  });
  await tx.order.update({ where: { id: order.id }, data: { amountPaid: round2(order.amountPaid - amount) } });
  await postJournal(tx, {
    orgId: args.orgId,
    branchId: order.branchId,
    date: receipt.date,
    memo: `Refund ${receipt.receiptNo} for ${order.orderNo}`,
    source: "REFUND",
    sourceId: receipt.id,
    lines: [
      { account: "2200", debit: fromDeposits, memo: "Refund of deposit" },
      { account: "1100", debit: round2(base - fromDeposits), memo: "Refund of overpayment" },
      { account: paymentAccount(args.method), credit: base, currency: order.currency, fxAmount: amount },
    ],
  });
  return receipt;
}

async function deleteJournalsFor(tx: Tx, orgId: string, sourceIds: string[]) {
  if (sourceIds.length) await tx.journalEntry.deleteMany({ where: { orgId, sourceId: { in: sourceIds } } });
}

/** Re-posts a posted order so its deposits and receivables are recalculated after a related record is removed. */
async function repost(tx: Tx, orderId: string) {
  const o = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  if (!o.invoicedAt) return;
  const on = o.invoicedAt;
  await unpostOrder(tx, o.id, on, "Re-posted after a deletion");
  await invoiceOrder(tx, o.id, on);
}

async function audit(tx: Tx, orgId: string, userId: string | undefined, entity: string, entityId: string, detail: string) {
  await tx.auditLog.create({ data: { orgId, userId, action: "DELETE", entity, entityId, detail } });
}

export async function deleteOrder(tx: Tx, orgId: string, orderId: string, userId?: string) {
  const o = await tx.order.findFirstOrThrow({ where: { id: orderId, orgId }, include: { items: { include: { product: true } }, receipts: true, claims: true, patient: true } });
  if (o.invoicedAt) {
    for (const it of o.items) {
      if (it.product?.trackStock) await adjustStock(tx, { productId: it.product.id, branchId: o.branchId, qty: it.quantity, unitCost: it.unitCost, type: "RETURN", reference: o.orderNo, note: "Order deleted" });
    }
  }
  await deleteJournalsFor(tx, orgId, [o.id, ...o.receipts.map((r) => r.id), ...o.claims.map((c) => c.id)]);
  await tx.receipt.deleteMany({ where: { orderId: o.id } });
  await tx.medicalAidClaim.deleteMany({ where: { orderId: o.id } });
  await tx.order.delete({ where: { id: o.id } });
  await audit(tx, orgId, userId, "Order", o.id, `${o.orderNo} for ${o.patient.firstName} ${o.patient.lastName}, total ${o.currency} ${o.total.toFixed(2)}, with ${o.receipts.length} receipt(s) and ${o.claims.length} claim(s)`);
  return { label: o.orderNo, redirect: "/app/orders" };
}

export async function deleteReceipt(tx: Tx, orgId: string, receiptId: string, userId?: string) {
  const r = await tx.receipt.findFirstOrThrow({ where: { id: receiptId, orgId }, include: { order: { include: { receipts: true } } } });
  // A cash sale only exists to back its receipt, so deleting the receipt removes the sale too
  if (r.order?.isCashSale && r.order.receipts.filter((x) => x.kind === "PAYMENT").length <= 1 && r.kind === "PAYMENT") {
    await deleteOrder(tx, orgId, r.order.id, userId);
    return { label: `${r.receiptNo} and cash sale ${r.order.orderNo}`, redirect: "/app/receipts" };
  }
  if (r.order && !r.voided) {
    const inOrderCcy = r.currency === r.order.currency ? r.amount : round2(r.baseAmount * (r.order.exchangeRate || 1));
    const paid = r.kind === "REFUND" ? r.order.amountPaid + inOrderCcy : r.order.amountPaid - inOrderCcy;
    await tx.order.update({ where: { id: r.order.id }, data: { amountPaid: round2(paid) } });
  }
  await deleteJournalsFor(tx, orgId, [r.id]);
  await tx.receipt.delete({ where: { id: r.id } });
  if (r.order) await repost(tx, r.order.id);
  await audit(tx, orgId, userId, r.kind === "REFUND" ? "Refund" : "Receipt", r.id, `${r.receiptNo} ${r.currency} ${r.amount.toFixed(2)}${r.order ? ` on ${r.order.orderNo}` : ""}`);
  return { label: r.receiptNo, redirect: r.order ? `/app/orders/${r.order.id}` : "/app/receipts" };
}

export async function deleteClaim(tx: Tx, orgId: string, claimId: string, userId?: string) {
  const c = await tx.medicalAidClaim.findFirstOrThrow({ where: { id: claimId, orgId }, include: { order: { include: { claims: true } } } });
  await deleteJournalsFor(tx, orgId, [c.id]);
  await tx.medicalAidClaim.delete({ where: { id: c.id } });
  const others = c.order.claims.filter((x) => x.id !== c.id && x.status !== "REJECTED");
  if (!others.length) {
    // The whole order becomes the patient's responsibility
    await tx.order.update({
      where: { id: c.orderId },
      data: { medicalAidId: null, medicalAidPortion: 0, patientPortion: c.order.total, status: c.order.status === "AWAITING_AUTH" ? "QUOTE" : c.order.status },
    });
  }
  await repost(tx, c.orderId);
  await audit(tx, orgId, userId, "Claim", c.id, `${c.claimNo} on ${c.order.orderNo}, claimed ${c.amount.toFixed(2)}, paid ${c.paidAmount.toFixed(2)}`);
  return { label: c.claimNo, redirect: "/app/medical-aid" };
}

export async function deleteExpense(tx: Tx, orgId: string, id: string, userId?: string) {
  const e = await tx.expense.findFirstOrThrow({ where: { id, orgId } });
  await deleteJournalsFor(tx, orgId, [e.id]);
  await tx.expense.delete({ where: { id: e.id } });
  await audit(tx, orgId, userId, "Expense", e.id, `${e.expenseNo} ${e.description} ${e.currency} ${e.amount.toFixed(2)}`);
  return { label: e.expenseNo, redirect: "/app/expenses" };
}

export async function deletePurchase(tx: Tx, orgId: string, id: string, userId?: string) {
  const p = await tx.purchase.findFirstOrThrow({ where: { id, orgId }, include: { items: { include: { product: true } } } });
  for (const i of p.items) {
    if (i.product?.trackStock) await adjustStock(tx, { productId: i.product.id, branchId: p.branchId, qty: -i.quantity, unitCost: toBase(i.unitCost, p.exchangeRate), type: "ADJUSTMENT", reference: p.purchaseNo, note: "Purchase deleted" });
  }
  await deleteJournalsFor(tx, orgId, [p.id]);
  await tx.purchase.delete({ where: { id: p.id } });
  await audit(tx, orgId, userId, "Purchase", p.id, `${p.purchaseNo} ${p.currency} ${p.total.toFixed(2)}`);
  return { label: p.purchaseNo, redirect: "/app/purchases" };
}

export async function deleteAsset(tx: Tx, orgId: string, id: string, userId?: string) {
  const a = await tx.asset.findFirstOrThrow({ where: { id, orgId } });
  await deleteJournalsFor(tx, orgId, [a.id]);
  await tx.asset.delete({ where: { id: a.id } });
  await audit(tx, orgId, userId, "Asset", a.id, `${a.assetNo} ${a.name}`);
  return { label: a.assetNo, redirect: "/app/assets" };
}

export async function deletePatient(tx: Tx, orgId: string, id: string, userId?: string) {
  const p = await tx.patient.findFirstOrThrow({ where: { id, orgId }, include: { _count: { select: { orders: true, receipts: true, claims: true } } } });
  if (p._count.orders || p._count.receipts || p._count.claims) {
    throw new Error(`${p.firstName} ${p.lastName} has ${p._count.orders} order(s) and ${p._count.receipts} receipt(s). Delete those first, or keep the patient on file.`);
  }
  await tx.appointment.deleteMany({ where: { patientId: p.id } });
  await tx.patient.delete({ where: { id: p.id } });
  await audit(tx, orgId, userId, "Patient", p.id, `${p.patientNo} ${p.firstName} ${p.lastName}`);
  return { label: `${p.firstName} ${p.lastName}`, redirect: "/app/patients" };
}

export async function deleteProduct(tx: Tx, orgId: string, id: string, userId?: string) {
  const p = await tx.product.findFirstOrThrow({ where: { id, orgId }, include: { _count: { select: { orderItems: true, purchaseItems: true } } } });
  if (p._count.orderItems || p._count.purchaseItems) {
    throw new Error(`${p.name} appears on ${p._count.orderItems} order line(s) and ${p._count.purchaseItems} purchase line(s), so it can't be deleted. Untick "Active" to hide it instead.`);
  }
  await deleteJournalsFor(tx, orgId, [p.id]); // opening stock and stock adjustments
  await tx.product.delete({ where: { id: p.id } });
  await audit(tx, orgId, userId, "Product", p.id, `${p.sku} ${p.name}`);
  return { label: p.name, redirect: "/app/inventory" };
}

export async function deleteAppointment(tx: Tx, orgId: string, id: string, userId?: string) {
  const a = await tx.appointment.findFirstOrThrow({ where: { id, orgId } });
  await tx.appointment.delete({ where: { id: a.id } });
  await audit(tx, orgId, userId, "Appointment", a.id, `${a.startsAt.toISOString()} ${a.type}`);
  return { label: "Appointment", redirect: `/app/appointments?date=${a.startsAt.toISOString().slice(0, 10)}` };
}

export async function deleteFollowUp(tx: Tx, orgId: string, id: string, userId?: string) {
  const f = await tx.followUp.findFirstOrThrow({ where: { id, orgId } });
  await tx.followUp.delete({ where: { id: f.id } });
  await audit(tx, orgId, userId, "FollowUp", f.id, f.reason);
  return { label: "Follow-up", redirect: "/app/follow-ups" };
}

export async function deleteManualJournal(tx: Tx, orgId: string, id: string, userId?: string) {
  const e = await tx.journalEntry.findFirstOrThrow({ where: { id, orgId } });
  if (e.source !== "MANUAL") throw new Error("Only manual journals can be deleted here. Delete the source document (receipt, order, expense…) instead.");
  await tx.journalEntry.delete({ where: { id: e.id } });
  await audit(tx, orgId, userId, "Journal", e.id, `${e.entryNo} ${e.memo}`);
  return { label: e.entryNo, redirect: "/app/accounting?tab=journal" };
}

/** Voids a refund (the money is treated as never paid out). */
export async function voidRefund(tx: Tx, receiptId: string) {
  const r = await tx.receipt.findUniqueOrThrow({ where: { id: receiptId }, include: { order: true } });
  if (r.voided || r.kind !== "REFUND") return r;
  await reverseSource(tx, r.orgId, "REFUND", r.id);
  if (r.order) await tx.order.update({ where: { id: r.order.id }, data: { amountPaid: round2(r.order.amountPaid + r.amount) } });
  return tx.receipt.update({ where: { id: r.id }, data: { voided: true } });
}
