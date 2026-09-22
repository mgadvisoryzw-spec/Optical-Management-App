"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  ListChecks,
  BellRing,
  ShoppingBag,
  Receipt,
  HeartPulse,
  Boxes,
  Scale,
  Truck,
  Factory,
  Wallet,
  Landmark,
  BookOpen,
  BarChart3,
  MessageSquare,
  Settings,
  CreditCard,
  Menu,
  X,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: React.ElementType; perm: string };
const groups: { title: string; items: Item[] }[] = [
  { title: "", items: [{ href: "/app", label: "Dashboard", icon: LayoutDashboard, perm: "sales" }] },
  {
    title: "Clinic",
    items: [
      { href: "/app/patients", label: "Patients", icon: Users, perm: "clinical" },
      { href: "/app/appointments", label: "Appointments", icon: CalendarDays, perm: "clinical" },
      { href: "/app/follow-ups", label: "Follow-ups", icon: ListChecks, perm: "clinical" },
      { href: "/app/recalls", label: "Recalls", icon: BellRing, perm: "clinical" },
    ],
  },
  {
    title: "Sales",
    items: [
      { href: "/app/orders", label: "Orders & jobs", icon: ShoppingBag, perm: "sales" },
      { href: "/app/receipts", label: "Receipts", icon: Receipt, perm: "sales" },
      { href: "/app/medical-aid", label: "Medical aid claims", icon: HeartPulse, perm: "sales" },
    ],
  },
  {
    title: "Stock",
    items: [
      { href: "/app/inventory", label: "Inventory", icon: Boxes, perm: "inventory" },
      { href: "/app/inventory/valuation", label: "Stock valuation", icon: Scale, perm: "inventory" },
      { href: "/app/purchases", label: "Purchases", icon: Truck, perm: "inventory" },
      { href: "/app/suppliers", label: "Suppliers & labs", icon: Factory, perm: "inventory" },
    ],
  },
  {
    title: "Finance",
    items: [
      { href: "/app/expenses", label: "Expenses", icon: Wallet, perm: "accounting" },
      { href: "/app/assets", label: "Fixed assets", icon: Landmark, perm: "accounting" },
      { href: "/app/accounting", label: "Accounting", icon: BookOpen, perm: "accounting" },
      { href: "/app/reports", label: "Reports", icon: BarChart3, perm: "accounting" },
    ],
  },
  {
    title: "Workspace",
    items: [
      { href: "/app/messages", label: "Messages", icon: MessageSquare, perm: "clinical" },
      { href: "/app/settings", label: "Settings", icon: Settings, perm: "settings" },
      { href: "/app/billing", label: "Plan & billing", icon: CreditCard, perm: "billing" },
    ],
  },
];

export function Sidebar({ allowed, orgName }: { allowed: string[]; orgName: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
      {groups.map((g) => {
        const items = g.items.filter((i) => allowed.includes(i.perm));
        if (!items.length) return null;
        return (
          <div key={g.title || "main"}>
            {g.title && <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{g.title}</p>}
            <ul className="space-y-0.5">
              {items.map((i) => {
                const active = i.href === "/app" ? path === "/app" : i.href === "/app/inventory" ? path.startsWith(i.href) && !path.startsWith("/app/inventory/valuation") : path.startsWith(i.href);
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition",
                        active ? "bg-white/10 text-white shadow-inner ring-1 ring-white/10" : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
                      )}
                    >
                      <i.icon size={17} className={active ? "text-brand-300" : "text-slate-500 group-hover:text-slate-300"} />
                      {i.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
  return (
    <>
      <button onClick={() => setOpen(true)} className="no-print fixed left-3 top-3 z-40 rounded-lg bg-ink-900 p-2 text-white lg:hidden" aria-label="Open menu">
        <Menu size={18} />
      </button>
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={cn(
          "no-print fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-ink-950 transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/app">
            <Logo dark />
          </Link>
          <button onClick={() => setOpen(false)} className="text-slate-400 lg:hidden" aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <div className="mx-4 mb-4 truncate rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300">{orgName}</div>
        {nav}
      </aside>
    </>
  );
}
