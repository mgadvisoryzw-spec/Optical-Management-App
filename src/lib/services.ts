/**
 * Business-logic layer: every function here keeps operational records (orders, stock, claims)
 * and the general ledger in sync inside a single transaction.
 */
import type { Tx } from "./db";
import { nextNumber, postJournal, reverseSource, toBase, type LedgerLine } from "./ledger";
import { INVENTORY_ACCOUNTS } from "./chart-of-accounts";
import { ASSET_CATEGORIES, SALE_CATEGORIES, paymentAccount } from "./constants";
import { round2 } from "./utils";

export type OrderLineInput = {
  productId?: string | null;
  category: string;
  description: string;
  eye?: string | null;
  quantity: number;
  unitPrice: number;
};

export function computeOrderTotals(items: OrderLineInput[], discount: number, taxRate: number) {
  const subtotal = round2(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0));
  const taxable = Math.max(0, subtotal - discount);
  const tax = round2((taxable * taxRate) / 100);
  const total = round2(taxable + tax);
  return { subtotal, tax, total };
}

export async function adjustStock(tx: Tx, args: { productId: string; branchId: string; qty: number; unitCost: number; type: string; reference?: string; note?: string }) {
  await tx.stockLevel.upsert({
    where: { productId_branchId: { productId: args.productId, branchId: args.branchId } },
    create: { productId: args.productId, branchId: args.branchId, quantity: args.qty },
    update: { quantity: { increment: args.qty } },
  });
  await tx.stockMovement.create({
    data: { productId: args.productId, branchId: args.branchId, quantity: args.qty, unitCost: args.unitCost, type: args.type, reference: args.reference, note: args.note },
  });
}

/**
 * Net amount (base currency) moved from the medical aid receivable to the patient receivable
 * by journals outside the sales invoice: claim amount changes and shortfalls billed to the patient.
 */
async function amountMovedToPatient(tx: Tx, orgId: string, claimIds: string[]) {
  if (!claimIds.length) return 0;
  const lines = await tx.journalLine.findMany({
    where: {
      account: { orgId, code: "1110" },
      entry: { orgId, sourceId: { in: claimIds }, source: { in: ["CLAIM_ADJUSTMENT", "CLAIM"] } },
      OR: [{ entry: { source: "CLAIM_ADJUSTMENT" } }, { memo: "Shortfall billed to patient" }],
    },
    select: { debit: true, credit: true },
  });
  return round2(lines.reduce((s, l) => s + l.credit - l.debit, 0));
}

