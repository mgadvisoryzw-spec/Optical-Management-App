import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { readSession } from "@/lib/auth";
import { can } from "@/lib/constants";
import { endOfDay, isoDate } from "@/lib/utils";

function csv(rows: (string | number | null | undefined)[][]) {
  return rows.map((r) => r.map((c) => {
    const s = c === null || c === undefined ? "" : String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const session = await readSession();
  if (!session?.oid) return new NextResponse("Unauthorized", { status: 401 });
  const user = await db.user.findUnique({ where: { id: session.uid } });
  if (!user || user.orgId !== session.oid || !can(user.role, "accounting")) return new NextResponse("Forbidden", { status: 403 });
  const orgId = session.oid;
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ? new Date(sp.get("from")!) : new Date(2000, 0, 1);
  const to = sp.get("to") ? endOfDay(new Date(sp.get("to")!)) : endOfDay();
  let rows: (string | number | null | undefined)[][] = [];

  if (type === "patients") {
    const ps = await db.patient.findMany({ where: { orgId }, include: { medicalAid: true }, orderBy: { patientNo: "asc" } });
    rows = [["Patient no", "First name", "Surname", "DOB", "Gender", "Phone", "WhatsApp", "Email", "Medical aid", "Member no", "Last exam", "Recall due"],
      ...ps.map((p) => [p.patientNo, p.firstName, p.lastName, isoDate(p.dob), p.gender, p.phone, p.whatsapp, p.email, p.medicalAid?.name, p.medicalAidNo, isoDate(p.lastExamDate), isoDate(p.nextRecallDate)])];
  } else if (type === "orders") {
    const os = await db.order.findMany({ where: { orgId, createdAt: { gte: from, lte: to } }, include: { patient: true, branch: true, medicalAid: true }, orderBy: { createdAt: "asc" } });
    rows = [["Order no", "Date", "Branch", "Patient", "Status", "Currency", "Rate", "Subtotal", "Discount", "VAT", "Total", "Medical aid", "MA portion", "Patient portion", "Paid"],
      ...os.map((o) => [o.orderNo, isoDate(o.createdAt), o.branch.name, `${o.patient.firstName} ${o.patient.lastName}`, o.status, o.currency, o.exchangeRate, o.subtotal, o.discount, o.tax, o.total, o.medicalAid?.name, o.medicalAidPortion, o.patientPortion, o.amountPaid])];
  } else if (type === "receipts") {
    const rs = await db.receipt.findMany({ where: { orgId, date: { gte: from, lte: to } }, include: { patient: true, branch: true, order: true }, orderBy: { date: "asc" } });
    rows = [["Receipt no", "Date", "Branch", "Patient", "Order", "Method", "Reference", "Currency", "Amount", "Rate", "Base amount", "Voided"],
      ...rs.map((r) => [r.receiptNo, isoDate(r.date), r.branch.name, r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : "", r.order?.orderNo, r.method, r.reference, r.currency, r.amount, r.exchangeRate, r.baseAmount, r.voided ? "Yes" : ""])];
  } else if (type === "expenses") {
    const es = await db.expense.findMany({ where: { orgId, date: { gte: from, lte: to } }, include: { branch: true }, orderBy: { date: "asc" } });
    rows = [["Ref", "Date", "Branch", "Account", "Payee", "Description", "Method", "Currency", "Amount", "Rate", "Base amount"],
      ...es.map((e) => [e.expenseNo, isoDate(e.date), e.branch.name, e.accountCode, e.payee, e.description, e.method, e.currency, e.amount, e.exchangeRate, e.baseAmount])];
  } else if (type === "journal") {
    const ls = await db.journalLine.findMany({ where: { entry: { orgId, date: { gte: from, lte: to } } }, include: { entry: true, account: true, branch: true }, orderBy: [{ entry: { date: "asc" } }, { entry: { entryNo: "asc" } }] });
    rows = [["Entry", "Date", "Source", "Narration", "Account code", "Account", "Branch", "Debit", "Credit", "Currency", "FX amount"],
      ...ls.map((l) => [l.entry.entryNo, isoDate(l.entry.date), l.entry.source, l.memo ?? l.entry.memo, l.account.code, l.account.name, l.branch?.code, l.debit, l.credit, l.currency, l.fxAmount])];
  } else if (type === "inventory") {
    const ps = await db.product.findMany({ where: { orgId }, include: { stock: { include: { branch: true } } }, orderBy: [{ category: "asc" }, { name: "asc" }] });
    rows = [["SKU", "Category", "Name", "Brand", "Model", "Colour", "Reference", "Size", "Lens type", "Index", "Coating", "Cost", "Price", "Qty on hand", "Value at cost"],
      ...ps.map((p) => {
        const q = p.stock.reduce((s, x) => s + x.quantity, 0);
        return [p.sku, p.category, p.name, p.brand, p.model, p.colour, p.reference, p.frameSize, p.lensType, p.lensIndex, p.coating, p.costPrice, p.sellPrice, q, Math.max(0, q) * p.costPrice];
      })];
  } else {
    return new NextResponse("Unknown export", { status: 404 });
  }

  return new NextResponse(csv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${type}-${isoDate(new Date())}.csv"` },
  });
}
