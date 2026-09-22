"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWrite } from "@/lib/auth";
import { invoiceOrder, recordClaimPayment } from "@/lib/services";
import { num, optStr, round2, str } from "@/lib/utils";

async function loadClaim(id: string) {
  const ctx = await requireWrite("sales");
  const claim = await db.medicalAidClaim.findFirstOrThrow({ where: { id, orgId: ctx.orgId }, include: { order: true } });
  return { ctx, claim };
}

export async function authoriseClaim(id: string, fd: FormData) {
  const { claim } = await loadClaim(id);
  const approved = round2(num(fd.get("approvedAmount"), claim.amount));
  await db.$transaction(async (tx) => {
    // If the funder approves less than requested, the difference moves to the patient before the sale is posted
    if (approved < claim.amount && !claim.order.invoicedAt) {
      const diff = round2(claim.amount - approved);
      await tx.order.update({
        where: { id: claim.orderId },
        data: { medicalAidPortion: approved, patientPortion: round2(claim.order.patientPortion + diff) },
      });
    }
    await tx.medicalAidClaim.update({
      where: { id },
      data: { status: "AUTHORISED", authNumber: optStr(fd.get("authNumber")), amount: claim.order.invoicedAt ? claim.amount : approved },
    });
    if (claim.order.status === "AWAITING_AUTH") {
      await invoiceOrder(tx, claim.orderId);
      await tx.order.update({ where: { id: claim.orderId }, data: { status: "ORDERED" } });
    }
  });
  revalidatePath(`/app/medical-aid/${id}`);
}

export async function submitClaim(id: string) {
  await loadClaim(id);
  await db.medicalAidClaim.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
  revalidatePath(`/app/medical-aid/${id}`);
}

export async function claimPayment(id: string, fd: FormData) {
  await loadClaim(id);
  const remainder = str(fd.get("remainder")) as "KEEP_OPEN" | "BILL_PATIENT" | "WRITE_OFF";
  await db.$transaction((tx) =>
    recordClaimPayment(tx, { claimId: id, amount: round2(num(fd.get("amount"))), method: str(fd.get("method")) || "BANK_TRANSFER", remainder: remainder || "KEEP_OPEN", reference: optStr(fd.get("reference")) }),
  );
  revalidatePath(`/app/medical-aid/${id}`);
}

export async function rejectClaim(id: string, fd: FormData) {
  const { claim } = await loadClaim(id);
  await db.$transaction(async (tx) => {
    if (claim.order.invoicedAt) {
      await recordClaimPayment(tx, { claimId: id, amount: 0, method: "BANK_TRANSFER", remainder: "BILL_PATIENT" });
    } else {
      // not yet posted: patient becomes liable for the whole amount
      await tx.order.update({
        where: { id: claim.orderId },
        data: { medicalAidPortion: 0, patientPortion: claim.order.total, medicalAidId: null, status: claim.order.status === "AWAITING_AUTH" ? "QUOTE" : claim.order.status },
      });
    }
    await tx.medicalAidClaim.update({ where: { id }, data: { status: "REJECTED", notes: optStr(fd.get("notes")) } });
  });
  revalidatePath(`/app/medical-aid/${id}`);
}
