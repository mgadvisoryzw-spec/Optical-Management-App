/**
 * Financial statements built from the general ledger, in one tabular shape that is used by
 * the on-screen reports and the PDF / Excel / CSV downloads, so they always agree.
 */
import { db } from "./db";
import { accountBalances, balanceSheet, profitAndLoss } from "./reports";
import { LENS_TYPES, PRODUCT_CATEGORIES, labelOf } from "./constants";
import { INVENTORY_ACCOUNTS } from "./chart-of-accounts";
import { fmtDate, round2 } from "./utils";

export type RowStyle = "heading" | "line" | "subtotal" | "total" | "note";
export type StatementRow = { cells: (string | number | null)[]; style?: RowStyle; indent?: boolean; code?: string };
export type StatementColumn = { label: string; align?: "left" | "right"; money?: boolean; width?: number };
export type Statement = {
  kind: StatementKind;
  title: string;
  subtitle: string;
  columns: StatementColumn[];
  rows: StatementRow[];
  notes?: string[];
  orientation?: "portrait" | "landscape";
};

export const STATEMENT_KINDS = ["income-statement", "balance-sheet", "cash-flow", "inventory-valuation"] as const;
export type StatementKind = (typeof STATEMENT_KINDS)[number];

export const STATEMENT_TITLES: Record<StatementKind, string> = {
  "income-statement": "Income statement",
  "balance-sheet": "Balance sheet",
  "cash-flow": "Cash flow statement",
  "inventory-valuation": "Inventory valuation",
};

type Opts = { orgId: string; from: Date; to: Date; branchId: string | null; branchLabel: string; currency: string };

const TWO_COL: StatementColumn[] = [{ label: "" }, { label: "", align: "right", money: true }];
const heading = (label: string): StatementRow => ({ cells: [label, null], style: "heading" });
const line = (label: string, amount: number, code?: string): StatementRow => ({ cells: [label, round2(amount)], style: "line", indent: true, code });
const subtotal = (label: string, amount: number): StatementRow => ({ cells: [label, round2(amount)], style: "subtotal" });
const total = (label: string, amount: number): StatementRow => ({ cells: [label, round2(amount)], style: "total" });

async function incomeStatement(o: Opts): Promise<Statement> {
  const p = await profitAndLoss(o.orgId, { from: o.from, to: o.to, branchId: o.branchId });
  const margin = p.totalIncome ? Math.round((p.grossProfit / p.totalIncome) * 100) : 0;
  const rows: StatementRow[] = [
    heading("Revenue"),
    ...p.income.filter((r) => r.amount).map((r) => line(r.name, r.amount, r.code)),
    subtotal("Total revenue", p.totalIncome),
    heading("Cost of sales"),
    ...p.cogs.filter((r) => r.amount).map((r) => line(r.name, r.amount, r.code)),
    subtotal(`Gross profit (${margin}% margin)`, p.grossProfit),
    heading("Operating expenses"),
    ...p.opex.filter((r) => r.amount).map((r) => line(r.name, r.amount, r.code)),
    subtotal("Total operating expenses", p.totalOpex),
    total(p.netProfit >= 0 ? "Net profit" : "Net loss", p.netProfit),
  ];
  return { kind: "income-statement", title: "Income statement", subtitle: `For the period ${fmtDate(o.from)} to ${fmtDate(o.to)} · ${o.branchLabel} · ${o.currency}`, columns: TWO_COL, rows };
}

async function balanceSheetStatement(o: Opts): Promise<Statement> {
  const b = await balanceSheet(o.orgId, o.to, o.branchId);
  const diff = round2(b.totalAssets - b.totalLiabilities - b.totalEquity);
  const rows: StatementRow[] = [
    heading("Assets"),
    ...b.assets.filter((r) => r.amount).map((r) => line(r.name, r.amount, r.code)),
    subtotal("Total assets", b.totalAssets),
    heading("Liabilities"),
    ...b.liabilities.filter((r) => r.amount).map((r) => line(r.name, r.amount, r.code)),
    subtotal("Total liabilities", b.totalLiabilities),
    heading("Equity"),
    ...b.equity.filter((r) => r.amount).map((r) => line(r.name, r.amount, r.code)),
    line("Current & retained earnings", b.earnings),
    subtotal("Total equity", b.totalEquity),
    total("Total liabilities & equity", b.totalLiabilities + b.totalEquity),
  ];
  return {
    kind: "balance-sheet",
    title: "Balance sheet",
    subtitle: `As at ${fmtDate(o.to)} · ${o.branchLabel} · ${o.currency}`,
    columns: TWO_COL,
    rows,
    notes: Math.abs(diff) < 0.01 ? undefined : [`Out of balance by ${diff.toFixed(2)}. Check manual journals.`],
  };
}

const CASH_SUBTYPES = ["CASH", "BANK", "MOBILE"];

