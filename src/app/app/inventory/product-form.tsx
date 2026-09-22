"use client";

import { useState } from "react";
import type { Product } from "@prisma/client";
import { SubmitButton } from "@/components/client";
import { LENS_COATINGS, LENS_INDEXES, LENS_TYPES, PRODUCT_CATEGORIES } from "@/lib/constants";

function F({ label, children, className, hint }: { label: string; children: React.ReactNode; className?: string; hint?: string }) {
  return (
    <label className={className}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function ProductForm({
  action,
  product,
  suppliers,
  defaultCategory,
  baseCurrency,
}: {
  action: (fd: FormData) => Promise<void>;
  product?: Product | null;
  suppliers: { id: string; name: string }[];
  defaultCategory?: string;
  baseCurrency: string;
}) {
  const [cat, setCat] = useState(product?.category ?? defaultCategory ?? "FRAME");
  const [cost, setCost] = useState(product?.costPrice ?? 0);
  const [sell, setSell] = useState(product?.sellPrice ?? 0);
  const margin = sell > 0 ? Math.round(((sell - cost) / sell) * 100) : 0;
  const isNew = !product;

  return (
    <form action={action} className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="label">Category</p>
          <div className="flex flex-wrap gap-2">
            {PRODUCT_CATEGORIES.map((c) => (
              <label key={c.value} className={`cursor-pointer rounded-xl border px-4 py-2 text-sm font-semibold ${cat === c.value ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600"}`}>
                <input type="radio" name="category" value={c.value} checked={cat === c.value} onChange={() => setCat(c.value)} className="sr-only" />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-6">
          {cat === "FRAME" && (
            <>
              <F label="Brand *" className="sm:col-span-2"><input name="brand" required defaultValue={product?.brand ?? ""} className="input" placeholder="Ray-Ban" /></F>
              <F label="Model / frame name *" className="sm:col-span-2"><input name="model" required defaultValue={product?.model ?? ""} className="input" placeholder="RB5154 Clubmaster" /></F>
              <F label="Colour *" className="sm:col-span-2"><input name="colour" required defaultValue={product?.colour ?? ""} className="input" placeholder="Black / Gold" /></F>
              <F label="Reference (on the temple)" className="sm:col-span-2" hint="The colour/reference code printed on the frame"><input name="reference" defaultValue={product?.reference ?? ""} className="input" placeholder="2000" /></F>
              <F label="Size (eye-bridge-temple)" className="sm:col-span-2"><input name="frameSize" defaultValue={product?.frameSize ?? ""} className="input" placeholder="51-21-145" /></F>
              <F label="Material" className="sm:col-span-1">
                <select name="material" defaultValue={product?.material ?? ""} className="input">
                  <option value="">—</option>
                  {["Acetate", "Metal", "Titanium", "TR90", "Stainless steel", "Mixed", "Rimless"].map((m) => <option key={m}>{m}</option>)}
                </select>
              </F>
              <F label="Gender" className="sm:col-span-1">
                <select name="gender" defaultValue={product?.gender ?? ""} className="input">
                  <option value="">Unisex</option><option>Men</option><option>Women</option><option>Kids</option>
                </select>
              </F>
            </>
          )}
          {cat === "LENS" && (
            <>
              <F label="Lens type *" className="sm:col-span-2">
                <select name="lensType" required defaultValue={product?.lensType ?? "SINGLE_VISION"} className="input">
                  {LENS_TYPES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </F>
              <F label="Index" className="sm:col-span-2">
                <select name="lensIndex" defaultValue={product?.lensIndex ?? "1.56"} className="input">
                  {LENS_INDEXES.map((l) => <option key={l}>{l}</option>)}
                </select>
              </F>
              <F label="Coating / treatment" className="sm:col-span-2">
                <select name="coating" defaultValue={product?.coating ?? ""} className="input">
                  <option value="">—</option>
                  {LENS_COATINGS.map((l) => <option key={l}>{l}</option>)}
                </select>
              </F>
              <F label="Brand / range" className="sm:col-span-3"><input name="brand" defaultValue={product?.brand ?? ""} className="input" placeholder="Essilor Varilux, Hoya, stock lens…" /></F>
              <F label="Power range / notes" className="sm:col-span-3"><input name="model" defaultValue={product?.model ?? ""} className="input" placeholder="-6.00 to +4.00, cyl to -2.00" /></F>
            </>
          )}
          {(cat === "CONTACT_LENS" || cat === "ACCESSORY" || cat === "CONSUMABLE") && (
            <>
              <F label="Brand" className="sm:col-span-3"><input name="brand" defaultValue={product?.brand ?? ""} className="input" /></F>
              <F label="Product / model" className="sm:col-span-3"><input name="model" defaultValue={product?.model ?? ""} className="input" placeholder={cat === "CONTACT_LENS" ? "Acuvue Oasys 6-pack" : cat === "CONSUMABLE" ? "Lens cleaning cloths" : "Hard case"} /></F>
              {cat === "CONTACT_LENS" && <F label="Power / BC / DIA" className="sm:col-span-3"><input name="reference" defaultValue={product?.reference ?? ""} className="input" placeholder="-2.50 / 8.4 / 14.0" /></F>}
              <F label="Unit" className="sm:col-span-3"><input name="unit" defaultValue={product?.unit ?? "pcs"} className="input" placeholder="pcs, box, bottle" /></F>
            </>
          )}
          <F label="Display name" className="sm:col-span-4" hint="Leave blank to build it from the fields above"><input name="name" defaultValue={product?.name ?? ""} className="input" /></F>
          <F label="SKU / barcode" className="sm:col-span-2" hint={isNew ? "Leave blank to generate one" : undefined}><input name="sku" defaultValue={product?.sku ?? ""} className="input" disabled={!isNew} /></F>
        </div>
      </div>

      <div className="space-y-6">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid grid-cols-2 gap-3">
            <F label={`Cost (${baseCurrency})`}><input name="costPrice" type="number" step="0.01" min="0" value={cost} onChange={(e) => setCost(Number(e.target.value))} className="input" /></F>
            <F label={`Selling price (${baseCurrency})`}><input name="sellPrice" type="number" step="0.01" min="0" value={sell} onChange={(e) => setSell(Number(e.target.value))} className="input" /></F>
          </div>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm">Gross margin: <b className={margin < 30 ? "text-amber-600" : "text-emerald-600"}>{margin}%</b> · markup {cost > 0 ? `${((sell / cost) * 100 - 100).toFixed(0)}%` : "—"}</p>
          <F label="Supplier">
            <select name="supplierId" defaultValue={product?.supplierId ?? ""} className="input">
              <option value="">—</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Reorder level"><input name="reorderLevel" type="number" min="0" defaultValue={product?.reorderLevel ?? 2} className="input" /></F>
            {isNew && <F label="Opening stock"><input name="openingQty" type="number" min="0" defaultValue={0} className="input" /></F>}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="trackStock" defaultChecked={product?.trackStock ?? true} className="h-4 w-4 accent-brand-600" /> Track stock quantities</label>
          {!isNew && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={product?.active ?? true} className="h-4 w-4 accent-brand-600" /> Active (available for sale)</label>}
        </div>
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-5">
          <SubmitButton>{isNew ? "Save item" : "Save changes"}</SubmitButton>
          {isNew && <SubmitButton name="another" value="1" variant="secondary">Save & add another</SubmitButton>}
        </div>
      </div>
    </form>
  );
}
