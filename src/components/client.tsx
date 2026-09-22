"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SubmitButton({ children, variant = "primary", className, pendingText, ...props }: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" | "dark" | "ghost"; pendingText?: string }) {
  const { pending } = useFormStatus();
  const v = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20",
    secondary: "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-sm",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
    dark: "bg-ink-900 text-white hover:bg-ink-800",
    ghost: "text-slate-600 hover:bg-slate-100",
  }[variant];
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:opacity-60", v, className)}
      {...props}
    >
      {pending && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {pending ? pendingText ?? "Saving…" : children}
    </button>
  );
}

export function ConfirmButton({ children, message, className, variant = "secondary" }: { children: ReactNode; message: string; className?: string; variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  return (
    <SubmitButton
      variant={variant}
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </SubmitButton>
  );
}

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="no-print inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
      {label}
    </button>
  );
}

/** Auto-submits the surrounding form when a select changes (used for filters and branch switcher). */
export function AutoSubmitSelect({ options, className, ...props }: ComponentProps<"select"> & { options: { value: string; label: string }[] }) {
  return (
    <select {...props} className={cn("input", className)} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