/** Indirect-method cash flow statement. Every non-cash balance sheet account is classified, so it always reconciles. */
async function cashFlow(o: Opts): Promise<Statement> {
  const dayBefore = new Date(o.from.getTime() - 1);
  const [start, end, pnl] = await Promise.all([
    accountBalances(o.orgId, { to: dayBefore, branchId: o.branchId }),
    accountBalances(o.orgId, { to: o.to, branchId: o.branchId }),
    profitAndLoss(o.orgId, { from: o.from, to: o.to, branchId: o.branchId }),
  ]);
  const opening = new Map(start.map((a) => [a.code, a.balance]));
  const delta = (a: { code: string; balance: number }) => round2(a.balance - (opening.get(a.code) ?? 0)); // debit-positive change
  const bs = end.filter((a) => ["ASSET", "LIABILITY", "EQUITY"].includes(a.type));

  const operating: StatementRow[] = [];
  const investing: StatementRow[] = [];
  const financing: StatementRow[] = [];
  let depreciation = 0;
  for (const a of bs) {
    if (CASH_SUBTYPES.includes(a.subtype ?? "")) continue;
    const effect = -delta(a); // an increase in an asset uses cash; an increase in a liability or equity provides it
    if (Math.abs(effect) < 0.005) continue;
    if (a.code === "1590") depreciation += effect;
    else if (a.subtype === "FIXED") investing.push(line(effect < 0 ? `Purchase of ${a.name.toLowerCase()}` : `Disposal of ${a.name.toLowerCase()}`, effect, a.code));
    else if (a.type === "EQUITY" || a.code === "2300") financing.push(line(`${effect >= 0 ? "Increase" : "Decrease"} in ${a.name.toLowerCase()}`, effect, a.code));
    else operating.push(line(`${a.type === "ASSET" ? (effect < 0 ? "Increase" : "Decrease") : effect >= 0 ? "Increase" : "Decrease"} in ${a.name.toLowerCase()}`, effect, a.code));
  }
  const netOperating = round2(pnl.netProfit + depreciation + operating.reduce((s, r) => s + (r.cells[1] as number), 0));
  const netInvesting = round2(investing.reduce((s, r) => s + (r.cells[1] as number), 0));
  const netFinancing = round2(financing.reduce((s, r) => s + (r.cells[1] as number), 0));
  const cashAccounts = end.filter((a) => CASH_SUBTYPES.includes(a.subtype ?? ""));
  const openingCash = round2(cashAccounts.reduce((s, a) => s + (opening.get(a.code) ?? 0), 0));
  const closingCash = round2(cashAccounts.reduce((s, a) => s + a.balance, 0));
  const netChange = round2(netOperating + netInvesting + netFinancing);

  const rows: StatementRow[] = [
    heading("Cash flows from operating activities"),
    line(pnl.netProfit >= 0 ? "Net profit for the period" : "Net loss for the period", pnl.netProfit),
    ...(depreciation ? [line("Add back: depreciation", depreciation, "1590")] : []),
    ...operating,
    subtotal("Net cash from operating activities", netOperating),
    heading("Cash flows from investing activities"),
    ...(investing.length ? investing : [{ cells: ["No investing activity", 0], style: "note" as const, indent: true }]),
    subtotal("Net cash used in investing activities", netInvesting),
    heading("Cash flows from financing activities"),
    ...(financing.length ? financing : [{ cells: ["No financing activity", 0], style: "note" as const, indent: true }]),
    subtotal("Net cash from financing activities", netFinancing),
    total("Net increase / (decrease) in cash", netChange),
    line("Cash & cash equivalents at the beginning of the period", openingCash),
    total("Cash & cash equivalents at the end of the period", closingCash),
    heading("Cash & cash equivalents comprise"),
    ...cashAccounts.map((a) => line(a.name, a.balance, a.code)),
  ];
  const gap = round2(openingCash + netChange - closingCash);
  return {
    kind: "cash-flow",
    title: "Cash flow statement",
    subtitle: `For the period ${fmtDate(o.from)} to ${fmtDate(o.to)} · ${o.branchLabel} · ${o.currency}`,
    columns: TWO_COL,
    rows,
    notes: Math.abs(gap) < 0.01 ? ["Prepared using the indirect method."] : [`Prepared using the indirect method. Unreconciled difference of ${gap.toFixed(2)}.`],
  };
}

export type ValuationLine = {
  productId: string;
  sku: string;
  name: string;
  category: string;
  details: string;
  qty: number;
  unitCost: number;
  value: number;
  sellPrice: number;
  retail: number;
  byBranch: Record<string, number>;
};

