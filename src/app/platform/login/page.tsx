import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { VENDOR } from "@/lib/platform";
import { PlatformLoginForm } from "./login-form";

export const metadata = { title: "Platform owner sign-in" };

export default function PlatformLoginPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-950">
      <div className="absolute inset-0 [background:radial-gradient(45%_45%_at_75%_10%,rgba(6,182,212,0.28),transparent),radial-gradient(40%_40%_at_10%_95%,rgba(99,102,241,0.3),transparent)]" />
      <div className="relative mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
        <Link href="/" className="self-start">
          <Logo dark />
        </Link>
        <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-200">
            <ShieldCheck size={14} /> Platform owner access
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{VENDOR.name} console</h1>
          <p className="mb-8 mt-2 text-sm leading-relaxed text-slate-400">
            Sign in to see every practice running on {VENDOR.product}, their plans and subscriptions, and to approve
            billing when a client has paid or their subscription has expired.
          </p>
          <PlatformLoginForm />
        </div>
        <p className="mt-8 text-center text-xs text-slate-500">
          {VENDOR.product} is designed, built and operated by {VENDOR.name}.
        </p>
      </div>
    </div>
  );
}
