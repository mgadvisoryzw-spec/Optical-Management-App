import { revalidatePath } from "next/cache";
import { getContext, requireWrite } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAsset, runDepreciation } from "@/lib/services";
import { Alert, Card, CardHeader, Field, Input, PageHeader, Select, StatCard, Table } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ASSET_CATEGORIES, PAYMENT_METHODS, labelOf } from "@/lib/constants";
import { fmtDate, isoDate, money, num, optDate, optStr, round2, str } from "@/lib/utils";

export const metadata = { title: "Fixed assets" };

async function addAsset(fd: FormData) {
  "use server";
  const ctx = await requireWrite("accounting");
  const currency = str(fd.get("currency")) || ctx.org.baseCurrency;
  const cur = await db.currency.findUniqueOrThrow({ where: { orgId_code: { orgId: ctx.orgId, code: currency } } });
  await db.$transaction((tx) =>
    recordAsset(tx, {
      orgId: ctx.orgId,
      branchId: str(fd.get("branchId")) || ctx.workingBranchId,
      name: str(fd.get("name")),
      category: str(fd.get("category")),
      serialNo: optStr(fd.get("serialNo")),
      supplier: optStr(fd.get("supplier")),
      purchaseDate: optDate(fd.get("purchaseDate")) ?? new Date(),
      cost: round2(num(fd.get("cost"))),
      currency,
      exchangeRate: cur.rate,
      usefulLifeYears: num(fd.get("usefulLifeYears"), 5),
      residualValue: round2(num(fd.get("residualValue"))),
      paymentMethod: str(fd.get("paymentMethod")) || "BANK_TRANSFER",
    }),
  );
  revalidatePath("/app/assets");
}

async function depreciate(fd: FormData) {
  "use server";
  const ctx = await requireWrite("accounting");
  const month = str(fd.get("month"));
  const d = month ? new Date(month + "-01T00:00:00") : new Date();
  await db.$transaction((tx) => runDepreciation(tx, ctx.orgId, d));
  revalidatePath("/app/assets");
}

export default async function AssetsPage() {
  const ctx = await getContext();
  const [assets, depLines, currencies] = await Promise.all([
    db.asset.findMany({ where: { orgId: ctx.orgId }, include: { branch: true }, orderBy: { purchaseDate: "desc" } }),
    db.journalLine.groupBy({ by: ["entryId"], where: { entry: { orgId: ctx.orgId, source: "DEPRECIATION" }, credit: { gt: 0 } }, _sum: { credit: true } }),
    db.currency.findMany({ where: { orgId: ctx.orgId, active: true }, orderBy: { isBase: "desc" } }),
  ]);
  // accumulated depreciation per asset
  const entries = await db.journalEntry.findMany({ where: { orgId: ctx.orgId, source: "DEPRECIATION" }, select: { id: true, sourceId: true } });
  const entryAsset = new Map(entries.map((e) => [e.id, e.sourceId]));
  const accum = new Map<string, number>();
  for (const l of depLines) {
    const a = entryAsset.get(l.entryId);
    if (a) accum.set(a, (accum.get(a) ?? 0) + (l._sum.credit ?? 0));
  }
  const totalCost = round2(assets.reduce((s, a) => s + a.baseCost, 0));
  const totalDep = round2([...accum.values()].reduce((s, v) => s + v, 0));
  const now = new Date();

  return (
    <>
      <PageHeader title="Fixed assets" subtitle="Equipment register with straight-line depreciation" />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Cost" value={money(totalCost, ctx.org.baseCurrency)} hint={`${assets.length} assets`} />
        <StatCard label="Accumulated depreciation" value={money(totalDep, ctx.org.baseCurrency)} accent="amber" />
        <StatCard label="Net book value" value={money(totalCost - totalDep, ctx.org.baseCurrency)} accent="green" />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <Table>
              <thead><tr><th>Asset</th><th>Category</th><th>Purchased</th><th className="num">Cost</th><th className="num">Life</th><th className="num">Accum. dep.</th><th className="num">NBV</th></tr></thead>
              <tbody>
                {assets.map((a) => {
                  const dep = round2(accum.get(a.id) ?? 0);
                  return (
                    <tr key={a.id}>
                      <td className="font-semibold">{a.name}<span className="block text-xs font-normal text-slate-400">{a.assetNo}{a.serialNo ? ` · S/N ${a.serialNo}` : ""} · {a.branch.name}</span></td>
                      <td className="text-sm">{labelOf(ASSET_CATEGORIES, a.category)}</td>
                      <td>{fmtDate(a.purchaseDate)}</td>
                      <td className="num">{money(a.baseCost)}</td>
                      <td className="num">{a.usefulLifeYears} yrs</td>
                      <td className="num text-amber-700">{money(dep)}</td>
                      <td className="num font-semibold">{money(a.baseCost - dep)}</td>
                    </tr>
                  );
                })}
                {!assets.length && <tr><td colSpan={7} className="py-10 text-center text-slate-400">No assets yet. Add equipment like the auto-refractor, slit lamp, edger and furniture.</td></tr>}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Run depreciation" subtitle="Posts straight-line depreciation for every asset up to the end of the chosen month. Months already posted are skipped." />
            <form action={depreciate} className="flex flex-wrap items-end gap-3 p-5">
              <Field label="Up to month"><Input type="month" name="month" defaultValue={`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`} /></Field>
              <SubmitButton pendingText="Posting…">Post depreciation</SubmitButton>
            </form>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title="Add an asset" />
          <form action={addAsset} className="space-y-3 p-5">
            <Field label="Asset name *"><Input name="name" required placeholder="Auto-refractor keratometer" /></Field>
            <Field label="Category"><Select name="category" options={ASSET_CATEGORIES} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Serial no."><Input name="serialNo" /></Field>
              <Field label="Supplier"><Input name="supplier" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cost *"><Input name="cost" type="number" step="0.01" required /></Field>
              <Field label="Currency"><Select name="currency" options={currencies.map((c) => ({ value: c.code, label: c.code }))} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Purchase date"><Input name="purchaseDate" type="date" defaultValue={isoDate(new Date())} /></Field>
              <Field label="Useful life (yrs)"><Input name="usefulLifeYears" type="number" step="0.5" defaultValue={5} /></Field>
            </div>
            <Field label={`Residual value (${ctx.org.baseCurrency})`}><Input name="residualValue" type="number" step="0.01" defaultValue={0} /></Field>
            <Field label="Paid via">
              <Select name="paymentMethod" defaultValue="BANK_TRANSFER" options={[...PAYMENT_METHODS, { value: "CREDIT", label: "Supplier credit", account: "" }, { value: "LOAN", label: "Loan / finance", account: "" }, { value: "CAPITAL", label: "Owner contribution", account: "" }]} />
            </Field>
            {ctx.branches.length > 1 && <Field label="Branch"><Select name="branchId" defaultValue={ctx.workingBranchId} options={ctx.branches.map((b) => ({ value: b.id, label: b.name }))} /></Field>}
            <SubmitButton className="w-full">Add asset</SubmitButton>
          </form>
        </Card>
      </div>
      <div className="mt-6"><Alert>Tip: capitalise equipment such as the phoropter, slit lamp, tonometer, lensmeter and edger here. Record small items and repairs under Expenses instead.</Alert></div>
    </>
  );
}
