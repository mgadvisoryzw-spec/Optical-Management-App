"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { PAYMENT_METHODS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { createCashSale } from "../actions";

type Product = { id: string; name: string; category: string; sellPrice: number; stock: number; detail: string };
type Line = { key: number; category: string; choice: string; productId: string | null; description: string; quantity: number; unitPrice: number };

/** What the patient can be paying for. `value` is the revenue category used in the books. */
const PAY_FOR = [
  { value: "FRAME", label: "Frame" },
  { value: "LENS", label: "Lenses" },
  { value: "REPAIR", label: "Frame repair" },
  { value: "ACCESSORY", label: "Case / accessory" },
  { value: "CONTACT_LENS", label: "Contact lenses" },
  { value: "CONSULTATION", label: "Eye test / consultation" },
  { value: "OTHER", label: "Other" },
];

const REPAIRS = [
  { name: "Replace nose pads", price: 5 },
  { name: "Replace / tighten screws", price: 5 },
  { name: "Adjustment & realignment", price: 5 },
  { name: "Replace temple (arm)", price: 20 },
  { name: "Solder / weld broken frame", price: 25 },
  { name: "Replace hinge", price: 15 },
  { name: "Re-fit lenses into frame", price: 10 },
];

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CashSaleForm({
  patients,
  products,
  currencies,
  baseCurrency,
  vatRate,
  consultationFee,
  defaultPatientId,
  today,
}: {
  patients: { id: string; label: string }[];
  products: Product[];
  currencies: { code: string; rate: number }[];
  baseCurrency: string;
  vatRate: number;
  consultationFee: number;
  defaultPatientId?: string;
  today: string;
}) {
  const [state, action] = useActionState(createCashSale, undefined);
  const [walkIn, setWalkIn] = useState(!defaultPatientId);
  const [patientFilter, setPatientFilter] = useState("");
  const [currency, setCurrency] = useState(baseCurrency);
  const [rate, setRate] = useState(1);
  const [discount, setDiscount] = useState(0);
  const [lines, setLines] = useState<Line[]>([{ key: 1, category: "", choice: "", productId: null, description: "", quantity: 1, unitPrice: 0 }]);
  const [seq, setSeq] = useState(2);

  const subtotal = r2(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
  const tax = r2((Math.max(0, subtotal - discount) * vatRate) / 100);
  const total = r2(Math.max(0, subtotal - discount) + tax);

  const shownPatients = useMemo(() => {
    const f = patientFilter.toLowerCase();
    return (f ? patients.filter((p) => p.label.toLowerCase().includes(f)) : patients).slice(0, 300);
  }, [patients, patientFilter]);

  /** Options for the second dropdown, depending on what is being paid for. */
  function choicesFor(category: string): { value: string; label: string; price: number; productId?: string; description: string }[] {
    if (["FRAME", "LENS", "ACCESSORY", "CONTACT_LENS"].includes(category)) {
      const list = products
        .filter((p) => p.category === category)
        .map((p) => ({ value: p.id, productId: p.id, price: p.sellPrice, description: p.name, label: `${p.name}${p.detail ? ` · ${p.detail}` : ""} (${p.stock} in stock)` }));
      const other = category === "LENS" ? "Lab lenses (type description)" : "Other item (type description)";
      return [...list, { value: "custom", label: other, price: 0, description: "" }];
    }
    if (category === "REPAIR") return [...REPAIRS.map((r) => ({ value: r.name, label: r.name, price: r.price, description: `Frame repair: ${r.name}` })), { value: "custom", label: "Other repair (type description)", price: 0, description: "Frame repair: " }];
    if (category === "CONSULTATION")
      return [
        { value: "exam", label: "Comprehensive eye test", price: consultationFee, description: "Comprehensive eye examination" },
        { value: "cl", label: "Contact lens fitting", price: consultationFee, description: "Contact lens fitting" },
        { value: "driver", label: "Driver's licence eye test", price: consultationFee, description: "Driver's licence vision test" },
      ];
    return [{ value: "custom", label: "Type a description", price: 0, description: "" }];
  }

  function update(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function pickCategory(key: number, category: string) {
    const first = choicesFor(category);
    // single-option categories (e.g. Other) are selected immediately
    if (first.length === 1) update(key, { category, choice: first[0].value, productId: null, description: first[0].description, unitPrice: r2(first[0].price * rate) });
    else update(key, { category, choice: "", productId: null, description: "", unitPrice: 0 });
  }

  function pickChoice(key: number, category: string, value: string) {
    const c = choicesFor(category).find((x) => x.value === value);
    if (!c) return update(key, { choice: "", productId: null, description: "", unitPrice: 0 });
    update(key, { choice: value, productId: c.productId ?? null, description: c.description, unitPrice: r2(c.price * rate) });
  }

  function changeCurrency(code: string) {
    const newRate = currencies.find((c) => c.code === code)?.rate ?? 1;
    const factor = newRate / rate;
    setLines((ls) => ls.map((l) => ({ ...l, unitPrice: r2(l.unitPrice * factor) })));
    setDiscount((d) => r2(d * factor));
    setCurrency(code);
    setRate(newRate);
  }

  const items = lines.filter((l) => l.category && l.description).map((l) => ({ productId: l.productId, category: l.category, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice }));

  return (
    <form action={action} className="grid gap-6 xl:grid-cols-3">
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <input type="hidden" name="exchangeRate" value={rate} />
      <input type="hidden" name="taxRate" value={vatRate} />

      <div className="space-y-6 xl:col-span-2">
        {/* Who is paying */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex gap-2">
            {[
              [true, "Walk-in customer"],
              [false, "Registered patient"],
            ].map(([v, l]) => (
              <button key={String(v)} type="button" onClick={() => setWalkIn(v as boolean)} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", walkIn === v ? "bg-ink-900 text-white" : "bg-slate-100 text-slate-600")}>
                {l as string}
              </button>
            ))}
          </div>
          {walkIn ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className="label">Customer name *</span><input name="walkInName" className="input" placeholder="e.g. Tendai Moyo" /></label>
              <label><span className="label">Mobile number</span><input name="walkInPhone" className="input" placeholder="077 123 4567" /></label>
              <p className="text-xs text-slate-400 sm:col-span-2">A patient record is created so this customer can be found and sent reminders later.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className="label">Search</span><input value={patientFilter} onChange={(e) => setPatientFilter(e.target.value)} className="input" placeholder="Name, phone or patient no." /></label>
              <label><span className="label">Patient *</span>
                <select name="patientId" defaultValue={defaultPatientId ?? ""} className="input">
                  <option value="">Select patient…</option>
                  {shownPatients.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </label>
            </div>
          )}
        </div>

        {/* What they are paying for */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="text-sm font-semibold">What is the patient paying for?</h3>
            <p className="text-xs text-slate-500">Choose the type of item, then the item. Prices fill in from your price list and can be changed.</p>
          </div>
          <table className="table-base">
            <thead>
              <tr><th className="w-44">Paying for</th><th>Item</th><th className="w-20">Qty</th><th className="w-32 text-right">Price ({currency})</th><th className="w-28 text-right">Total</th><th className="w-10" /></tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const choices = l.category ? choicesFor(l.category) : [];
                return (
                  <tr key={l.key}>
                    <td>
                      <select className="input" value={l.category} onChange={(e) => pickCategory(l.key, e.target.value)}>
                        <option value="">Select…</option>
                        {PAY_FOR.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </td>
                    <td className="space-y-2">
                      {l.category && choices.length > 1 && (
                        <select className="input" value={l.choice} onChange={(e) => pickChoice(l.key, l.category, e.target.value)}>
                          <option value="">Select…</option>
                          {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      )}
                      {l.choice === "custom" && <input className="input" value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} placeholder="Describe the item" />}
                    </td>
                    <td><input className="input text-right" type="number" min="1" step="1" value={l.quantity} onChange={(e) => update(l.key, { quantity: Number(e.target.value) })} /></td>
                    <td><input className="input text-right" type="number" min="0" step="0.01" value={l.unitPrice} onChange={(e) => update(l.key, { unitPrice: Number(e.target.value) })} /></td>
                    <td className="num font-semibold">{fmt(l.quantity * l.unitPrice)}</td>
                    <td>{lines.length > 1 && <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="text-slate-400 hover:text-rose-600" aria-label="Remove line"><Trash2 size={16} /></button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t border-slate-100 p-4">
            <button type="button" onClick={() => { setLines((ls) => [...ls, { key: seq, category: "", choice: "", productId: null, description: "", quantity: 1, unitPrice: 0 }]); setSeq(seq + 1); }} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
              <Plus size={15} /> Add another item
            </button>
          </div>
        </div>
      </div>

      {/* Payment */}
      <div>
        <div className="sticky top-20 space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid grid-cols-2 gap-3">
            <label><span className="label">Date</span><input type="date" name="date" defaultValue={today} className="input" /></label>
            <label><span className="label">Currency</span>
              <select name="currency" value={currency} onChange={(e) => changeCurrency(e.target.value)} className="input">
                {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}{c.code !== baseCurrency ? ` (${c.rate})` : ""}</option>)}
              </select>
            </label>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="font-semibold tabular-nums">{fmt(subtotal)}</dd></div>
            <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Discount</dt><dd><input name="discount" type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="input w-28 py-1 text-right" /></dd></div>
            {vatRate > 0 && <div className="flex justify-between"><dt className="text-slate-500">VAT {vatRate}%</dt><dd className="tabular-nums">{fmt(tax)}</dd></div>}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base"><dt className="font-bold">Amount paid</dt><dd className="font-bold tabular-nums">{currency} {fmt(total)}</dd></div>
          </dl>
          <label className="block"><span className="label">Payment method</span>
            <select name="method" defaultValue="CASH" className="input">
              {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Reference</span><input name="reference" className="input" placeholder="EcoCash ref, POS slip…" /></label>
          <label className="block"><span className="label">Notes</span><textarea name="notes" rows={2} className="input" /></label>
          {state?.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
          <SubmitButton className="w-full" disabled={!items.length || total <= 0}>Save & print receipt</SubmitButton>
          <p className="text-xs text-slate-400">The sale is recorded under the right income category (frames, lenses, repairs…) and stock items are taken out of stock.</p>
        </div>
      </div>
    </form>
  );
}
