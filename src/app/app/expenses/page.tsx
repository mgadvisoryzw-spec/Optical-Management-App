import { revalidatePath } from "next/cache";
import { getContext, branchScope, requireWrite } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordExpense } from "@/lib/services";
import { Card, CardHeader, Field, Input, PageHeader, Select, StatCard, Table } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { BarsChart } from "@/components/charts";
import { PAYMENT_METHODS, can, labelOf } from "@/lib/constants";
import { DeleteButton } from "@/components/delete-button";
import { endOfDay, fmtDate, isoDate, money, num, optDate, optStr, round2, startOfMonth, str } from "@/lib/utils";

export const metadata = { title: "Expenses" };

async function addExpense(fd: FormData) {
  "use server";
  const ctx = await requireWrite("accounting");
  const currency = str(fd.get("currency")) || ctx.org.baseCurrency;
  const cur = await db.currency.findUniqueOrThrow({ where: { orgId_code: { orgId: ctx.orgId, code: currency } } });
  const accountCode = str(fd.get("accountCode"));
  await db.account.findFirstOrThrow({ where: { orgId: ctx.orgId, code: accountCode, type: "EXPENSE" } });
  await db.$transaction((tx) =>
    recordExpense(tx, {
      orgId: ctx.orgId,
      branchId: str(fd.get("branchId")) || ctx.workingBranchId,
      date: optDate(fd.get("date")) ?? new Date(),
      accountCode,
      payee: optStr(fd.get("payee")),
      description: str(fd.get("description")) || "Expense",
      amount: round2(num(fd.get("amount"))),
      currency,
      exchangeRate: num(fd.get("exchangeRate"), cur.rate) || cur.rate,
      method: str(fd.get("method")) || "CASH",
      reference: optStr(fd.get("reference")),
    }),
  );
  revalidatePath("/app/expenses");
}

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const from = sp.from ? new Date(sp.from) : startOfMonth();
  const to = sp.to ? endOfDay(new Date(sp.to)) : endOfDay();
  const [expenses, accounts, currencies] = await Promise.all([
    db.expense.findMany({ where: { orgId: ctx.orgId, ...branchScope(ctx), date: { gte: from, lte: to } }, include: { branch: true }, orderBy: { date: "desc" } }),
    db.account.findMany({ where: { orgId: ctx.orgId, type: "EXPENSE", active: true, subtype: { in: ["OPEX", "COGS"] } }, orderBy: { code: "asc" } }),
    db.currency.findMany({ where: { orgId: ctx.orgId, active: true }, orderBy: { isBase: "desc" } }),
  ]);
  const canDelete = can(ctx.user.role, "delete");
  const acctName = new Map(accounts.map((a) => [a.code, a.name]));
  const total = round2(expenses.reduce((s, e) => s + e.baseAmount, 0));
  const byAcct = [...expenses.reduce((m, e) => m.set(e.accountCode, (m.get(e.accountCode) ?? 0) + e.baseAmount), new Map<string, number>())]
    .map(([code, value]) => ({ name: acctName.get(code) ?? code, value: round2(value) }))
    .sort((a, b) => b.value - a.value);

  return (
    <>
      <PageHeader title="Operating expenses" subtitle="Rent, salaries, utilities and other running costs" />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label="Expenses in period" value={money(total, ctx.org.baseCurrency)} hint={`${expenses.length} entries`} accent="rose" />
            <Card className="p-5">
              <form className="flex flex-wrap items-end gap-2">
                <label><span className="label">From</span><input type="date" name="from" defaultValue={isoDate(from)} className="input" /></label>
                <label><span className="label">To</span><input type="date" name="to" defaultValue={isoDate(to)} className="input" /></label>
                <button className="rounded-lg bg-ink-900 px-3 py-2 text-sm font-semibold text-white">Go</button>
              </form>
            </Card>
          </div>
          {byAcct.length > 0 && (
            <Card>
              <CardHeader title="Where the money went" />
              <div className="p-4"><BarsChart data={byAcct.slice(0, 8)} color="#6366f1" /></div>
            </Card>
          )}
          <Card>
            <Table>
              <thead><tr><th>Ref</th><th>Date</th><th>Category</th><th>Description</th><th>Paid via</th>{!ctx.branchId && <th>Branch</th>}<th className="num">Amount</th>{canDelete && <th />}</tr></thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td className="font-semibold">{e.expenseNo}</td>
                    <td>{fmtDate(e.date)}</td>
                    <td className="text-sm">{acctName.get(e.accountCode) ?? e.accountCode}</td>
                    <td className="text-sm">{e.description}{e.payee && <span className="block text-xs text-slate-400">{e.payee}</span>}</td>
                    <td className="text-sm">{e.method === "CREDIT" ? "On account" : labelOf(PAYMENT_METHODS, e.method)}</td>
                    {!ctx.branchId && <td className="text-slate-500">{e.branch.name}</td>}
                    <td className="num font-semibold">{money(e.amount, e.currency)}</td>
                    {canDelete && <td className="text-right"><DeleteButton compact kind="expense" id={e.id} back="/app/expenses" label="" confirm={`Delete ${e.expenseNo} (${e.description})? It is removed from your books. This cannot be undone.`} /></td>}
                  </tr>
                ))}
                {!expenses.length && <tr><td colSpan={8} className="py-10 text-center text-slate-400">No expenses in this period.</td></tr>}
              </tbody>
            </Table>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title="Record an expense" />
          <form action={addExpense} className="space-y-3 p-5">
            <Field label="Category"><Select name="accountCode" options={accounts.map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }))} /></Field>
            <Field label="Description *"><Input name="description" required placeholder="October rent – Harare branch" /></Field>
            <Field label="Payee"><Input name="payee" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount *"><Input name="amount" type="number" step="0.01" min="0.01" required /></Field>
              <Field label="Currency"><Select name="currency" options={currencies.map((c) => ({ value: c.code, label: c.code }))} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><Input name="date" type="date" defaultValue={isoDate(new Date())} /></Field>
              <Field label="Paid via"><Select name="method" options={[...PAYMENT_METHODS, { value: "CREDIT", label: "On account (unpaid)", account: "2000" }]} /></Field>
            </div>
            {ctx.branches.length > 1 && <Field label="Branch"><Select name="branchId" defaultValue={ctx.workingBranchId} options={ctx.branches.map((b) => ({ value: b.id, label: b.name }))} /></Field>}
            <Field label="Reference"><Input name="reference" placeholder="Invoice / slip no." /></Field>
            <SubmitButton className="w-full">Save expense</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