/** Confirms an order: recognises revenue, VAT, receivables (patient vs medical aid) and cost of sales. */
export async function invoiceOrder(tx: Tx, orderId: string, date = new Date()) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: { include: { product: true } }, receipts: { where: { voided: false } }, claims: { select: { id: true } } } });
  if (order.invoicedAt) return order;
  const r = order.exchangeRate || 1;
  const lines: LedgerLine[] = [];
  const cur = order.currency;

  // revenue by category
  for (const it of order.items) {
    const acct = SALE_CATEGORIES.find((c) => c.value === it.category)?.account ?? "4050";
    lines.push({ account: acct, credit: toBase(it.lineTotal, r), currency: cur, fxAmount: it.lineTotal, memo: it.description });
  }
  if (order.discount) lines.push({ account: "4900", debit: toBase(order.discount, r), currency: cur, fxAmount: order.discount });
  if (order.tax) lines.push({ account: "2100", credit: toBase(order.tax, r), currency: cur, fxAmount: order.tax });

  // When an edited order is re-posted, amounts already moved from the medical aid to the patient by
  // separate journals (claim amount changes, shortfalls billed to the patient) are still in the books.
  // Post the split as it stood before those moves so they are not counted twice.
  const movedToPatient = await amountMovedToPatient(tx, order.orgId, order.claims.map((c) => c.id));
  const aidBase = round2(toBase(order.medicalAidPortion, r) + movedToPatient);
  const patientBase = round2(toBase(order.patientPortion, r) - movedToPatient);
  if (aidBase) lines.push({ account: "1110", debit: aidBase, currency: cur, fxAmount: order.medicalAidPortion, memo: "Medical aid portion" });
  lines.push({ account: "1100", debit: patientBase, currency: cur, fxAmount: order.patientPortion, memo: "Patient portion" });

  // Deposits still sitting in "patient deposits" for this order move across to settle the receivable.
  // Measured from the ledger so it is also correct when an edited order is re-posted.
  const receiptIds = order.receipts.map((x) => x.id);
  const depositLines = receiptIds.length
    ? await tx.journalLine.aggregate({
        where: { account: { orgId: order.orgId, code: "2200" }, entry: { orgId: order.orgId, source: { in: ["RECEIPT", "RECEIPT_REVERSAL", "REFUND", "REFUND_REVERSAL"] }, sourceId: { in: receiptIds } } },
        _sum: { debit: true, credit: true },
      })
    : null;
  const deposits = round2((depositLines?._sum.credit ?? 0) - (depositLines?._sum.debit ?? 0));
  if (deposits) {
    lines.push({ account: "2200", debit: deposits, memo: "Deposits applied" });
    lines.push({ account: "1100", credit: deposits, memo: "Deposits applied" });
  }

  // cost of sales + stock relief for tracked products
  for (const it of order.items) {
    if (!it.product) continue;
    const accts = INVENTORY_ACCOUNTS[it.product.category] ?? INVENTORY_ACCOUNTS.ACCESSORY;
    const cost = round2(it.product.costPrice * it.quantity);
    await tx.orderItem.update({ where: { id: it.id }, data: { unitCost: it.product.costPrice } });
    if (it.product.trackStock) {
      await adjustStock(tx, { productId: it.product.id, branchId: order.branchId, qty: -it.quantity, unitCost: it.product.costPrice, type: "SALE", reference: order.orderNo });
      if (cost) {
        lines.push({ account: accts.cogs, debit: cost, memo: `COGS ${it.description}` });
        lines.push({ account: accts.inventory, credit: cost, memo: `Stock relief ${it.description}` });
      }
    }
  }

  await postJournal(tx, { orgId: order.orgId, branchId: order.branchId, date, memo: `Sales invoice ${order.orderNo}`, source: "ORDER", sourceId: order.id, lines });
  return tx.order.update({ where: { id: order.id }, data: { invoicedAt: date } });
}

/** Takes a posted order back out of the books and returns its stock (before cancelling or editing). */
export async function unpostOrder(tx: Tx, orderId: string, date: Date, reason: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: { include: { product: true } } } });
  if (!order.invoicedAt) return order;
  await reverseSource(tx, order.orgId, "ORDER", order.id, date);
  for (const it of order.items) {
    if (it.product?.trackStock) await adjustStock(tx, { productId: it.product.id, branchId: order.branchId, qty: it.quantity, unitCost: it.unitCost, type: "RETURN", reference: order.orderNo, note: reason });
  }
  return tx.order.update({ where: { id: order.id }, data: { invoicedAt: null } });
}

/** Cancels an order, reversing revenue and returning stock when it had been invoiced. */
export async function cancelOrder(tx: Tx, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { claims: { select: { id: true } } } });
  const wasPosted = !!order.invoicedAt;
  await unpostOrder(tx, orderId, new Date(), "Order cancelled");
  // Undo amounts moved between the medical aid and the patient, since the sale itself no longer exists
  const moved = wasPosted ? await amountMovedToPatient(tx, order.orgId, order.claims.map((c) => c.id)) : 0;
  if (moved && order.claims[0]) {
    await postJournal(tx, {
      orgId: order.orgId,
      branchId: order.branchId,
      date: new Date(),
      memo: `Order ${order.orderNo} cancelled: undo medical aid / patient reallocation`,
      source: "CLAIM_ADJUSTMENT",
      sourceId: order.claims[0].id,
      lines: moved > 0 ? [{ account: "1110", debit: moved }, { account: "1100", credit: moved }] : [{ account: "1100", debit: -moved }, { account: "1110", credit: -moved }],
    });
  }
  await tx.medicalAidClaim.updateMany({ where: { orderId, status: { in: ["PENDING_AUTH", "AUTHORISED"] } }, data: { status: "REJECTED", notes: "Order cancelled" } });
  return tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED", invoicedAt: null } });
}

