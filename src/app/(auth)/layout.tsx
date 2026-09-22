import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/">
          <Logo />
        </Link>
        <div className="flex flex-1 items-center">
          <div className="w-full max-w-md py-10">{children}</div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-ink-950 lg:block">
        <div className="absolute inset-0 [background:radial-gradient(50%_50%_at_60%_20%,rgba(6,182,212,0.35),transparent),radial-gradient(40%_40%_at_20%_90%,rgba(99,102,241,0.35),transparent)]" />
        <div className="relative flex h-full flex-col justify-end p-14 text-white">
          <blockquote className="max-w-lg text-2xl font-semibold leading-snug">
            “We moved three branches off paper cards and spreadsheets. Recalls alone brought back more than 200 patients in the first quarter.”
          </blockquote>
          <p className="mt-4 text-sm text-slate-400">Example testimonial. Replace with real customer quotes before launch.</p>
          <div className="mt-10 grid grid-cols-3 gap-4 text-sm">
            {[
              ["2-yr", "automated recalls"],
              ["USD · ZWG", "multi-currency"],
              ["∞", "branches on Group"],
            ].map(([a, b]) => (
              <div key={b} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xl font-bold text-brand-300">{a}</p>
                <p className="text-slate-400">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
