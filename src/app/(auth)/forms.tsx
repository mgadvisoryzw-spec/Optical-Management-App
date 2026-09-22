"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, signupAction } from "./actions";
import { SubmitButton } from "@/components/client";
import { PLANS } from "@/lib/plans";

export function LoginForm({ next, demo }: { next?: string; demo?: boolean }) {
  const [state, action] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      {state?.error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
      <label className="block">
        <span className="label">Email</span>
        <input name="email" type="email" required autoComplete="email" className="input" defaultValue={demo ? "owner@demo-optical.co.zw" : ""} />
      </label>
      <label className="block">
        <span className="label">Password</span>
        <input name="password" type="password" required autoComplete="current-password" className="input" defaultValue={demo ? "demo1234" : ""} />
      </label>
      <SubmitButton className="w-full py-2.5" pendingText="Signing in…">Sign in</SubmitButton>
      <p className="text-center text-sm text-slate-500">
        New to OptiVault?{" "}
        <Link href="/signup" className="font-semibold text-brand-700 hover:underline">
          Start a free trial
        </Link>
      </p>
    </form>
  );
}

export function SignupForm({ plan }: { plan?: string }) {
  const [state, action] = useActionState(signupAction, undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
      <label className="block">
        <span className="label">Practice / company name *</span>
        <input name="orgName" required className="input" placeholder="e.g. Clearview Optometrists" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Your name *</span>
          <input name="name" required className="input" autoComplete="name" />
        </label>
        <label className="block">
          <span className="label">Mobile number</span>
          <input name="phone" className="input" placeholder="077 123 4567" />
        </label>
      </div>
      <label className="block">
        <span className="label">Work email *</span>
        <input name="email" type="email" required className="input" autoComplete="email" />
      </label>
      <label className="block">
        <span className="label">Password *</span>
        <input name="password" type="password" required minLength={8} className="input" autoComplete="new-password" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">First branch name</span>
          <input name="branchName" className="input" placeholder="Harare CBD" />
        </label>
        <label className="block">
          <span className="label">Plan</span>
          <select name="plan" defaultValue={plan ?? "PRACTICE"} className="input">
            {PLANS.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name} (${p.priceMonthlyUsd}/mo)
              </option>
            ))}
          </select>
        </label>
      </div>
      <SubmitButton className="w-full py-2.5" pendingText="Setting up your practice…">Create my practice</SubmitButton>
      <p className="text-center text-xs text-slate-500">14-day free trial with no card needed. We set up your chart of accounts, USD/ZWG currencies, medical aids and message templates for you.</p>
      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
