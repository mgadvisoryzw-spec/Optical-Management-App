import Link from "next/link";
import { FileSpreadsheet, FileText, FileDown } from "lucide-react";
import type { Statement } from "@/lib/statements";
import { Card, CardHeader } from "./ui";
import { cn } from "@/lib/utils";

const fmt = (n: number, money?: boolean) =>
  money ? (n < 0 ? "(" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (n < 0 ? ")" : "") : n.toLocaleString("en-US");

/** PDF / Excel / CSV download buttons for a statement. */
export function StatementDownloads({ kind, from, to }: { kind: string; from?: string; to: string }) {
  const q = (format: string) => `/api/statements/${kind}?format=${format}${from ? `&from=${from}` : ""}&to=${to}`;
  const cls = "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50";
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Download</span>
      <a href={q("pdf")} className={cls}><FileText size={14} className="text-rose-600" /> PDF</a>
      <a href={q("xlsx")} className={cls}><FileSpreadsheet size={14} className="text-emerald-600" /> Excel</a>
      <a href={q("csv")} className={cls}><FileDown size={14} className="text-slate-500" /> CSV</a>
    </div>
  );
}

/** Renders a statement on screen, with account lines linking to their ledger. */
export function StatementView({ statement: s, className, action }: { statement: Statement; className?: string; action?: React.ReactNode }) {
  const hasHead = s.columns.some((c) => c.label);
  return (
    <Card className={cn("print-area overflow-hidden", className)}>
      <CardHeader title={s.title} subtitle={s.subtitle} action={action} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {hasHead && (
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {s.columns.map((c, i) => (
                  <th key={i} className={cn("px-4 py-2.5", c.align === "right" ? "text-right" : "text-left")}>{c.label}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {s.rows.map((r, ri) => (
              <tr
                key={ri}
                className={cn(
                  r.style === "heading" && "text-xs font-bold uppercase tracking-wider text-brand-700",
                  r.style === "subtotal" && "border-t border-slate-200 bg-slate-50 font-semibold",
                  r.style === "total" && "border-y-2 border-slate-800 bg-brand-50/60 text-base font-bold",
                  r.style === "note" && "italic text-slate-400",
                  r.style === "line" && "border-b border-slate-100",
                )}
              >
                {r.cells.map((c, i) => {
                  const col = s.columns[i];
                  const isNum = typeof c === "number";
                  const content = c === null ? "" : isNum ? fmt(c, col?.money) : c;
                  return (
                    <td key={i} className={cn("px-4 py-2", r.style === "heading" && "pt-5", (col?.align === "right" || isNum) && "text-right tabular-nums", isNum && c < 0 && "text-rose-600", i === 0 && r.indent && "pl-9")}>
                      {i === 0 && r.code && r.style === "line" ? (
                        <Link href={`/app/accounting/ledger/${r.code}`} className="hover:text-brand-700">
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {s.notes?.length ? (
        <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          {s.notes.map((n) => <p key={n}>{n}</p>)}
        </div>
      ) : null}
    </Card>
  );
}