/**
 * Edits an order's items, pricing, medical aid split and job details.
 * A posted order is reversed and re-posted on its original date so revenue, VAT,
 * receivables, cost of sales and stock all reflect the corrected order.
 */
export async function updateOrderContents(
  tx: Tx,
  args: {
    orderId: string;
    items: OrderLineInput[];
    discount: number;
    taxRate: number;
    currency: string;
    exchangeRate: number;
    medicalAidId: string | null;
    medicalAidPortion: number;
    prescriptionId: string | null;
    labName: string | null;
    promisedDate: Date | null;
    notes: string | null;
  },
) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: args.orderId }, include: { claims: true, patient: true } });
  if (order.status === "CANCELLED") throw new Error("Cancelled orders cannot be edited");
  const postedOn = order.invoicedAt;
  if (order.amountPaid !== 0 && args.currency !== order.currency) throw new Error("The currency cannot be changed once payments have been received");

  const { subtotal, tax, total } = computeOrderTotals(args.items, args.discount, args.taxRate);
  const claim = order.claims.find((c) => c.status !== "REJECTED");
  const paidByFunder = claim?.paidAmount ?? 0;
  if (!args.medicalAidId && paidByFunder > 0) throw new Error("The medical aid has already paid on this order, so it cannot be removed");
  const aidPortion = args.medicalAidId ? Math.min(total, Math.max(round2(args.medicalAidPortion), paidByFunder)) : 0;

  if (postedOn) await unpostOrder(tx, order.id, postedOn, "Order edited");
  await tx.orderItem.deleteMany({ where: { orderId: order.id } });
  await tx.order.update({
    where: { id: order.id },
    data: {
      currency: args.currency,
      exchangeRate: args.exchangeRate,
      subtotal,
      discount: args.discount,
      taxRate: args.taxRate,
      tax,
      total,
      medicalAidId: args.medicalAidId,
      medicalAidPortion: aidPortion,
      patientPortion: round2(total - aidPortion),
      prescriptionId: args.prescriptionId,
      labName: args.labName,
      promisedDate: args.promisedDate,
      notes: args.notes,
      items: {
        create: args.items.map((i) => ({
          productId: i.productId || null,
          category: i.category,
          description: i.description,
          eye: i.eye || null,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          lineTotal: round2(i.quantity * i.unitPrice),
        })),
      },
    },
  });

  // Keep the medical aid claim in step with the order
  if (args.medicalAidId && aidPortion > 0) {
    if (claim) {
      const settled = claim.paidAmount > 0 && aidPortion - claim.paidAmount <= 0.004;
      await tx.medicalAidClaim.update({
        where: { id: claim.id },
        data: { medicalAidId: args.medicalAidId, amount: aidPortion, currency: args.currency, exchangeRate: args.exchangeRate, status: settled ? "PAID" : claim.status === "PAID" ? "PART_PAID" : claim.status },
      });
    } else {
      await tx.medicalAidClaim.create({
        data: {
          orgId: order.orgId,
          claimNo: await nextNumber(tx, order.orgId, "CLM"),
          orderId: order.id,
          medicalAidId: args.medicalAidId,
          patientId: order.patientId,
          memberNo: order.patient.medicalAidNo,
          amount: aidPortion,
          currency: args.currency,
          exchangeRate: args.exchangeRate,
          status: postedOn ? "AUTHORISED" : "PENDING_AUTH",
        },
      });
    }
  } else if (claim && paidByFunder === 0) {
    await tx.medicalAidClaim.update({ where: { id: claim.id }, data: { status: "REJECTED", notes: "Medical aid removed from the order" } });
  }

  if (postedOn) await invoiceOrder(tx, order.id, postedOn);
  return tx.order.findUniqueOrThrow({ where: { id: order.id } });
}

/**
 * Over-the-counter cash sale (frames, lenses, repairs, cases…) paid in full on the spot:
 * creates a collected order so revenue, VAT and stock are recorded, then receipts the full amount.
 */
