"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { PAYMENT_METHODS, PRODUCT_CATEGORIES } from "@/lib/constants";

type Product = { id: string; name: string; sku: string; category: string; costPrice: number };
type Line = { key: number; productId: string; category: string; description: string; quantity: number; unitCost: number };
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function PurchaseBuilder({
  action,
  products,
  suppliers,
  currencies,
  branches,
  defaultBranch,
  baseCurrency,
  today,
}: {
  action: (fd: FormData) => Promise<void>;
  products: Product[];
  suppliers: { id: string; name: string }[];
  currencies: { code: string; rate: number }[];
  branches: { id: string; name: string }[];
  defaultBranch: string;
  baseCurrency: string;
  today: string;
}) {
  const [currency, setCurrency] = useState(baseCurrency);
  const [rate, setRate] = useState(1);
  const [paid, setPaid] = useState("yes");
  const [seq, setSeq] = useState(2);
  const [lines, setLines] = useState<Line[]>([{ key: 1, productId: "", category: "FRAME", description: "", quantity: 1, unitCost: 0 }]);
  const total = r2(lines.reduce((s, l) => s + l.quantity * l.unitCost, 0));

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="items" value={JSON.stringify(lines.map(({ key: _k, ...l }) => ({ ...l, productId: l.productId || null })))} />
      <input type="hidden" name="exchangeRate" value={rate} />
      <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-4">
        <label><span className="label">Supplier</span>
          <select name="supplierId" className="input">
            <option value="">—</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label><span className="label">Supplier invoice no.</span><input name="supplierInvoiceNo" className="input" /></label>
        <label><span className="label">Date</span><input type="date" name="date" defaultValue={today} className="input" /></label>
        <label><span className="label">Receive into branch</span>
          <select name="branchId" defaultValue={defaultBranch} className="input">
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label><span className="label">Currency</span>
          <select name="currency" value={currency} onChange={(e) => { setCurrency(e.target.value); setRate(currencies.find((c) => c.code === e.target.value)?.rate ?? 1); }} className="input">
            {currencies.map((c) => <option key={c.code}>{c.code}</option>)}
          </select>
        </label>
        <label><span className="label">Rate per {baseCurrency}</span><input type="number" step="0.0001" value={rate} onChange={(e) => setRate(Number(e.target.value) || 1)} disabled={currency === baseCurrency} className="input" /></label>
        <label><span className="label">Payment</span>
          <select name="paid" value={paid} onChange={(e) => setPaid(e.target.value)} className="input">
            <option value="yes">Paid now</option>
            <option value="no">On account (pay later)</option>
          </select>
        </label>
        {paid === "yes" && (
          <label><span className="label">Paid via</span>
            <select name="paymentMethod" defaultValue="BANK_TRANSFER" className="input">
              {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="table-base">
          <thead><tr><th className="w-72">Inventory item</th><th className="w-44">Category</th><th>Description</th><th className="w-24">Qty</th><th className="w-32 text-right">Unit cost</th><th className="w-28 text-right">Total</th><th className="w-10" /></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key}>
                <td>
                  <select
                    className="input"
                    value={l.productId}
                    onChange={(e) => {
                      const p = products.find((x) => x.id === e.target.value);
                      update(l.key, p ? { productId: p.id, category: p.category, description: p.name, unitCost: r2(p.costPrice * rate) } : { productId: "" });
                    }}
                  >
                    <option value="">Non-stock line</option>
                    {PRODUCT_CATEGORIES.map((c) => (
                      <optgroup key={c.value} label={c.label}>
                        {products.filter((p) => p.category === c.value).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                      </optgroup>
                    ))}
                  </select>
                </td>
                <td>
                  <select className="input" value={l.category} disabled={!!l.productId} onChange={(e) => update(l.key, { category: e.target.value })}>
                    {PRODUCT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </td>
                <td><input className="input" value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} placeholder="e.g. Progressive lenses for ORD-000123" /></td>
                <td><input className="input text-right" type="number" min="0" step="1" value={l.quantity} onChange={(e) => update(l.key, { quantity: Number(e.target.value) })} /></td>
                <td><input className="input text-right" type="number" min="0" step="0.01" value={l.unitCost} onChange={(e) => update(l.key, { unitCost: Number(e.target.value) })} /></td>
                <td className="num font-semibold">{(l.quantity * l.unitCost).toFixed(2)}</td>
                <td><button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="text-slate-400 hover:text-rose-600"><Trash2 size={16} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-slate-100 p-4">
          <button type="button" onClick={() => { setLines((ls) => [...ls, { key: seq, productId: "", category: "FRAME", description: "", quantity: 1, unitCost: 0 }]); setSeq(seq + 1); }} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700"><Plus size={15} /> Add line</button>
          <p className="text-lg font-bold">Total {currency} {total.toFixed(2)}</p>
        </div>
      </div>
      <p className="text-xs text-slate-500">Items you track in stock are added to stock and inventory. Their average cost is updated too. Non-stock lines, such as lenses glazed for a particular job or consumables, go straight to cost of sales or consumables expense.</p>
      <label className="block"><span className="label">Notes</span><textarea name="notes" rows={2} className="input" /></label>
      <SubmitButton>Save purchase</SubmitButton>
    </form>
  );
}
