import { cn } from "@/lib/utils";

export function Logo({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-bold tracking-tight", dark ? "text-white" : "text-slate-900", className)}>
      <span className="relative grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-400 via-brand-600 to-indigo-600 shadow-lg shadow-brand-600/30">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
        </svg>
      </span>
      <span className="text-[17px]">
        Opti<span className={dark ? "text-brand-300" : "text-brand-600"}>Vault</span>
      </span>
    </span>
  );
}