export async function recordCashSale(
  tx: Tx,
  args: {
    orgId: string;
    branchId: string;
    patientId: string;
    items: OrderLineInput[];
    discount: number;
    taxRate: number;
    currency: string;
    exchangeRate: number;
    method: string;
    reference?: string | null;
    notes?: string | null;
    date: Date;
    userId?: string;
  },
) {
  const { subtotal, tax, total } = computeOrderTotals(args.items, args.discount, args.taxRate);
  if (total <= 0) throw new Error("The sale total must be more than zero");
  const orderNo = await nextNumber(tx, args.orgId, "ORD");
  const order = await tx.order.create({
    data: {
      orgId: args.orgId,
      branchId: args.branchId,
      orderNo,
      patientId: args.patientId,
      status: "COLLECTED",
      isCashSale: true,
      currency: args.currency,
      exchangeRate: args.exchangeRate,
      subtotal,
      discount: args.discount,
      taxRate: args.taxRate,
      tax,
      total,
      patientPortion: total,
      collectedAt: args.date,
      notes: args.notes,
      createdById: args.userId,
      createdAt: args.date,
      items: {
        create: args.items.map((i) => ({
          productId: i.productId || null,
          category: i.category,
          description: i.description,
          eye: i.eye || null,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          lineTotal: round2(i.quantity * i.unitPrice),
        })),
      },
    },
  });
  await invoiceOrder(tx, order.id, args.date);
  return recordReceipt(tx, {
    orgId: args.orgId,
    branchId: args.branchId,
    patientId: args.patientId,
    orderId: order.id,
    amount: total,
    currency: args.currency,
    exchangeRate: args.exchangeRate,
    method: args.method,
    reference: args.reference,
    notes: args.notes,
    date: args.date,
    userId: args.userId,
  });
}

/** Records a patient receipt (optionally against an order). */
export async function recordReceipt(
  tx: Tx,
  args: { orgId: string; branchId: string; patientId?: string | null; orderId?: string | null; amount: number; currency: string; exchangeRate: number; method: string; reference?: string | null; notes?: string | null; date?: Date; userId?: string },
) {
  const receiptNo = await nextNumber(tx, args.orgId, "RCT");
  const baseAmount = toBase(args.amount, args.exchangeRate);
  let creditAccount = "2200"; // unallocated deposit by default
  let order = null;
  if (args.orderId) {
    order = await tx.order.findUniqueOrThrow({ where: { id: args.orderId } });
    creditAccount = order.invoicedAt ? "1100" : "2200";
  }
  const receipt = await tx.receipt.create({
    data: {
      orgId: args.orgId,
      branchId: args.branchId,
      receiptNo,
      patientId: args.patientId ?? order?.patientId ?? null,
      orderId: args.orderId ?? null,
      amount: args.amount,
      currency: args.currency,
      exchangeRate: args.exchangeRate,
      baseAmount,
      method: args.method,
      reference: args.reference,
      notes: args.notes,
      date: args.date ?? new Date(),
      createdById: args.userId,
    },
  });
  if (order) {
    // convert into the order's currency to track the balance (exact when the currencies match)
    const inOrderCcy = args.currency === order.currency ? args.amount : round2(baseAmount * (order.exchangeRate || 1));
    let paid = round2(order.amountPaid + inOrderCcy);
    // absorb sub-cent differences caused by converting between currencies
    if (args.currency !== order.currency && Math.abs(order.patientPortion - paid) <= 0.01 * (order.exchangeRate || 1)) paid = order.patientPortion;
    await tx.order.update({ where: { id: order.id }, data: { amountPaid: paid } });
  }
  await postJournal(tx, {
    orgId: args.orgId,
    branchId: args.branchId,
    date: receipt.date,
    memo: `Receipt ${receiptNo}${order ? ` for ${order.orderNo}` : ""}`,
    source: "RECEIPT",
    sourceId: receipt.id,
    lines: [
      { account: paymentAccount(args.method), debit: baseAmount, currency: args.currency, fxAmount: args.amount },
      { account: creditAccount, credit: baseAmount, currency: args.currency, fxAmount: args.amount },
    ],
  });
  return receipt;
}

