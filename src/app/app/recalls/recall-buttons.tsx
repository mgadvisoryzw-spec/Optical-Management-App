"use client";

import { useState, useTransition } from "react";
import { MessageCircle, Smartphone, Check } from "lucide-react";
import { recallOne } from "./actions";
import { cn } from "@/lib/utils";

export function RecallButtons({ patientId, hasPhone, sent }: { patientId: string; hasPhone: boolean; sent: boolean }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(sent ? "sent" : null);
  const [err, setErr] = useState<string | null>(null);

  function go(channel: "SMS" | "WHATSAPP") {
    start(async () => {
      const r = await recallOne(patientId, channel);
      if (r?.error) setErr(r.error);
      else {
        setDone(channel);
        if (r?.link) window.open(r.link, "_blank", "noopener");
      }
    });
  }
  if (!hasPhone) return <span className="text-xs text-slate-400">No number</span>;
  return (
    <div className="flex items-center justify-end gap-1.5">
      {done && <Check size={15} className="text-emerald-600" />}
      <button disabled={pending} onClick={() => go("WHATSAPP")} className={cn("inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50")}>
        <MessageCircle size={13} /> WhatsApp
      </button>
      <button disabled={pending} onClick={() => go("SMS")} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50">
        <Smartphone size={13} /> SMS
      </button>
      {err && <span className="text-xs text-rose-600">{err}</span>}
    </div>
  );
}
