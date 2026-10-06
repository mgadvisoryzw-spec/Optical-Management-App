import { LogOut } from "lucide-react";
import { requirePlatformOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { Logo } from "@/components/logo";
import { VENDOR } from "@/lib/platform";
import { platformLogoutAction } from "../../(auth)/actions";
import { PlatformNav } from "./nav";

export const metadata = { title: { default: `${VENDOR.name} console`, template: `%s · ${VENDOR.name} console` } };

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const owner = await requirePlatformOwner();
  const openInvoices = await db.subscriptionInvoice.count({ where: { status: "OPEN" } });
  const initials = owner.name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-ink-950">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 pt-5">
          <div className="flex items-center gap-4">
            <Logo dark />
            <span className="hidden h-6 w-px bg-white/15 sm:block" />
            <div className="hidden leading-tight sm:block">
              <p className="text-sm font-semibold text-white">{VENDOR.name}</p>
              <p className="text-xs text-slate-400">Platform owner console</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-sm font-semibold text-white">{owner.name}</p>
              <p className="text-xs text-slate-400">{owner.platformTitle ?? "Platform owner"}</p>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 text-xs font-bold text-white">{initials}</div>
            <form action={platformLogoutAction}>
              <button className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white" title="Sign out">
                <LogOut size={17} />
              </button>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-6 pt-4">
          <PlatformNav attention={openInvoices} />
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">{children}</main>
      <footer className="mx-auto max-w-7xl px-6 pb-10 text-xs text-slate-400">
        {VENDOR.product} — {VENDOR.tagline}. Developed and operated by {VENDOR.name}. Billing queries: {VENDOR.billingEmail}
      </footer>
    </div>
  );
}