export async function voidReceipt(tx: Tx, receiptId: string) {
  const r = await tx.receipt.findUniqueOrThrow({ where: { id: receiptId }, include: { order: true } });
  if (r.voided) return r;
  // If the order has since been invoiced, the deposit was already moved into receivables,
  // so the reversal must go back against receivables rather than deposits.
  await postJournal(tx, {
    orgId: r.orgId,
    branchId: r.branchId,
    date: new Date(),
    memo: `Void of receipt ${r.receiptNo}`,
    source: "RECEIPT_REVERSAL",
    sourceId: r.id,
    lines: [
      { account: r.order?.invoicedAt ? "1100" : "2200", debit: r.baseAmount, currency: r.currency, fxAmount: r.amount },
      { account: paymentAccount(r.method), credit: r.baseAmount, currency: r.currency, fxAmount: r.amount },
    ],
  });
  if (r.order) {
    const inOrderCcy = r.currency === r.order.currency ? r.amount : round2(r.baseAmount * (r.order.exchangeRate || 1));
    await tx.order.update({ where: { id: r.order.id }, data: { amountPaid: round2(r.order.amountPaid - inOrderCcy) } });
  }
  return tx.receipt.update({ where: { id: r.id }, data: { voided: true } });
}

/** Medical aid remittance received. Remainder can be billed to the patient or written off. */
export async function recordClaimPayment(
  tx: Tx,
  args: { claimId: string; amount: number; method: string; remainder: "KEEP_OPEN" | "BILL_PATIENT" | "WRITE_OFF"; reference?: string | null; date?: Date },
) {
  const when = args.date ?? new Date();
  const claim = await tx.medicalAidClaim.findUniqueOrThrow({ where: { id: args.claimId }, include: { order: true } });
  const r = claim.exchangeRate || 1;
  const paid = round2(claim.paidAmount + args.amount);
  const outstanding = round2(claim.amount - paid);
  const lines: LedgerLine[] = [];
  if (args.amount > 0) {
    lines.push({ account: paymentAccount(args.method), debit: toBase(args.amount, r), currency: claim.currency, fxAmount: args.amount });
    lines.push({ account: "1110", credit: toBase(args.amount, r), currency: claim.currency, fxAmount: args.amount });
  }
  let status = outstanding <= 0.004 ? "PAID" : "PART_PAID";
  let shortfall = claim.shortfall;
  if (outstanding > 0.004 && args.remainder !== "KEEP_OPEN") {
    shortfall = round2(shortfall + outstanding);
    if (args.remainder === "BILL_PATIENT") {
      lines.push({ account: "1100", debit: toBase(outstanding, r), memo: "Shortfall billed to patient" });
      lines.push({ account: "1110", credit: toBase(outstanding, r), memo: "Shortfall billed to patient" });
      await tx.order.update({
        where: { id: claim.orderId },
        data: { patientPortion: round2(claim.order.patientPortion + outstanding), medicalAidPortion: round2(claim.order.medicalAidPortion - outstanding) },
      });
    } else {
      lines.push({ account: "4950", debit: toBase(outstanding, r), memo: "Shortfall written off" });
      lines.push({ account: "1110", credit: toBase(outstanding, r), memo: "Shortfall written off" });
    }
    status = paid > 0 ? "PAID" : "REJECTED";
  }
  if (lines.length) {
    await postJournal(tx, { orgId: claim.orgId, branchId: claim.order.branchId, date: when, memo: `Medical aid remittance ${claim.claimNo}${args.reference ? ` (${args.reference})` : ""}`, source: "CLAIM", sourceId: claim.id, lines });
  }
  return tx.medicalAidClaim.update({ where: { id: claim.id }, data: { paidAmount: paid, status, shortfall, paidAt: when } });
}

export type PurchaseLineInput = { productId?: string | null; category: string; description: string; quantity: number; unitCost: number };

