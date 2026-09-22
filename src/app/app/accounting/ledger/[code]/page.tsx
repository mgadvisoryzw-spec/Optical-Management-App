import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Table } from "@/components/ui";
import { fmtDate, money, round2 } from "@/lib/utils";

export default async function LedgerPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ctx = await requirePermission("accounting");
  const account = await db.account.findUnique({ where: { orgId_code: { orgId: ctx.orgId, code } } });
  if (!account) notFound();
  const lines = await db.journalLine.findMany({
    where: { accountId: account.id, ...(ctx.branchId ? { branchId: ctx.branchId } : {}) },
    include: { entry: true, branch: true },
    orderBy: [{ entry: { date: "asc" } }, { entry: { entryNo: "asc" } }],
    take: 1000,
  });
  const debitNormal = ["ASSET", "EXPENSE"].includes(account.type);
  let run = 0;
  const rows = lines.map((l) => {
    run = round2(run + (debitNormal ? l.debit - l.credit : l.credit - l.debit));
    return { ...l, run };
  });
  return (
    <>
      <PageHeader title={`${account.code} · ${account.name}`} subtitle={`${account.type.toLowerCase()} account · balance ${money(run, ctx.org.baseCurrency)}`} back={{ href: "/app/accounting?tab=accounts", label: "Chart of accounts" }} />
      <Card>
        <Table>
          <thead><tr><th>Date</th><th>Entry</th><th>Narration</th><th>Branch</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr></thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td>{fmtDate(l.entry.date)}</td>
                <td className="font-mono text-xs">{l.entry.entryNo}</td>
                <td className="text-sm">{l.memo ?? l.entry.memo}{l.currency && l.fxAmount ? <span className="text-xs text-slate-400"> · {l.currency} {l.fxAmount.toFixed(2)}</span> : null}</td>
                <td className="text-xs text-slate-500">{l.branch?.code ?? "—"}</td>
                <td className="num">{l.debit ? money(l.debit) : ""}</td>
                <td className="num">{l.credit ? money(l.credit) : ""}</td>
                <td className="num font-semibold">{money(l.run)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="py-10 text-center text-slate-400">No transactions.</td></tr>}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
