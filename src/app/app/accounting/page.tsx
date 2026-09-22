import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePermission, requireWrite } from "@/lib/auth";
import { db } from "@/lib/db";
import { postJournal } from "@/lib/ledger";
import { accountBalances } from "@/lib/reports";
import { buildStatement, type StatementKind } from "@/lib/statements";
import { StatementDownloads, StatementView } from "@/components/statement-view";
import { DeleteButton } from "@/components/delete-button";
import { can } from "@/lib/constants";
import { Badge, Card, CardHeader, PageHeader, Table } from "@/components/ui";
import { PrintButton } from "@/components/client";
import { JournalForm } from "./journal-form";
import { cn, endOfDay, fmtDate, isoDate, money, optDate, round2, str } from "@/lib/utils";

export const metadata = { title: "Accounting" };

async function postManual(fd: FormData) {
  "use server";
  const ctx = await requireWrite("accounting");
  const lines = JSON.parse(str(fd.get("lines")) || "[]") as { account: string; debit: number; credit: number; memo: string }[];
  await db.$transaction((tx) =>
    postJournal(tx, { orgId: ctx.orgId, branchId: ctx.branchId, date: optDate(fd.get("date")) ?? new Date(), memo: str(fd.get("memo")), source: "MANUAL", lines }),
  );
  redirect("/app/accounting?tab=journal");
}

const TABS = [
  { v: "pnl", l: "Profit & loss" },
  { v: "balance", l: "Balance sheet" },
  { v: "cashflow", l: "Cash flow" },
  { v: "trial", l: "Trial balance" },
  { v: "journal", l: "Journal" },
  { v: "accounts", l: "Chart of accounts" },
  { v: "manual", l: "Manual journal" },
];

export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ tab?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("accounting");
  const tab = sp.tab ?? "pnl";
  const from = sp.from ? new Date(sp.from) : new Date(new Date().getFullYear(), 0, 1);
  const to = sp.to ? endOfDay(new Date(sp.to)) : endOfDay();
  const branchLabel = ctx.branchId ? ctx.branches.find((b) => b.id === ctx.branchId)?.name : "All branches (consolidated)";
  const qs = (t: string) => `?tab=${t}&from=${isoDate(from)}&to=${isoDate(to)}`;

  return (
    <>
      <PageHeader title="Accounting" subtitle={`Double-entry general ledger · ${ctx.org.baseCurrency} · ${branchLabel}`} actions={<PrintButton />} />
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Link key={t.v} href={qs(t.v)} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", tab === t.v ? "bg-ink-900 text-white" : "bg-white ring-1 ring-slate-200")}>{t.l}</Link>
        ))}
        {!["accounts", "manual"].includes(tab) && (
          <form className="ml-auto flex items-end gap-2">
            <input type="hidden" name="tab" value={tab} />
            {tab !== "balance" && tab !== "trial" && <input type="date" name="from" defaultValue={isoDate(from)} className="input py-1.5" />}
            <input type="date" name="to" defaultValue={isoDate(to)} className="input py-1.5" />
            <button className="rounded-lg bg-ink-900 px-3 py-1.5 text-sm font-semibold text-white">Apply</button>
          </form>
        )}
      </div>

      {STATEMENT_TABS[tab] && (
        <Statement
          kind={STATEMENT_TABS[tab]}
          opts={{ orgId: ctx.orgId, from, to, branchId: ctx.branchId, branchLabel: branchLabel ?? "", currency: ctx.org.baseCurrency }}
          downloadFrom={STATEMENT_TABS[tab] === "balance-sheet" ? undefined : isoDate(from)}
          downloadTo={isoDate(to)}
        />
      )}
      {tab === "trial" && <Trial orgId={ctx.orgId} to={to} branchId={ctx.branchId} />}
      {tab === "journal" && <Journal orgId={ctx.orgId} from={from} to={to} canDelete={can(ctx.user.role, "delete")} back={qs("journal")} />}
      {tab === "accounts" && <Accounts orgId={ctx.orgId} />}
      {tab === "manual" && (
        <Card>
          <CardHeader title="Manual journal entry" subtitle="For opening balances, owner capital, drawings, loans, accruals and corrections" />
          <div className="p-5">
            <JournalForm action={postManual} accounts={(await db.account.findMany({ where: { orgId: ctx.orgId, active: true }, orderBy: { code: "asc" } })).map((a) => ({ code: a.code, name: a.name }))} today={isoDate(new Date())} />
          </div>
        </Card>
      )}
    </>
  );
}