/** Supplier invoice for frames, lenses, contact lenses, accessories or consumables. */
export async function recordPurchase(
  tx: Tx,
  args: { orgId: string; branchId: string; supplierId?: string | null; supplierInvoiceNo?: string | null; date: Date; currency: string; exchangeRate: number; paid: boolean; paymentMethod?: string | null; notes?: string | null; items: PurchaseLineInput[] },
) {
  const purchaseNo = await nextNumber(tx, args.orgId, "PUR");
  const total = round2(args.items.reduce((s, i) => s + i.quantity * i.unitCost, 0));
  const baseTotal = toBase(total, args.exchangeRate);
  const purchase = await tx.purchase.create({
    data: {
      orgId: args.orgId,
      branchId: args.branchId,
      purchaseNo,
      supplierId: args.supplierId,
      supplierInvoiceNo: args.supplierInvoiceNo,
      date: args.date,
      currency: args.currency,
      exchangeRate: args.exchangeRate,
      total,
      baseTotal,
      paymentStatus: args.paid ? "PAID" : "UNPAID",
      paymentMethod: args.paid ? args.paymentMethod : null,
      notes: args.notes,
      items: { create: args.items.map((i) => ({ productId: i.productId || null, category: i.category, description: i.description, quantity: i.quantity, unitCost: i.unitCost, lineTotal: round2(i.quantity * i.unitCost) })) },
    },
  });

  const lines: LedgerLine[] = [];
  for (const i of args.items) {
    const line = round2(i.quantity * i.unitCost);
    const baseLine = toBase(line, args.exchangeRate);
    const accts = INVENTORY_ACCOUNTS[i.category] ?? INVENTORY_ACCOUNTS.ACCESSORY;
    const product = i.productId ? await tx.product.findUnique({ where: { id: i.productId }, include: { stock: true } }) : null;
    if (product?.trackStock) {
      const unitBase = toBase(i.unitCost, args.exchangeRate);
      // weighted-average cost across all branches
      const onHand = product.stock.reduce((s, x) => s + Math.max(0, x.quantity), 0);
      const newCost = onHand + i.quantity > 0 ? round2((onHand * product.costPrice + i.quantity * unitBase) / (onHand + i.quantity)) : unitBase;
      await tx.product.update({ where: { id: product.id }, data: { costPrice: newCost } });
      await adjustStock(tx, { productId: product.id, branchId: args.branchId, qty: i.quantity, unitCost: unitBase, type: "PURCHASE", reference: purchaseNo });
      lines.push({ account: accts.inventory, debit: baseLine, currency: args.currency, fxAmount: line, memo: i.description });
    } else {
      // non-stock purchases (e.g. lenses ordered per job, consumables) are expensed immediately
      lines.push({ account: accts.cogs, debit: baseLine, currency: args.currency, fxAmount: line, memo: i.description });
    }
  }
  lines.push({ account: args.paid ? paymentAccount(args.paymentMethod ?? "CASH") : "2000", credit: baseTotal, currency: args.currency, fxAmount: total });
  await postJournal(tx, { orgId: args.orgId, branchId: args.branchId, date: args.date, memo: `Purchase ${purchaseNo}${args.supplierInvoiceNo ? ` (inv ${args.supplierInvoiceNo})` : ""}`, source: "PURCHASE", sourceId: purchase.id, lines });
  return purchase;
}

export async function paySupplierInvoice(tx: Tx, purchaseId: string, method: string) {
  const p = await tx.purchase.findUniqueOrThrow({ where: { id: purchaseId } });
  if (p.paymentStatus === "PAID") return p;
  await postJournal(tx, {
    orgId: p.orgId,
    branchId: p.branchId,
    date: new Date(),
    memo: `Payment of ${p.purchaseNo}`,
    source: "PURCHASE_PAYMENT",
    sourceId: p.id,
    lines: [
      { account: "2000", debit: p.baseTotal, currency: p.currency, fxAmount: p.total },
      { account: paymentAccount(method), credit: p.baseTotal, currency: p.currency, fxAmount: p.total },
    ],
  });
  return tx.purchase.update({ where: { id: p.id }, data: { paymentStatus: "PAID", paymentMethod: method } });
}