/** Stock on hand at a date (from stock movements), valued at weighted-average cost. */
export async function inventoryValuationData(orgId: string, asOf: Date, branchId: string | null) {
  const products = await db.product.findMany({ where: { orgId, trackStock: true }, orderBy: [{ category: "asc" }, { name: "asc" }] });
  const moves = await db.stockMovement.groupBy({
    by: ["productId", "branchId"],
    where: { product: { orgId }, createdAt: { lte: asOf }, ...(branchId ? { branchId } : {}) },
    _sum: { quantity: true },
  });
  const qtyMap = new Map<string, Record<string, number>>();
  for (const m of moves) {
    const rec = qtyMap.get(m.productId) ?? {};
    rec[m.branchId] = round2((rec[m.branchId] ?? 0) + (m._sum.quantity ?? 0));
    qtyMap.set(m.productId, rec);
  }
  const lines: ValuationLine[] = [];
  for (const p of products) {
    const byBranch = qtyMap.get(p.id) ?? {};
    const qty = round2(Object.values(byBranch).reduce((s, q) => s + q, 0));
    if (qty === 0 && !p.active) continue;
    const valued = Math.max(0, qty);
    lines.push({
      productId: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category,
      details:
        p.category === "FRAME"
          ? [p.colour, p.reference && `ref ${p.reference}`, p.frameSize].filter(Boolean).join(" · ")
          : p.category === "LENS"
            ? [labelOf(LENS_TYPES, p.lensType), p.lensIndex, p.coating].filter(Boolean).join(" · ")
            : [p.brand].filter(Boolean).join(" · "),
      qty,
      unitCost: p.costPrice,
      value: round2(valued * p.costPrice),
      sellPrice: p.sellPrice,
      retail: round2(valued * p.sellPrice),
      byBranch,
    });
  }
  // Inventory per the general ledger, for reconciliation
  const invCodes = [...new Set(Object.values(INVENTORY_ACCOUNTS).map((a) => a.inventory))];
  const ledger = (await accountBalances(orgId, { to: asOf, branchId })).filter((a) => invCodes.includes(a.code));
  const ledgerTotal = round2(ledger.reduce((s, a) => s + a.balance, 0));
  return { lines, ledger, ledgerTotal };
}

async function inventoryValuation(o: Opts): Promise<Statement> {
  const { lines, ledgerTotal } = await inventoryValuationData(o.orgId, o.to, o.branchId);
  const rows: StatementRow[] = [];
  let totValue = 0;
  let totRetail = 0;
  let totQty = 0;
  for (const cat of PRODUCT_CATEGORIES) {
    const items = lines.filter((l) => l.category === cat.value);
    if (!items.length) continue;
    rows.push({ cells: [cat.label, null, null, null, null, null, null, null], style: "heading" });
    for (const l of items) {
      const margin = l.sellPrice > 0 ? Math.round(((l.sellPrice - l.unitCost) / l.sellPrice) * 100) + "%" : "—";
      rows.push({ cells: [l.sku, l.details ? `${l.name} (${l.details})` : l.name, l.qty, l.unitCost, l.value, l.sellPrice, l.retail, margin], style: "line" });
    }
    const v = round2(items.reduce((s, l) => s + l.value, 0));
    const r = round2(items.reduce((s, l) => s + l.retail, 0));
    const q = round2(items.reduce((s, l) => s + Math.max(0, l.qty), 0));
    totValue += v;
    totRetail += r;
    totQty += q;
    rows.push({ cells: [`Total ${cat.label.toLowerCase()}`, null, q, null, v, null, r, r ? Math.round(((r - v) / r) * 100) + "%" : "—"], style: "subtotal" });
  }
  rows.push({ cells: ["Total inventory", null, round2(totQty), null, round2(totValue), null, round2(totRetail), totRetail ? Math.round(((totRetail - totValue) / totRetail) * 100) + "%" : "—"], style: "total" });
  rows.push({ cells: ["Inventory per general ledger", null, null, null, ledgerTotal, null, null, null], style: "line" });
  rows.push({ cells: ["Difference (stock count vs ledger)", null, null, null, round2(totValue - ledgerTotal), null, null, null], style: "line" });
  return {
    kind: "inventory-valuation",
    title: "Inventory valuation",
    subtitle: `As at ${fmtDate(o.to)} · ${o.branchLabel} · ${o.currency} · weighted-average cost`,
    orientation: "landscape",
    columns: [
      { label: "SKU", width: 14 },
      { label: "Item", width: 48 },
      { label: "Qty", align: "right", width: 9 },
      { label: "Unit cost", align: "right", money: true, width: 12 },
      { label: "Value at cost", align: "right", money: true, width: 14 },
      { label: "Selling price", align: "right", money: true, width: 12 },
      { label: "Retail value", align: "right", money: true, width: 14 },
      { label: "Margin", align: "right", width: 9 },
    ],
    rows,
    notes: [
      "Quantities are stock on hand at the date shown, from stock movements. Items with negative stock are valued at zero.",
      "Differences against the ledger come from negative stock, cost price changes after the date, or journals posted directly to inventory accounts.",
    ],
  };
}

export async function buildStatement(kind: StatementKind, o: Opts): Promise<Statement> {
  switch (kind) {
    case "income-statement":
      return incomeStatement(o);
    case "balance-sheet":
      return balanceSheetStatement(o);
    case "cash-flow":
      return cashFlow(o);
    case "inventory-valuation":
      return inventoryValuation(o);
  }
}
