"use client";

import { useActionState, useEffect, useState } from "react";
import { MessageCircle, Smartphone } from "lucide-react";
import { sendPatientMessage } from "@/app/app/patients/actions";
import { SubmitButton } from "./client";
import { cn } from "@/lib/utils";

export function MessageComposer({
  patientId,
  templates,
  hasPhone,
  defaultKey,
}: {
  patientId: string;
  templates: { key: string; name: string; body: string }[];
  hasPhone: boolean;
  defaultKey?: string;
}) {
  const [state, action] = useActionState(sendPatientMessage, undefined);
  const [channel, setChannel] = useState<"SMS" | "WHATSAPP">("WHATSAPP");
  const initial = templates.find((t) => t.key === defaultKey) ?? templates[0];
  const [purpose, setPurpose] = useState(initial?.key ?? "CUSTOM");
  const [body, setBody] = useState(initial?.body ?? "");

  useEffect(() => {
    if (state?.link) window.open(state.link, "_blank", "noopener");
  }, [state]);

  if (!hasPhone) return <p className="text-sm text-slate-500">Add a mobile number to send SMS or WhatsApp messages.</p>;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="purpose" value={purpose} />
      <div className="grid grid-cols-2 gap-2">
        {(["WHATSAPP", "SMS"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setChannel(c)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition",
              channel === c ? (c === "WHATSAPP" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-brand-500 bg-brand-50 text-brand-700") : "border-slate-200 text-slate-500 hover:bg-slate-50",
            )}
          >
            {c === "WHATSAPP" ? <MessageCircle size={16} /> : <Smartphone size={16} />}
            {c === "WHATSAPP" ? "WhatsApp" : "SMS"}
          </button>
        ))}
      </div>
      <select
        className="input"
        value={purpose}
        onChange={(e) => {
          setPurpose(e.target.value);
          const t = templates.find((x) => x.key === e.target.value);
          if (t) setBody(t.body);
        }}
      >
        {templates.map((t) => (
          <option key={t.key} value={t.key}>
            {t.name}
          </option>
        ))}
        <option value="CUSTOM">Custom message</option>
      </select>
      <textarea name="body" rows={5} className="input" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{body.length} characters · {Math.max(1, Math.ceil(body.length / 160))} SMS</span>
      </div>
      {state?.error && <p className="text-sm text-rose-600">{state.error}</p>}
      {state?.ok && (
        <p className="text-sm text-emerald-700">
          {state.status === "LINK" ? (
            <>
              WhatsApp opened in a new tab.{" "}
              <a className="underline" href={state.link} target="_blank" rel="noreferrer">
                Open it again
              </a>
            </>
          ) : state.status === "LOGGED" ? (
            "Saved to the message log. No SMS gateway is set up yet, so it wasn't sent. Connect one in Settings → Messaging."
          ) : (
            "Message sent."
          )}
        </p>
      )}
      <SubmitButton className={cn("w-full", channel === "WHATSAPP" && "bg-emerald-600 hover:bg-emerald-700")} pendingText="Sending…">
        Send {channel === "WHATSAPP" ? "WhatsApp" : "SMS"}
      </SubmitButton>
    </form>
  );
}