export async function recordExpense(
  tx: Tx,
  args: { orgId: string; branchId: string; date: Date; accountCode: string; payee?: string | null; description: string; amount: number; currency: string; exchangeRate: number; method: string; reference?: string | null },
) {
  const expenseNo = await nextNumber(tx, args.orgId, "EXP");
  const baseAmount = toBase(args.amount, args.exchangeRate);
  const e = await tx.expense.create({ data: { ...args, expenseNo, baseAmount } });
  await postJournal(tx, {
    orgId: args.orgId,
    branchId: args.branchId,
    date: args.date,
    memo: `${expenseNo}: ${args.description}`,
    source: "EXPENSE",
    sourceId: e.id,
    lines: [
      { account: args.accountCode, debit: baseAmount, currency: args.currency, fxAmount: args.amount },
      { account: args.method === "CREDIT" ? "2000" : paymentAccount(args.method), credit: baseAmount, currency: args.currency, fxAmount: args.amount },
    ],
  });
  return e;
}

export async function recordAsset(
  tx: Tx,
  args: { orgId: string; branchId: string; name: string; category: string; serialNo?: string | null; supplier?: string | null; purchaseDate: Date; cost: number; currency: string; exchangeRate: number; usefulLifeYears: number; residualValue: number; paymentMethod: string },
) {
  const assetNo = await nextNumber(tx, args.orgId, "AST", 4);
  const baseCost = toBase(args.cost, args.exchangeRate);
  const a = await tx.asset.create({ data: { ...args, assetNo, baseCost } });
  const acct = ASSET_CATEGORIES.find((c) => c.value === args.category)?.account ?? "1500";
  const credit = args.paymentMethod === "CREDIT" ? "2000" : args.paymentMethod === "CAPITAL" ? "3000" : args.paymentMethod === "LOAN" ? "2300" : paymentAccount(args.paymentMethod);
  await postJournal(tx, {
    orgId: args.orgId,
    branchId: args.branchId,
    date: args.purchaseDate,
    memo: `Asset ${assetNo}: ${args.name}`,
    source: "ASSET",
    sourceId: a.id,
    lines: [
      { account: acct, debit: baseCost, currency: args.currency, fxAmount: args.cost },
      { account: credit, credit: baseCost, currency: args.currency, fxAmount: args.cost },
    ],
  });
  return a;
}

/** Straight-line monthly depreciation for every asset up to the end of `upTo` month. Idempotent. */
export async function runDepreciation(tx: Tx, orgId: string, upTo: Date) {
  const monthEnd = new Date(upTo.getFullYear(), upTo.getMonth() + 1, 0, 23, 59, 59);
  const assets = await tx.asset.findMany({ where: { orgId, disposed: false } });
  let total = 0;
  let posted = 0;
  for (const a of assets) {
    const monthly = round2((a.baseCost - a.residualValue) / Math.max(1, a.usefulLifeYears * 12));
    const start = a.depreciatedTo ? new Date(a.depreciatedTo.getFullYear(), a.depreciatedTo.getMonth() + 1, 1) : new Date(a.purchaseDate.getFullYear(), a.purchaseDate.getMonth(), 1);
    const months = (monthEnd.getFullYear() - start.getFullYear()) * 12 + (monthEnd.getMonth() - start.getMonth()) + 1;
    if (months <= 0 || monthly <= 0) continue;
    // cap at remaining depreciable amount
    const agg = await tx.journalLine.aggregate({ where: { entry: { orgId, source: "DEPRECIATION", sourceId: a.id } }, _sum: { credit: true } });
    const remaining = round2(a.baseCost - a.residualValue - (agg._sum.credit ?? 0));
    const amount = round2(Math.min(remaining, monthly * months));
    if (amount <= 0) continue;
    await postJournal(tx, {
      orgId,
      branchId: a.branchId,
      date: monthEnd,
      memo: `Depreciation ${a.assetNo} ${a.name} (${months} month${months > 1 ? "s" : ""})`,
      source: "DEPRECIATION",
      sourceId: a.id,
      lines: [
        { account: "6150", debit: amount },
        { account: "1590", credit: amount },
      ],
    });
    await tx.asset.update({ where: { id: a.id }, data: { depreciatedTo: monthEnd } });
    total += amount;
    posted++;
  }
  return { posted, total: round2(total) };
}