const STATEMENT_TABS: Record<string, StatementKind> = { pnl: "income-statement", balance: "balance-sheet", cashflow: "cash-flow" };

async function Statement({ kind, opts, downloadFrom, downloadTo }: { kind: StatementKind; opts: Parameters<typeof buildStatement>[1]; downloadFrom?: string; downloadTo: string }) {
  const statement = await buildStatement(kind, opts);
  return <StatementView className="mx-auto max-w-4xl" statement={statement} action={<StatementDownloads kind={kind} from={downloadFrom} to={downloadTo} />} />;
}

async function Trial({ orgId, to, branchId }: { orgId: string; to: Date; branchId: string | null }) {
  const rows = (await accountBalances(orgId, { to, branchId })).filter((r) => r.debit || r.credit);
  const dr = round2(rows.reduce((s, r) => s + (r.balance > 0 ? r.balance : 0), 0));
  const cr = round2(rows.reduce((s, r) => s + (r.balance < 0 ? -r.balance : 0), 0));
  return (
    <Card className="print-area">
      <CardHeader title="Trial balance" subtitle={`As at ${fmtDate(to)}`} />
      <Table>
        <thead><tr><th>Code</th><th>Account</th><th>Type</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="font-mono text-xs">{r.code}</td>
              <td><Link href={`/app/accounting/ledger/${r.code}`} className="hover:text-brand-700">{r.name}</Link></td>
              <td className="text-xs text-slate-500">{r.type}</td>
              <td className="num">{r.balance > 0 ? money(r.balance) : ""}</td>
              <td className="num">{r.balance < 0 ? money(-r.balance) : ""}</td>
            </tr>
          ))}
          <tr className="font-bold"><td /><td>Totals</td><td /><td className="num">{money(dr)}</td><td className="num">{money(cr)}</td></tr>
        </tbody>
      </Table>
    </Card>
  );
}

async function Journal({ orgId, from, to, canDelete, back }: { orgId: string; from: Date; to: Date; canDelete: boolean; back: string }) {
  const entries = await db.journalEntry.findMany({ where: { orgId, date: { gte: from, lte: to } }, include: { lines: { include: { account: true } } }, orderBy: [{ date: "desc" }, { entryNo: "desc" }], take: 150 });
  return (
    <Card>
      <CardHeader title="General journal" subtitle="Latest 150 entries in the period" />
      <div className="divide-y divide-slate-100">
        {entries.map((e) => (
          <div key={e.id} className="px-5 py-3">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono text-xs text-slate-400">{e.entryNo}</span>
              <span className="font-semibold">{fmtDate(e.date)}</span>
              <Badge>{e.source.toLowerCase().replace("_", " ")}</Badge>
              <span className="text-slate-600">{e.memo}</span>
              {canDelete && e.source === "MANUAL" && (
                <DeleteButton compact className="ml-auto" kind="journal" id={e.id} back={`/app/accounting${back}`} label="Delete" confirm={`Delete manual journal ${e.entryNo} (${e.memo})? This cannot be undone.`} />
              )}
            </div>
            <table className="w-full text-xs">
              <tbody>
                {e.lines.map((l) => (
                  <tr key={l.id}>
                    <td className={cn("py-0.5", l.credit ? "pl-8" : "")}>{l.account.code} · {l.account.name}{l.currency && l.fxAmount ? <span className="text-slate-400"> ({l.currency} {l.fxAmount.toFixed(2)})</span> : null}</td>
                    <td className="w-28 text-right tabular-nums">{l.debit ? money(l.debit) : ""}</td>
                    <td className="w-28 text-right tabular-nums">{l.credit ? money(l.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {!entries.length && <p className="p-8 text-center text-sm text-slate-400">No journal entries in this period.</p>}
      </div>
    </Card>
  );
}

async function Accounts({ orgId }: { orgId: string }) {
  const rows = await accountBalances(orgId, {});
  const groups = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {groups.map((g) => (
        <Card key={g}>
          <CardHeader title={g.charAt(0) + g.slice(1).toLowerCase() + (g === "EQUITY" ? "" : "s")} />
          <Table>
            <tbody>
              {rows.filter((r) => r.type === g).map((r) => (
                <tr key={r.id}>
                  <td className="w-16 font-mono text-xs">{r.code}</td>
                  <td><Link href={`/app/accounting/ledger/${r.code}`} className="hover:text-brand-700">{r.name}</Link></td>
                  <td className="num">{money(["ASSET", "EXPENSE"].includes(g) ? r.balance : -r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ))}
    </div>
  );
}
