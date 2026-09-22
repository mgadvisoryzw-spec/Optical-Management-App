import { db } from "./db";
import { round2 } from "./utils";

type Range = { from?: Date; to?: Date; branchId?: string | null };

/** Balance per account (debit − credit) for the given period/branch. */
export async function accountBalances(orgId: string, { from, to, branchId }: Range) {
  const accounts = await db.account.findMany({ where: { orgId }, orderBy: { code: "asc" } });
  const grouped = await db.journalLine.groupBy({
    by: ["accountId"],
    where: {
      entry: { orgId, date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } },
      ...(branchId ? { branchId } : {}),
    },
    _sum: { debit: true, credit: true },
  });
  const map = new Map(grouped.map((g) => [g.accountId, g._sum]));
  return accounts.map((a) => {
    const s = map.get(a.id);
    const debit = round2(s?.debit ?? 0);
    const credit = round2(s?.credit ?? 0);
    return { ...a, debit, credit, balance: round2(debit - credit) };
  });
}

export async function profitAndLoss(orgId: string, range: Range) {
  const rows = await accountBalances(orgId, range);
  const income = rows.filter((r) => r.type === "INCOME").map((r) => ({ ...r, amount: -r.balance }));
  const cogs = rows.filter((r) => r.type === "EXPENSE" && r.subtype === "COGS").map((r) => ({ ...r, amount: r.balance }));
  const opex = rows.filter((r) => r.type === "EXPENSE" && r.subtype !== "COGS").map((r) => ({ ...r, amount: r.balance }));
  const totalIncome = round2(income.reduce((s, r) => s + r.amount, 0));
  const totalCogs = round2(cogs.reduce((s, r) => s + r.amount, 0));
  const grossProfit = round2(totalIncome - totalCogs);
  const totalOpex = round2(opex.reduce((s, r) => s + r.amount, 0));
  const netProfit = round2(grossProfit - totalOpex);
  return { income, cogs, opex, totalIncome, totalCogs, grossProfit, totalOpex, netProfit };
}

export async function balanceSheet(orgId: string, asOf: Date, branchId?: string | null) {
  const rows = await accountBalances(orgId, { to: asOf, branchId });
  const assets = rows.filter((r) => r.type === "ASSET").map((r) => ({ ...r, amount: r.balance }));
  const liabilities = rows.filter((r) => r.type === "LIABILITY").map((r) => ({ ...r, amount: -r.balance }));
  const equity = rows.filter((r) => r.type === "EQUITY").map((r) => ({ ...r, amount: -r.balance }));
  const earnings = round2(rows.filter((r) => r.type === "INCOME" || r.type === "EXPENSE").reduce((s, r) => s - r.balance, 0));
  const totalAssets = round2(assets.reduce((s, r) => s + r.amount, 0));
  const totalLiabilities = round2(liabilities.reduce((s, r) => s + r.amount, 0));
  const totalEquity = round2(equity.reduce((s, r) => s + r.amount, 0) + earnings);
  return { assets, liabilities, equity, earnings, totalAssets, totalLiabilities, totalEquity };
}

/** Monthly revenue (income accounts) for the last N months, in base currency. */
export async function monthlyRevenue(orgId: string, months: number, branchId?: string | null) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const lines = await db.journalLine.findMany({
    where: { entry: { orgId, date: { gte: start } }, account: { type: { in: ["INCOME", "EXPENSE"] } }, ...(branchId ? { branchId } : {}) },
    select: { debit: true, credit: true, account: { select: { type: true } }, entry: { select: { date: true } } },
  });
  const buckets = Array.from({ length: months }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-GB", { month: "short" }), revenue: 0, expenses: 0 };
  });
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const l of lines) {
    const d = l.entry.date;
    const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (i === undefined) continue;
    if (l.account.type === "INCOME") buckets[i].revenue += l.credit - l.debit;
    else buckets[i].expenses += l.debit - l.credit;
  }
  return buckets.map((b) => ({ ...b, revenue: round2(b.revenue), expenses: round2(b.expenses), profit: round2(b.revenue - b.expenses) }));
}