export async function stockAdjustment(tx: Tx, args: { orgId: string; productId: string; branchId: string; qty: number; reason: string }) {
  const product = await tx.product.findUniqueOrThrow({ where: { id: args.productId } });
  await adjustStock(tx, { productId: product.id, branchId: args.branchId, qty: args.qty, unitCost: product.costPrice, type: "ADJUSTMENT", note: args.reason });
  const value = round2(Math.abs(args.qty) * product.costPrice);
  if (value) {
    const inv = (INVENTORY_ACCOUNTS[product.category] ?? INVENTORY_ACCOUNTS.ACCESSORY).inventory;
    // Opening stock is capital introduced; other adjustments go to stock write-offs
    const contra = args.reason === "Opening stock" ? "3000" : "6160";
    await postJournal(tx, {
      orgId: args.orgId,
      branchId: args.branchId,
      date: new Date(),
      memo: `Stock adjustment ${product.sku}: ${args.reason}`,
      source: "STOCK",
      sourceId: product.id,
      lines:
        args.qty < 0
          ? [{ account: contra, debit: value }, { account: inv, credit: value }]
          : [{ account: inv, debit: value }, { account: contra, credit: value }],
    });
  }
}

export async function stockTransfer(tx: Tx, args: { productId: string; fromBranchId: string; toBranchId: string; qty: number; note?: string }) {
  const product = await tx.product.findUniqueOrThrow({ where: { id: args.productId } });
  await adjustStock(tx, { productId: product.id, branchId: args.fromBranchId, qty: -args.qty, unitCost: product.costPrice, type: "TRANSFER_OUT", note: args.note });
  await adjustStock(tx, { productId: product.id, branchId: args.toBranchId, qty: args.qty, unitCost: product.costPrice, type: "TRANSFER_IN", note: args.note });
}

/**
 * Corrects a medical aid claim's details. Changing the claimed amount moves the difference
 * between the medical aid and the patient, with a ledger adjustment if the order is already posted.
 */
export async function updateClaimDetails(
  tx: Tx,
  args: { claimId: string; memberNo: string | null; authNumber: string | null; amount: number; status: string; submittedAt: Date | null; notes: string | null },
) {
  const claim = await tx.medicalAidClaim.findUniqueOrThrow({ where: { id: args.claimId }, include: { order: true } });
  const amount = round2(args.amount);
  if (amount < claim.paidAmount) throw new Error("The claimed amount cannot be less than what the medical aid has already paid");
  if (amount > claim.order.total) throw new Error("The claimed amount cannot be more than the order total");
  const diff = round2(amount - claim.amount);
  if (diff !== 0) {
    await tx.order.update({
      where: { id: claim.orderId },
      data: { medicalAidPortion: round2(claim.order.medicalAidPortion + diff), patientPortion: round2(claim.order.patientPortion - diff) },
    });
    if (claim.order.invoicedAt) {
      const base = toBase(Math.abs(diff), claim.exchangeRate || 1);
      await postJournal(tx, {
        orgId: claim.orgId,
        branchId: claim.order.branchId,
        date: new Date(),
        memo: `Claim ${claim.claimNo} amount changed (${diff > 0 ? "more" : "less"} claimed from medical aid)`,
        source: "CLAIM_ADJUSTMENT",
        sourceId: claim.id,
        lines:
          diff > 0
            ? [{ account: "1110", debit: base }, { account: "1100", credit: base }]
            : [{ account: "1100", debit: base }, { account: "1110", credit: base }],
      });
    }
  }
  const editable = ["PENDING_AUTH", "AUTHORISED", "SUBMITTED"];
  const status = editable.includes(claim.status) && editable.includes(args.status) ? args.status : claim.status;
  const settled = claim.paidAmount > 0 && amount - claim.paidAmount <= 0.004;
  const partPaid = claim.paidAmount > 0 && !settled && ["PAID", "PART_PAID"].includes(claim.status);
  return tx.medicalAidClaim.update({
    where: { id: claim.id },
    data: { memberNo: args.memberNo, authNumber: args.authNumber, amount, status: settled ? "PAID" : partPaid ? "PART_PAID" : status, submittedAt: args.submittedAt, notes: args.notes },
  });
}
