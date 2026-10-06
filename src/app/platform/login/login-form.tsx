"use client";

import { useActionState } from "react";
import Link from "next/link";
import { platformLoginAction } from "../../(auth)/actions";
import { SubmitButton } from "@/components/client";

export function PlatformLoginForm() {
  const [state, action] = useActionState(platformLoginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{state.error}</p>}
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Platform owner email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@yourcompany.com"
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Password</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </label>
      <SubmitButton className="w-full py-2.5" pendingText="Signing in…">
        Sign in to the console
      </SubmitButton>
      <p className="pt-2 text-center text-xs text-slate-500">
        Are you a practice using OptiVault?{" "}
        <Link href="/login" className="font-semibold text-brand-300 hover:underline">
          Sign in here instead
        </Link>
      </p>
    </form>
  );
}
