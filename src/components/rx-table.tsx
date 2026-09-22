import type { Prescription } from "@prisma/client";
import { dioptre } from "@/lib/utils";

export function RxTable({ rx, compact }: { rx: Prescription; compact?: boolean }) {
  const cell = compact ? "px-2 py-1.5" : "px-3 py-2";
  const rows = [
    { eye: "R (OD)", sph: rx.odSph, cyl: rx.odCyl, axis: rx.odAxis, add: rx.odAdd, prism: rx.odPrism, base: rx.odBase, va: rx.odVa },
    { eye: "L (OS)", sph: rx.osSph, cyl: rx.osCyl, axis: rx.osAxis, add: rx.osAdd, prism: rx.osPrism, base: rx.osBase, va: rx.osVa },
  ];
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm tabular-nums">
        <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            {["Eye", "SPH", "CYL", "Axis", "ADD", "Prism", "Base", "VA"].map((h) => (
              <th key={h} className={`${cell} text-center first:text-left`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.eye} className="border-t border-slate-100">
              <td className={`${cell} font-semibold text-slate-700`}>{r.eye}</td>
              <td className={`${cell} text-center font-semibold`}>{dioptre(r.sph)}</td>
              <td className={`${cell} text-center`}>{r.cyl === null || r.cyl === undefined ? "—" : dioptre(r.cyl).replace("Plano", "DS")}</td>
              <td className={`${cell} text-center`}>{r.axis ?? "—"}{r.axis !== null && r.axis !== undefined ? "°" : ""}</td>
              <td className={`${cell} text-center`}>{r.add ? dioptre(r.add) : "—"}</td>
              <td className={`${cell} text-center`}>{r.prism ?? "—"}</td>
              <td className={`${cell} text-center`}>{r.base ?? "—"}</td>
              <td className={`${cell} text-center`}>{r.va ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={`flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 bg-slate-50/50 ${cell} text-xs text-slate-600`}>
        <span>PD dist: <b>{rx.pdDistance ?? "—"}</b></span>
        <span>PD near: <b>{rx.pdNear ?? "—"}</b></span>
        {rx.segHeight && <span>Seg/fitting height: <b>{rx.segHeight}</b></span>}
        {(rx.iopOd || rx.iopOs) && <span>IOP R/L: <b>{rx.iopOd ?? "—"} / {rx.iopOs ?? "—"} mmHg</b></span>}
        {rx.rxType === "CONTACT_LENS" && <span>CL: <b>{[rx.clBrand, rx.clBaseCurve && `BC ${rx.clBaseCurve}`, rx.clDiameter && `DIA ${rx.clDiameter}`].filter(Boolean).join(" · ")}</b></span>}
      </div>
    </div>
  );
}
