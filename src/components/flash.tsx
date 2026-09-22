"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";

/** Shows a toast for ?deleted= / ?error= query parameters, then removes them from the URL. */
export function Flash() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const deleted = sp.get("deleted");
  const error = sp.get("error");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!deleted && !error) return;
    setMsg(deleted ? { tone: "ok", text: `${deleted} was deleted.` } : { tone: "err", text: error! });
    const next = new URLSearchParams(sp.toString());
    next.delete("deleted");
    next.delete("error");
    router.replace(`${path}${next.size ? `?${next}` : ""}`, { scroll: false });
    const t = setTimeout(() => setMsg(null), deleted ? 5000 : 12000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleted, error]);

  if (!msg) return null;
  return (
    <div className="no-print fixed bottom-5 right-5 z-50 flex max-w-md items-start gap-3 rounded-xl border bg-white px-4 py-3 text-sm shadow-xl shadow-slate-900/10" role="status">
      {msg.tone === "ok" ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-600" />}
      <p className="text-slate-700">{msg.text}</p>
      <button onClick={() => setMsg(null)} className="text-slate-400 hover:text-slate-600" aria-label="Dismiss">
        <X size={16} />
      </button>
    </div>
  );
}
