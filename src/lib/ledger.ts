import type { Tx } from "./db";
import { round2 } from "./utils";

export type LedgerLine = {
  account: string; // account code
  debit?: number; // base currency
  credit?: number; // base currency
  memo?: string;
  currency?: string;
  fxAmount?: number;
};

/** Next sequential document number for a tenant, e.g. ORD-000123. */
export async function nextNumber(tx: Tx, orgId: string, key: string, width = 6) {
  const c = await tx.counter.upsert({
    where: { orgId_key: { orgId, key } },
    create: { orgId, key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${key}-${String(c.value).padStart(width, "0")}`;
}

/**
 * Posts a balanced double-entry journal in the organisation's base currency.
 * Lines with zero value are dropped. Throws if debits ≠ credits.
 */
export async function postJournal(
  tx: Tx,
  args: { orgId: string; branchId?: string | null; date: Date; memo: string; source: string; sourceId?: string; lines: LedgerLine[] },
) {
  const lines = args.lines
    .map((l) => ({ ...l, debit: round2(l.debit ?? 0), credit: round2(l.credit ?? 0) }))
    .filter((l) => l.debit !== 0 || l.credit !== 0)
    .map((l) => {
      // normalise negative amounts onto the opposite side
      if (l.debit < 0) return { ...l, credit: l.credit - l.debit, debit: 0 };
      if (l.credit < 0) return { ...l, debit: l.debit - l.credit, credit: 0 };
      return l;
    });
  if (lines.length === 0) return null;

  const dr = round2(lines.reduce((s, l) => s + l.debit, 0));
  const cr = round2(lines.reduce((s, l) => s + l.credit, 0));
  const diff = round2(dr - cr);
  if (Math.abs(diff) > 0.05) throw new Error(`Unbalanced journal "${args.memo}": Dr ${dr} vs Cr ${cr}`);
  if (diff !== 0) {
    // absorb rounding pennies from FX conversion on the largest line
    const big = lines.reduce((a, b) => (Math.max(a.debit, a.credit) >= Math.max(b.debit, b.credit) ? a : b));
    if (big.debit) big.debit = round2(big.debit - diff);
    else big.credit = round2(big.credit + diff);
  }

  const codes = [...new Set(lines.map((l) => l.account))];
  const accounts = await tx.account.findMany({ where: { orgId: args.orgId, code: { in: codes } } });
  const byCode = new Map(accounts.map((a) => [a.code, a.id]));
  for (const c of codes) if (!byCode.has(c)) throw new Error(`Account ${c} is missing from the chart of accounts`);

  const entryNo = await nextNumber(tx, args.orgId, "JNL", 7);
  return tx.journalEntry.create({
    data: {
      orgId: args.orgId,
      entryNo,
      date: args.date,
      memo: args.memo,
      source: args.source,
      sourceId: args.sourceId,
      lines: {
        create: lines.map((l) => ({
          accountId: byCode.get(l.account)!,
          branchId: args.branchId ?? null,
          debit: l.debit,
          credit: l.credit,
          memo: l.memo,
          currency: l.currency,
          fxAmount: l.fxAmount,
        })),
      },
    },
  });
}

/**
 * Reverses every journal raised by a source document that has not already been reversed
 * (used when voiding, cancelling or editing). Safe to call more than once.
 */
export async function reverseSource(tx: Tx, orgId: string, source: string, sourceId: string, date = new Date()) {
  const entries = await tx.journalEntry.findMany({ where: { orgId, source, sourceId }, include: { lines: { include: { account: true } } }, orderBy: { createdAt: "asc" } });
  const reversals = await tx.journalEntry.findMany({ where: { orgId, source: source + "_REVERSAL", sourceId }, select: { memo: true } });
  const alreadyReversed = new Set(reversals.map((r) => r.memo.match(/^Reversal of (\S+):/)?.[1]).filter(Boolean));
  for (const e of entries) {
    if (alreadyReversed.has(e.entryNo)) continue;
    await postJournal(tx, {
      orgId,
      branchId: e.lines[0]?.branchId,
      date,
      memo: `Reversal of ${e.entryNo}: ${e.memo}`,
      source: source + "_REVERSAL",
      sourceId,
      lines: e.lines.map((l) => ({ account: l.account.code, debit: l.credit, credit: l.debit })),
    });
  }
}

/** Converts an amount in a transaction currency to the base currency. */
export function toBase(amount: number, rate: number) {
  return round2(amount / (rate || 1));
}
