"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/client";

type L = { key: number; account: string; debit: number; credit: number; memo: string };

export function JournalForm({ action, accounts, today }: { action: (fd: FormData) => Promise<void>; accounts: { code: string; name: string }[]; today: string }) {
  const [lines, setLines] = useState<L[]>([
    { key: 1, account: "", debit: 0, credit: 0, memo: "" },
    { key: 2, account: "", debit: 0, credit: 0, memo: "" },
  ]);
  const [seq, setSeq] = useState(3);
  const dr = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const cr = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const balanced = Math.abs(dr - cr) < 0.005 && dr > 0 && lines.every((l) => !(l.debit || l.credit) || l.account);
  const up = (k: number, p: Partial<L>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...p } : l)));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="lines" value={JSON.stringify(lines.filter((l) => l.account && (l.debit || l.credit)).map(({ key: _k, ...l }) => l))} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label><span className="label">Date</span><input type="date" name="date" defaultValue={today} className="input" /></label>
        <label className="sm:col-span-2"><span className="label">Narration *</span><input name="memo" required className="input" placeholder="e.g. Owner capital introduced; opening balances" /></label>
      </div>
      <table className="table-base">
        <thead><tr><th>Account</th><th>Line memo</th><th className="w-32 text-right">Debit</th><th className="w-32 text-right">Credit</th><th className="w-10" /></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key}>
              <td>
                <select className="input" value={l.account} onChange={(e) => up(l.key, { account: e.target.value })}>
                  <option value="">Select account…</option>
                  {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
                </select>
              </td>
              <td><input className="input" value={l.memo} onChange={(e) => up(l.key, { memo: e.target.value })} /></td>
              <td><input className="input text-right" type="number" step="0.01" min="0" value={l.debit || ""} onChange={(e) => up(l.key, { debit: Number(e.target.value), credit: 0 })} /></td>
              <td><input className="input text-right" type="number" step="0.01" min="0" value={l.credit || ""} onChange={(e) => up(l.key, { credit: Number(e.target.value), debit: 0 })} /></td>
              <td><button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="text-slate-400 hover:text-rose-600"><Trash2 size={16} /></button></td>
            </tr>
          ))}
          <tr>
            <td colSpan={2}><button type="button" onClick={() => { setLines((ls) => [...ls, { key: seq, account: "", debit: 0, credit: 0, memo: "" }]); setSeq(seq + 1); }} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700"><Plus size={14} /> Add line</button></td>
            <td className="num font-bold">{dr.toFixed(2)}</td>
            <td className="num font-bold">{cr.toFixed(2)}</td>
            <td />
          </tr>
        </tbody>
      </table>
      <div className="flex items-center gap-4">
        <SubmitButton disabled={!balanced}>Post journal</SubmitButton>
        <span className={balanced ? "text-sm text-emerald-600" : "text-sm text-amber-600"}>{balanced ? "Balanced ✓" : `Out of balance by ${Math.abs(dr - cr).toFixed(2)}`}</span>
      </div>
    </form>
  );
}
