"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Search } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { SALE_CATEGORIES, PAYMENT_METHODS } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Product = { id: string; sku: string; name: string; category: string; sellPrice: number; stock: number; detail: string };
type Line = { key: number; productId: string | null; category: string; description: string; eye: string; quantity: number; unitPrice: number };
type Currency = { code: string; rate: number; isBase: boolean };

/** Existing order values when the builder is used to edit an order. */
export type OrderInitial = {
  lines: Omit<Line, "key">[];
  currency: string;
  rate: number;
  discount: number;
  taxRate: number;
  medicalAidId: string;
  medicalAidPortion: number;
  prescriptionId: string;
  labName: string;
  promisedDate: string;
  notes: string;
  lockCurrency: boolean;
  posted: boolean;
  cancelHref: string;
};

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function OrderBuilder({
  action,
  patientId,
  products,
  currencies,
  baseCurrency,
  vatRate,
  prescriptions,
  defaultRxId,
  medicalAid,
  aids,
  consultationFee,
  labs,
  initial,
}: {
  action: (fd: FormData) => Promise<void>;
  patientId: string;
  products: Product[];
  currencies: Currency[];
  baseCurrency: string;
  vatRate: number;
  prescriptions: { id: string; label: string }[];
  defaultRxId?: string;
  medicalAid: { id: string; name: string } | null;
  aids: { id: string; name: string }[];
  consultationFee: number;
  labs: string[];
  initial?: OrderInitial;
}) {
  const editing = !!initial;
  const [currency, setCurrency] = useState(initial?.currency ?? baseCurrency);
  const baseRate = currencies.find((c) => c.code === currency)?.rate ?? 1;
  const [rate, setRate] = useState(initial?.rate ?? baseRate);
  const [lines, setLines] = useState<Line[]>(initial ? initial.lines.map((l, i) => ({ ...l, key: i + 1 })) : []);
  const [filter, setFilter] = useState("");
  const [cat, setCat] = useState("FRAME");
  const [discount, setDiscount] = useState(initial?.discount ?? 0);
  const [taxRate, setTaxRate] = useState(initial?.taxRate ?? vatRate);
  const [aidId, setAidId] = useState(initial ? initial.medicalAidId : medicalAid?.id ?? "");
  const [aidPortion, setAidPortion] = useState(initial?.medicalAidPortion ?? 0);
  const [deposit, setDeposit] = useState(0);
  const [keySeq, setKeySeq] = useState((initial?.lines.length ?? 0) + 1);

  const subtotal = r2(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
  const tax = r2((Math.max(0, subtotal - discount) * taxRate) / 100);
  const total = r2(Math.max(0, subtotal - discount) + tax);
  const patientPortion = r2(total - (aidId ? Math.min(aidPortion, total) : 0));

  const visible = useMemo(() => {
    const f = filter.toLowerCase();
    return products.filter((p) => p.category === cat && (!f || `${p.name} ${p.sku} ${p.detail}`.toLowerCase().includes(f))).slice(0, 40);
  }, [products, filter, cat]);

  function changeCurrency(code: string) {
    const newRate = currencies.find((c) => c.code === code)?.rate ?? 1;
    // re-price lines so the value stays the same in base currency
    const factor = newRate / rate;
    setLines((ls) => ls.map((l) => ({ ...l, unitPrice: r2(l.unitPrice * factor) })));
    setDiscount((d) => r2(d * factor));
    setAidPortion((a) => r2(a * factor));
    setCurrency(code);
    setRate(newRate);
  }

  function add(line: Omit<Line, "key">) {
    setLines((ls) => [...ls, { ...line, key: keySeq }]);
    setKeySeq((k) => k + 1);
  }

  function addProduct(p: Product) {
    add({ productId: p.id, category: p.category === "ACCESSORY" ? "ACCESSORY" : p.category, description: `${p.name}${p.detail ? ` (${p.detail})` : ""}`, eye: p.category === "LENS" ? "OU" : "", quantity: 1, unitPrice: r2(p.sellPrice * rate) });
  }

  function update(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const items = lines.map(({ key: _k, ...l }) => l);

  return (
    <form action={action} className="grid gap-6 xl:grid-cols-3">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <input type="hidden" name="exchangeRate" value={rate} />
      {initial?.lockCurrency && <input type="hidden" name="currency" value={currency} />}

      <div className="space-y-6 xl:col-span-2">
        {/* Catalogue */}
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
            {[
              ["FRAME", "Frames"],
              ["LENS", "Lenses"],
              ["CONTACT_LENS", "Contact lenses"],
              ["ACCESSORY", "Accessories"],
            ].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setCat(v)} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", cat === v ? "bg-ink-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
                {l}
              </button>
            ))}
            <div className="relative ml-auto w-full sm:w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search brand, model, colour, ref…" className="input pl-9" />
            </div>
          </div>
          <div className="grid max-h-72 gap-2 overflow-y-auto p-4 sm:grid-cols-2">
            {visible.map((p) => (
              <button type="button" key={p.id} onClick={() => addProduct(p)} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-left transition hover:border-brand-400 hover:bg-brand-50/50">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{p.name}</span>
                  <span className="block truncate text-xs text-slate-500">{p.sku}{p.detail ? ` · ${p.detail}` : ""}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold tabular-nums">{fmt(p.sellPrice * rate)}</span>
                  <span className={cn("text-[11px] font-semibold", p.stock > 0 ? "text-emerald-600" : "text-rose-500")}>{p.stock} in stock</span>
                </span>
              </button>
            ))}
            {!visible.length && <p className="col-span-full py-6 text-center text-sm text-slate-400">No products match. Add items in Inventory, or use a custom line below.</p>}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 p-4">
            <button type="button" onClick={() => add({ productId: null, category: "CONSULTATION", description: "Comprehensive eye examination", eye: "", quantity: 1, unitPrice: r2(consultationFee * rate) })} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-400 hover:text-brand-700">
              <Plus size={14} /> Consultation
            </button>
            <button type="button" onClick={() => add({ productId: null, category: "REPAIR", description: "Frame repair", eye: "", quantity: 1, unitPrice: 0 })} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-400 hover:text-brand-700">
              <Plus size={14} /> Frame repair
            </button>
            <button type="button" onClick={() => add({ productId: null, category: "LENS", description: "Lenses (lab order)", eye: "OU", quantity: 1, unitPrice: 0 })} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-400 hover:text-brand-700">
              <Plus size={14} /> Lab lenses
            </button>
            <button type="button" onClick={() => add({ productId: null, category: "OTHER", description: "", eye: "", quantity: 1, unitPrice: 0 })} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-400 hover:text-brand-700">
              <Plus size={14} /> Custom line
            </button>
          </div>
        </div>

        {/* Lines */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="table-base">
            <thead>
              <tr>
                <th>Item</th>
                <th className="w-24">Qty</th>
                <th className="w-32 text-right">Unit ({currency})</th>
                <th className="w-28 text-right">Total</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} className="align-top">
                  <td>
                    <input className="input" value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} placeholder="Description" />
                    <div className="mt-2 flex gap-2">
                      <select className="input w-auto py-1 text-xs" value={l.category} onChange={(e) => update(l.key, { category: e.target.value })} disabled={!!l.productId} aria-label="Category">
                        {SALE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                      <select className="input w-auto py-1 text-xs" value={l.eye} onChange={(e) => update(l.key, { eye: e.target.value })} aria-label="Eye">
                        <option value="">Eye: n/a</option><option value="OU">Both eyes (OU)</option><option value="OD">Right (OD)</option><option value="OS">Left (OS)</option>
                      </select>
                    </div>
                  </td>
                  <td><input className="input text-right" type="number" min="0" step="1" value={l.quantity} onChange={(e) => update(l.key, { quantity: Number(e.target.value) })} /></td>
                  <td><input className="input text-right" type="number" min="0" step="0.01" value={l.unitPrice} onChange={(e) => update(l.key, { unitPrice: Number(e.target.value) })} /></td>
                  <td className="num pt-5 font-semibold">{fmt(l.quantity * l.unitPrice)}</td>
                  <td><button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="mt-2.5 text-slate-400 hover:text-rose-600" aria-label="Remove line"><Trash2 size={16} /></button></td>
                </tr>
              ))}
              {!lines.length && (
                <tr><td colSpan={5} className="py-10 text-center text-slate-400">Pick frames and lenses above, or add a consultation or repair.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-3">
          <label className="block"><span className="label">Prescription</span>
            <select name="prescriptionId" defaultValue={initial ? initial.prescriptionId : defaultRxId ?? prescriptions[0]?.id ?? ""} className="input">
              <option value="">None</option>
              {prescriptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Lab / glazing</span>
            <input name="labName" list="labs" defaultValue={initial?.labName} className="input" placeholder="In-house or lab name" />
            <datalist id="labs">{labs.map((l) => <option key={l} value={l} />)}</datalist>
          </label>
          <label className="block"><span className="label">Promised date</span>
            <input name="promisedDate" type="date" defaultValue={initial?.promisedDate} className="input" />
          </label>
          <label className="block sm:col-span-3"><span className="label">Notes / job instructions</span>
            <textarea name="notes" rows={2} defaultValue={initial?.notes} className="input" placeholder="Frame fitting notes, tint, special instructions…" />
          </label>
        </div>
      </div>

      {/* Summary */}
      <div className="space-y-6">
        <div className="sticky top-20 space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">Currency</span>
              <select name="currency" value={currency} onChange={(e) => changeCurrency(e.target.value)} disabled={initial?.lockCurrency} className="input">
                {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </label>
            <label className="block"><span className="label">Rate / {baseCurrency}</span>
              <input type="number" step="0.0001" value={rate} onChange={(e) => setRate(Number(e.target.value) || 1)} disabled={currency === baseCurrency || initial?.lockCurrency} className="input" />
            </label>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="font-semibold tabular-nums">{fmt(subtotal)}</dd></div>
            <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Discount</dt><dd><input name="discount" type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="input w-28 py-1 text-right" /></dd></div>
            <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">VAT %</dt><dd><input name="taxRate" type="number" min="0" step="0.1" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} className="input w-28 py-1 text-right" /></dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">VAT</dt><dd className="tabular-nums">{fmt(tax)}</dd></div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base"><dt className="font-bold">Total</dt><dd className="font-bold tabular-nums">{currency} {fmt(total)}</dd></div>
          </dl>

          <div className="space-y-3 rounded-xl bg-slate-50 p-3">
            <label className="block"><span className="label">Medical aid</span>
              <select name="medicalAidId" value={aidId} onChange={(e) => setAidId(e.target.value)} className="input">
                <option value="">Private / cash</option>
                {aids.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            {aidId && (
              <label className="block"><span className="label">Amount claimed from medical aid</span>
                <input name="medicalAidPortion" type="number" min="0" step="0.01" value={aidPortion} onChange={(e) => setAidPortion(Number(e.target.value))} className="input" />
              </label>
            )}
            <div className="flex justify-between text-sm"><span className="text-slate-500">Patient pays</span><span className="font-bold tabular-nums">{currency} {fmt(patientPortion)}</span></div>
          </div>

          {!editing && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">Deposit now</span>
              <input name="depositAmount" type="number" min="0" step="0.01" value={deposit} onChange={(e) => setDeposit(Number(e.target.value))} className="input" />
            </label>
            <label className="block"><span className="label">Method</span>
              <select name="depositMethod" className="input">
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
          </div>
          )}

          {editing ? (
            <div className="flex flex-col gap-2 pt-1">
              <SubmitButton disabled={!lines.length}>Save changes</SubmitButton>
              <a href={initial!.cancelHref} className="rounded-lg px-3.5 py-2 text-center text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</a>
              <p className="text-xs text-slate-400">
                {initial!.posted
                  ? "This order is already in your books. Saving reverses the original entries and stock movements and posts the corrected order on its original date. Payments already received stay on the order."
                  : "Payments already received stay on the order."}
                {initial!.lockCurrency && " The currency is locked because payments have been received."}
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2 pt-1">
                <SubmitButton name="status" value="ORDERED" disabled={!lines.length}>{aidId && aidPortion > 0 ? "Confirm & send for pre-auth" : "Confirm order"}</SubmitButton>
                <SubmitButton name="status" value="QUOTE" variant="secondary" disabled={!lines.length}>Save as quote</SubmitButton>
              </div>
              <p className="text-xs text-slate-400">Confirming an order records the sale in your books and takes the frames and lenses out of stock. Quotes don't affect stock or the books.</p>
            </>
          )}
        </div>
      </div>
    </form>
  );
}
