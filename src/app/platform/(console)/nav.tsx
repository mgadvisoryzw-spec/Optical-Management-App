"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/platform", label: "Overview" },
  { href: "/platform/clients", label: "Clients" },
  { href: "/platform/billing", label: "Billing & approvals" },
  { href: "/platform/plans", label: "Plans & pricing" },
  { href: "/platform/activity", label: "Activity log" },
];

export function PlatformNav({ attention }: { attention: number }) {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {items.map((it) => {
        const active = it.href === "/platform" ? pathname === "/platform" : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "relative whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition",
              active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
            )}
          >
            {it.label}
            {it.href === "/platform/billing" && attention > 0 && (
              <span className="ml-1.5 inline-flex min-w-[18px] justify-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-ink-950">{attention}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
