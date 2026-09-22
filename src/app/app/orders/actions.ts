"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWrite } from "@/lib/auth";
import { nextNumber } from "@/lib/ledger";
import { cancelOrder, computeOrderTotals, invoiceOrder, recordReceipt, type OrderLineInput } from "@/lib/services";
import { renderTemplate, sendMessage, patientVars } from "@/lib/messaging";
import { money, num, optDate, optStr, round2, str } from "@/lib/utils";

export async function createOrder(fd: FormData) {
  const ctx = await requireWrite("sales");
  const patientId = str(fd.get("patientId"));
  const patient = await db.patient.findFirstOrThrow({ where: { id: patientId, orgId: ctx.orgId } });
  const items = (JSON.parse(str(fd.get("items")) || "[]") as OrderLineInput[]).filter((i) => i.description && i.quantity > 0);
  if (!items.length) throw new Error("Add at least one item");
  const currency = str(fd.get("currency")) || ctx.org.baseCurrency;
  const cur = await db.currency.findUniqueOrThrow({ where: { orgId_code: { orgId: ctx.orgId, code: currency } } });
  const exchangeRate = num(fd.get("exchangeRate"), cur.rate) || 1;
  const discount = round2(num(fd.get("discount")));
  const taxRate = num(fd.get("taxRate"));
  const { subtotal, tax, total } = computeOrderTotals(items, discount, taxRate);
  const medicalAidId = optStr(fd.get("medicalAidId"));
  const medicalAidPortion = medicalAidId ? Math.min(total, round2(num(fd.get("medicalAidPortion")))) : 0;
  const status = str(fd.get("status")) || "QUOTE";
  const depositAmount = round2(num(fd.get("depositAmount")));

  const order = await db.$transaction(async (tx) => {
    const orderNo = await nextNumber(tx, ctx.orgId, "ORD");
    const o = await tx.order.create({
      data: {
        orgId: ctx.orgId,
        branchId: ctx.workingBranchId,
        orderNo,
        patientId,
        prescriptionId: optStr(fd.get("prescriptionId")),
        status: medicalAidId && medicalAidPortion > 0 && status === "ORDERED" ? "AWAITING_AUTH" : status,
        currency,
        exchangeRate,
        subtotal,
        discount,
        taxRate,
        tax,
        total,
        medicalAidId,
        medicalAidPortion,
        patientPortion: round2(total - medicalAidPortion),
        labName: optStr(fd.get("labName")),
        promisedDate: optDate(fd.get("promisedDate")),
        notes: optStr(fd.get("notes")),
        createdById: ctx.user.id,
        items: {
          create: items.map((i) => ({
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
    if (medicalAidId && medicalAidPortion > 0) {
      const claimNo = await nextNumber(tx, ctx.orgId, "CLM");
      await tx.medicalAidClaim.create({
        data: { orgId: ctx.orgId, claimNo, orderId: o.id, medicalAidId, patientId, memberNo: patient.medicalAidNo, amount: medicalAidPortion, currency, exchangeRate },
      });
    }
    if (o.status === "ORDERED") await invoiceOrder(tx, o.id);
    if (depositAmount > 0) {
      await recordReceipt(tx, {
        orgId: ctx.orgId,
        branchId: ctx.workingBranchId,
        patientId,
        orderId: o.id,
        amount: depositAmount,
        currency,
        exchangeRate,
        method: str(fd.get("depositMethod")) || "CASH",
        userId: ctx.user.id,
      });
    }
    return o;
  });
  redirect(`/app/orders/${order.id}`);
}

const FLOW = ["QUOTE", "AWAITING_AUTH", "ORDERED", "IN_LAB", "READY", "COLLECTED"];

export async function setOrderStatus(orderId: string, fd: FormData) {
  const ctx = await requireWrite("sales");
  const status = str(fd.get("status"));
  const order = await db.order.findFirstOrThrow({ where: { id: orderId, orgId: ctx.orgId }, include: { patient: true, branch: true } });
  if (!FLOW.includes(status) && status !== "CANCELLED") throw new Error("Invalid status");

  await db.$transaction(async (tx) => {
    if (status === "CANCELLED") {
      await cancelOrder(tx, order.id);
      return;
    }
    // Revenue is recognised once the job is confirmed (ordered) or beyond
    if (FLOW.indexOf(status) >= FLOW.indexOf("ORDERED")) await invoiceOrder(tx, order.id);
    await tx.order.update({
      where: { id: order.id },
      data: {
        status,
        labReference: optStr(fd.get("labReference")) ?? order.labReference,
        collectedAt: status === "COLLECTED" ? new Date() : order.collectedAt,
      },
    });
  });

  if (status === "READY" && fd.get("notify") === "on") {
    const tpl = await db.messageTemplate.findUnique({ where: { orgId_key: { orgId: ctx.orgId, key: "ORDER_READY" } } });
    const phone = order.patient.phone || order.patient.whatsapp;
    if (tpl && phone) {
      const body = renderTemplate(
        tpl.body,
        patientVars(ctx.org, order.patient, { orderNo: order.orderNo, branch: order.branch.name, balance: money(order.patientPortion - order.amountPaid, order.currency) }),
      );
      const channel = str(fd.get("channel")) === "WHATSAPP" ? "WHATSAPP" : "SMS";
      const r = await sendMessage({ orgId: ctx.orgId, patientId: order.patientId, channel, purpose: "ORDER_READY", to: channel === "WHATSAPP" ? order.patient.whatsapp || phone : phone, body });
      if (r.link) redirect(`/app/orders/${orderId}?wa=${encodeURIComponent(r.link)}`);
    }
  }
  revalidatePath(`/app/orders/${orderId}`);
}

export async function addOrderPayment(orderId: string, fd: FormData) {
  const ctx = await requireWrite("sales");
  const order = await db.order.findFirstOrThrow({ where: { id: orderId, orgId: ctx.orgId } });
  const currency = str(fd.get("currency")) || order.currency;
  const cur = await db.currency.findUniqueOrThrow({ where: { orgId_code: { orgId: ctx.orgId, code: currency } } });
  const amount = round2(num(fd.get("amount")));
  if (amount <= 0) throw new Error("Enter an amount");
  await db.$transaction((tx) =>
    recordReceipt(tx, {
      orgId: ctx.orgId,
      branchId: order.branchId,
      patientId: order.patientId,
      orderId: order.id,
      amount,
      currency,
      exchangeRate: num(fd.get("exchangeRate"), cur.rate) || cur.rate,
      method: str(fd.get("method")) || "CASH",
      reference: optStr(fd.get("reference")),
      userId: ctx.user.id,
    }),
  );
  revalidatePath(`/app/orders/${orderId}`);
}
