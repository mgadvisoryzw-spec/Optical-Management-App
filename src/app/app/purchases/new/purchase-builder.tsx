"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { LENS_COATINGS, LENS_INDEXES, LENS_TYPES, PAYMENT_METHODS, PRODUCT_CATEGORIES } from "@/lib/constants";

type Product = { id: string; name: string; sku: string; category: string; costPrice: number };
type NewItem = { brand: string; model: string; colour: string; reference: string; frameSize: string; material: string; lensType: string; lensIndex: string; coating: string; name: string; sellPrice: number };
/** item: "" = not chosen yet, "__new" = new stock item, "__nonstock" = expensed line, otherwise a product id */
type Line = { key: number; category: string; item: string; description: string; quantity: number; unitCost: number; newItem: NewItem };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const emptyNew = (): NewItem => ({ brand: "", model: "", colour: "", reference: "", frameSize: "", material: "", lensType: "SINGLE_VISION", lensIndex: "1.56", coating: "Hard coat", name: "", sellPrice: 0 });
const blankLine = (key: number, category = "FRAME"): Line => ({ key, category, item: "", description: "", quantity: 1, unitCost: 0, newItem: emptyNew() });

function F({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

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
  const [supplier, setSupplier] = useState(suppliers.length ? "" : "__new");
  const [seq, setSeq] = useState(2);
  // start new lines on "New stock item" when the category has nothing in inventory yet
  const freshLine = (key: number, category = "FRAME"): Line => ({ ...blankLine(key, category), item: products.some((p) => p.category === category) ? "" : "__new" });
  const [lines, setLines] = useState<Line[]>([freshLine(1)]);
  const total = r2(lines.reduce((s, l) => s + l.quantity * l.unitCost, 0));

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const updateNew = (key: number, patch: Partial<NewItem>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, newItem: { ...l.newItem, ...patch } } : l)));

  function pickCategory(l: Line, category: string) {
    const hasStock = products.some((p) => p.category === category);
    // With no stock items in this category yet, go straight to creating one (consumables are usually expensed)
    update(l.key, { category, item: category === "CONSUMABLE" ? "__nonstock" : hasStock ? "" : "__new", description: "", unitCost: 0 });
  }

  function pickItem(l: Line, value: string) {
    const p = products.find((x) => x.id === value);
    if (p) update(l.key, { item: value, description: p.name, unitCost: r2(p.costPrice * rate) });
    else update(l.key, { item: value, description: "" });
  }

  const payload = lines
    .filter((l) => l.item && l.quantity > 0)
    .map((l) => ({
      productId: l.item.startsWith("__") ? null : l.item,
      category: l.category,
      description: l.description,
      quantity: l.quantity,
      unitCost: l.unitCost,
      newItem: l.item === "__new" ? { ...l.newItem, sellPrice: l.newItem.sellPrice } : null,
    }));

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="items" value={JSON.stringify(payload)} />
      <input type="hidden" name="exchangeRate" value={rate} />

      <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-4">
        <F label="Supplier">
          <select name="supplierId" value={supplier} onChange={(e) => setSupplier(e.target.value)} className="input">
            <option value="">— None —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="__new">+ New supplier…</option>
          </select>
        </F>
        {supplier === "__new" ? (
          <F label="New supplier name">
            <input name="newSupplierName" className="input" placeholder="e.g. Eyewear Distributors" />
            <span className="mt-1 flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" name="newSupplierIsLab" className="accent-brand-600" /> This is a lens lab</span>
          </F>
        ) : (
          <F label="Supplier invoice no."><input name="supplierInvoiceNo" className="input" /></F>
        )}
        {supplier === "__new" && <F label="Supplier invoice no."><input name="supplierInvoiceNo" className="input" /></F>}
        <F label="Date"><input type="date" name="date" defaultValue={today} className="input" /></F>
        <F label="Receive into branch">
          <select name="branchId" defaultValue={defaultBranch} className="input">
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </F>
        <F label="Currency">
          <select
            name="currency"
            value={currency}
            onChange={(e) => {
              const newRate = currencies.find((c) => c.code === e.target.value)?.rate ?? 1;
              setLines((ls) => ls.map((l) => ({ ...l, unitCost: r2((l.unitCost * newRate) / rate) })));
              setCurrency(e.target.value);
              setRate(newRate);
            }}
            className="input"
          >
            {currencies.map((c) => <option key={c.code}>{c.code}</option>)}
          </select>
        </F>
        <F label={`Rate per ${baseCurrency}`}><input type="number" step="0.0001" value={rate} onChange={(e) => setRate(Number(e.target.value) || 1)} disabled={currency === baseCurrency} className="input" /></F>
        <F label="Payment">
          <select name="paid" value={paid} onChange={(e) => setPaid(e.target.value)} className="input">
            <option value="yes">Paid now</option>
            <option value="no">On account (pay later)</option>
          </select>
        </F>
        {paid === "yes" && (
          <F label="Paid via">
            <select name="paymentMethod" defaultValue="BANK_TRANSFER" className="input">
              {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </F>
        )}
      </div>

      <div className="space-y-4">
        {lines.map((l, idx) => {
          const catProducts = products.filter((p) => p.category === l.category);
          const n = l.newItem;
          return (
            <div key={l.key} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Item {idx + 1}</p>
                {lines.length > 1 && (
                  <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-rose-600">
                    <Trash2 size={14} /> Remove
                  </button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-12">
                <F label="Type" className="sm:col-span-3">
                  <select className="input" value={l.category} onChange={(e) => pickCategory(l, e.target.value)}>
                    {PRODUCT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </F>
                <F label="Inventory item" className="sm:col-span-5">
                  <select className="input" value={l.item} onChange={(e) => pickItem(l, e.target.value)}>
                    <option value="" disabled>{catProducts.length ? "Select an item…" : "No items yet – choose an option below"}</option>
                    <option value="__new">+ New stock item (add to inventory)</option>
                    {catProducts.length > 0 && (
                      <optgroup label="Existing stock items">
                        {catProducts.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                      </optgroup>
                    )}
                    <option value="__nonstock">Not kept in stock (expense it)</option>
                  </select>
                </F>
                <F label="Qty" className="sm:col-span-1">
                  <input className="input text-right" type="number" min="1" step="1" value={l.quantity} onChange={(e) => update(l.key, { quantity: Number(e.target.value) })} />
                </F>
                <F label={`Unit cost (${currency})`} className="sm:col-span-2">
                  <input className="input text-right" type="number" min="0" step="0.01" value={l.unitCost} onChange={(e) => update(l.key, { unitCost: Number(e.target.value) })} />
                </F>
                <div className="sm:col-span-1">
                  <span className="label">Total</span>
                  <p className="py-2 text-right text-sm font-semibold tabular-nums">{(l.quantity * l.unitCost).toFixed(2)}</p>
                </div>
              </div>

              {l.item === "__nonstock" && (
                <F label="Description" className="mt-4 block">
                  <input className="input" value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} placeholder="e.g. Progressive lenses for ORD-000123, cleaning cloths…" />
                </F>
              )}

              {l.item === "__new" && (
                <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-800">New {PRODUCT_CATEGORIES.find((c) => c.value === l.category)?.label.toLowerCase()} item. It will be added to your inventory.</p>
                  <div className="grid gap-3 sm:grid-cols-6">
                    {l.category === "FRAME" && (
                      <>
                        <F label="Brand *" className="sm:col-span-2"><input className="input" value={n.brand} onChange={(e) => updateNew(l.key, { brand: e.target.value })} placeholder="Ray-Ban" /></F>
                        <F label="Frame name / model *" className="sm:col-span-2"><input className="input" value={n.model} onChange={(e) => updateNew(l.key, { model: e.target.value })} placeholder="RB5154 Clubmaster" /></F>
                        <F label="Colour *" className="sm:col-span-2"><input className="input" value={n.colour} onChange={(e) => updateNew(l.key, { colour: e.target.value })} placeholder="Black / Gold" /></F>
                        <F label="Reference on frame" className="sm:col-span-2"><input className="input" value={n.reference} onChange={(e) => updateNew(l.key, { reference: e.target.value })} placeholder="2000" /></F>
                        <F label="Size (eye-bridge-temple)" className="sm:col-span-2"><input className="input" value={n.frameSize} onChange={(e) => updateNew(l.key, { frameSize: e.target.value })} placeholder="51-21-145" /></F>
                        <F label="Material" className="sm:col-span-2">
                          <select className="input" value={n.material} onChange={(e) => updateNew(l.key, { material: e.target.value })}>
                            <option value="">—</option>
                            {["Acetate", "Metal", "Titanium", "TR90", "Stainless steel", "Mixed", "Rimless"].map((m) => <option key={m}>{m}</option>)}
                          </select>
                        </F>
                      </>
                    )}
                    {l.category === "LENS" && (
                      <>
                        <F label="Lens type *" className="sm:col-span-2">
                          <select className="input" value={n.lensType} onChange={(e) => updateNew(l.key, { lensType: e.target.value })}>
                            {LENS_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </F>
                        <F label="Index" className="sm:col-span-2">
                          <select className="input" value={n.lensIndex} onChange={(e) => updateNew(l.key, { lensIndex: e.target.value })}>
                            {LENS_INDEXES.map((i) => <option key={i}>{i}</option>)}
                          </select>
                        </F>
                        <F label="Coating" className="sm:col-span-2">
                          <select className="input" value={n.coating} onChange={(e) => updateNew(l.key, { coating: e.target.value })}>
                            {LENS_COATINGS.map((c) => <option key={c}>{c}</option>)}
                          </select>
                        </F>
                        <F label="Brand / range (optional)" className="sm:col-span-3"><input className="input" value={n.brand} onChange={(e) => updateNew(l.key, { brand: e.target.value })} placeholder="Essilor, Hoya, stock lens…" /></F>
                      </>
                    )}
                    {!["FRAME", "LENS"].includes(l.category) && (
                      <>
                        <F label="Brand" className="sm:col-span-2"><input className="input" value={n.brand} onChange={(e) => updateNew(l.key, { brand: e.target.value })} /></F>
                        <F label="Item name *" className="sm:col-span-4"><input className="input" value={n.model} onChange={(e) => updateNew(l.key, { model: e.target.value })} placeholder={l.category === "ACCESSORY" ? "Hard spectacle case" : l.category === "CONTACT_LENS" ? "Acuvue Oasys 6-pack" : "Lens cleaning cloths"} /></F>
                      </>
                    )}
                    <F label={`Selling price (${baseCurrency})`} className="sm:col-span-2">
                      <input className="input" type="number" min="0" step="0.01" value={n.sellPrice} onChange={(e) => updateNew(l.key, { sellPrice: Number(e.target.value) })} />
                    </F>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <button type="button" onClick={() => { setLines((ls) => [...ls, freshLine(seq, ls[ls.length - 1]?.category)]); setSeq(seq + 1); }} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-brand-700 hover:border-brand-400">
          <Plus size={15} /> Add another item
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5">
        <label className="min-w-72 flex-1"><span className="label">Notes</span><textarea name="notes" rows={2} className="input" /></label>
        <div className="text-right">
          <p className="text-xs text-slate-500">Purchase total</p>
          <p className="text-2xl font-bold tabular-nums">{currency} {total.toFixed(2)}</p>
        </div>
      </div>
      <p className="text-xs text-slate-500">Stock items are added to your stock, and their average cost is updated. Items not kept in stock, such as lenses glazed for one patient's job or consumables, are recorded straight to cost of sales or consumables expense.</p>
      <SubmitButton disabled={!payload.length}>Save purchase</SubmitButton>
    </form>
  );
}
