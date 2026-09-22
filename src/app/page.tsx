import Link from "next/link";
import { Logo } from "@/components/logo";
import { PLANS } from "@/lib/plans";
import {
  CalendarCheck,
  Glasses,
  MessageCircle,
  Building2,
  Coins,
  ShieldCheck,
  BookOpenCheck,
  Boxes,
  Stethoscope,
  HeartPulse,
  BarChart3,
  Check,
  ArrowRight,
} from "lucide-react";

const features = [
  { icon: Stethoscope, title: "Clinical records & prescriptions", text: "Structured Rx for spectacles and contact lenses: SPH, CYL, AXIS, ADD, prism, PD, heights, VA and IOP. Print Rx cards in one click." },
  { icon: Glasses, title: "Orders & lab job tracking", text: "Quote → medical aid approval → lab → ready → collected. Every frame and lens on the job card, with SMS the moment it's ready." },
  { icon: MessageCircle, title: "SMS & WhatsApp recalls", text: "Automatic 2-year recall campaigns, appointment reminders and 'your glasses are ready' messages over SMS or WhatsApp." },
  { icon: HeartPulse, title: "Medical aid claims", text: "Track pre-authorisations, claims, remittances and shortfalls for PSMAS, CIMAS, First Mutual and more. Shortfalls are billed to the patient automatically." },
  { icon: Boxes, title: "Frame & lens inventory", text: "Frames by brand, model, colour and the reference printed on the temple. Lenses by type, index and coating. Stock per branch, transfers and reorder alerts." },
  { icon: BookOpenCheck, title: "Full double-entry accounting", text: "Receipts, supplier purchases, expenses, assets and depreciation post to the general ledger. Get your P&L, balance sheet and trial balance without extra work." },
  { icon: Coins, title: "USD, ZWG & more", text: "Invoice, receive and pay in any currency. Exchange rates are saved on every transaction and the books report in your base currency." },
  { icon: Building2, title: "Multi-branch from day one", text: "Run one practice or a chain. Switch between branches or see them all combined, with stock, staff and financials kept per branch." },
  { icon: CalendarCheck, title: "Bookings & follow-ups", text: "Diary by optometrist and branch, walk-ins, no-show tracking and follow-up tasks so no patient falls through the cracks." },
];

const faqs = [
  { q: "Do I need to install anything?", a: "No. OptiVault runs in the browser on any computer, tablet or phone. Your data is backed up in the cloud." },
  { q: "Can I bill in ZWG and USD at the same time?", a: "Yes. Each order, receipt, purchase and expense can be in any active currency. OptiVault saves the exchange rate on each transaction and reports in your base currency." },
  { q: "How do the WhatsApp reminders work?", a: "Start with one-click WhatsApp links. They open WhatsApp with the message already typed, so there's no setup. When you're ready, connect the WhatsApp Business API or Twilio to send automatically." },
  { q: "Is there a free trial?", a: "Every plan starts with a 14-day free trial. You don't need a card to start. Pay with EcoCash, card or bank transfer when you're ready." },
  { q: "Can my accountant log in?", a: "Yes. Give them the Accountant role. They can see receipts, expenses, the ledger and reports, but not clinical records." },
];

export default function Landing() {
  return (
    <div className="bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-slate-200/60 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Logo />
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            <a href="#features" className="hover:text-slate-900">Features</a>
            <a href="#africa" className="hover:text-slate-900">Built for Africa</a>
            <a href="#pricing" className="hover:text-slate-900">Pricing</a>
            <a href="#faq" className="hover:text-slate-900">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Sign in</Link>
            <Link href="/signup" className="rounded-lg bg-ink-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-ink-800">Start free trial</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-ink-950 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(60%_50%_at_70%_10%,rgba(6,182,212,0.35),transparent),radial-gradient(40%_40%_at_10%_80%,rgba(99,102,241,0.3),transparent)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 py-24 lg:grid-cols-2 lg:py-28">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-brand-200">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400" /> Practice management + accounting in one system
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
              Run your optical practice <span className="bg-gradient-to-r from-brand-300 to-indigo-300 bg-clip-text text-transparent">and its books</span> in one place.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-slate-300">
              Patient prescriptions, spectacle orders, medical aid claims, SMS and WhatsApp recalls, frame and lens stock, and full multi-currency accounting. Built for practices with one branch or many.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-3 font-semibold text-ink-950 shadow-lg shadow-brand-500/30 hover:bg-brand-400">
                Start your 14-day free trial <ArrowRight size={18} />
              </Link>
              <Link href="/login?demo=1" className="rounded-xl border border-white/20 px-5 py-3 font-semibold text-white hover:bg-white/10">
                Explore the live demo
              </Link>
            </div>
            <p className="mt-4 text-sm text-slate-400">No card required · USD & ZWG · EcoCash, card & bank payments</p>
          </div>

          {/* Product mock */}
          <div className="relative">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-2xl backdrop-blur">
              <div className="rounded-xl bg-white p-5 text-slate-900">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Today · All branches</p>
                    <p className="text-lg font-bold">Good morning, Dr. Moyo</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">+18% vs last month</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    ["Revenue MTD", "$24,860"],
                    ["Orders in lab", "37"],
                    ["Recalls due", "142"],
                  ].map(([l, v]) => (
                    <div key={l} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-[10px] font-semibold uppercase text-slate-400">{l}</p>
                      <p className="mt-1 text-xl font-bold">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex h-28 items-end gap-2 rounded-xl border border-slate-100 p-3">
                  {[40, 55, 48, 62, 58, 70, 66, 80, 74, 88, 84, 96].map((h, i) => (
                    <div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-brand-600 to-brand-400" style={{ height: `${h}%` }} />
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  {[
                    ["Tendai M.", "Progressive lenses + Ray-Ban RB5154", "Ready", "bg-teal-50 text-teal-700"],
                    ["Rudo C.", "Eye test · PSMAS pre-auth", "Awaiting auth", "bg-amber-50 text-amber-700"],
                    ["Farai N.", "Single vision, blue-cut 1.56", "In lab", "bg-violet-50 text-violet-700"],
                  ].map(([n, d, s, c]) => (
                    <div key={n} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                      <div>
                        <p className="font-semibold">{n}</p>
                        <p className="text-xs text-slate-500">{d}</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c}`}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="absolute -bottom-6 -left-6 hidden rounded-xl border border-white/10 bg-ink-800 p-3 text-sm shadow-xl sm:block">
              <p className="flex items-center gap-2 font-semibold text-emerald-300"><MessageCircle size={16} /> WhatsApp sent</p>
              <p className="mt-1 max-w-[220px] text-xs text-slate-300">“Good news Tendai! Your order ORD-000412 is ready for collection…”</p>
            </div>
          </div>
        </div>
      </section>

      {/* Logos / trust */}
      <section className="border-b border-slate-100 bg-slate-50">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-6 py-6 text-sm font-semibold text-slate-400">
          <span>Works with PSMAS</span><span>CIMAS</span><span>First Mutual Health</span><span>EcoCash</span><span>InnBucks</span><span>ZIPIT</span><span>WhatsApp</span>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">Everything in one place</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">One system from the test room to the balance sheet</h2>
          <p className="mt-4 text-slate-600">Most optical software stops at the till, and most accounting software doesn't understand a prescription. OptiVault does both, so every sale, claim and purchase is already in your books.</p>
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="group rounded-2xl border border-slate-200 p-6 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-600/5">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100 group-hover:bg-brand-600 group-hover:text-white">
                <f.icon size={20} />
              </div>
              <h3 className="mt-4 font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Africa */}
      <section id="africa" className="bg-ink-950 text-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-24 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-300">Built for how African practices work</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Multi-currency, mobile money and medical aid, built in</h2>
            <p className="mt-4 text-slate-300">Software from other markets assumes one currency and card payments. OptiVault was designed around USD and ZWG pricing, EcoCash and InnBucks receipts, and medical aid pre-authorisation.</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {[
              ["Dual-currency invoicing", "Quote in ZWG, receive in USD. OptiVault converts at the rate you set and tracks what's still owed."],
              ["Mobile money ready", "EcoCash, OneMoney and InnBucks are payment methods out of the box, reconciled to their own ledger account."],
              ["Pre-auth workflow", "Orders wait for medical aid approval before going to the lab. Record the authorisation number and remittance."],
              ["Works on low bandwidth", "Light pages that load fast on mobile data, and WhatsApp links that work without an API."],
            ].map(([t, d]) => (
              <li key={t} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <ShieldCheck className="text-brand-300" size={20} />
                <p className="mt-3 font-semibold">{t}</p>
                <p className="mt-1 text-sm text-slate-400">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">Pricing</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Simple plans that grow with your practice</h2>
          <p className="mt-4 text-slate-600">Every plan starts with a 14-day free trial. Pay yearly and get 2 months free.</p>
        </div>
        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {PLANS.map((p) => {
            const featured = p.code === "PRACTICE";
            return (
              <div key={p.code} className={`relative flex flex-col rounded-3xl p-8 ${featured ? "bg-ink-900 text-white shadow-2xl shadow-brand-900/20 ring-1 ring-ink-700" : "border border-slate-200 bg-white"}`}>
                {featured && <span className="absolute -top-3 left-8 rounded-full bg-brand-500 px-3 py-1 text-xs font-bold text-ink-950">Most popular</span>}
                <h3 className="text-lg font-bold">{p.name}</h3>
                <p className={`mt-1 text-sm ${featured ? "text-slate-300" : "text-slate-500"}`}>{p.tagline}</p>
                <p className="mt-6 flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold tracking-tight">${p.priceMonthlyUsd}</span>
                  <span className={featured ? "text-slate-400" : "text-slate-500"}>/month</span>
                </p>
                <p className={`mt-1 text-xs ${featured ? "text-slate-400" : "text-slate-500"}`}>or ${p.priceYearlyUsd}/year, billed annually</p>
                <ul className="mt-8 flex-1 space-y-3 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2.5">
                      <Check size={18} className={featured ? "text-brand-300" : "text-brand-600"} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/signup?plan=${p.code}`}
                  className={`mt-8 rounded-xl px-4 py-3 text-center font-semibold ${featured ? "bg-brand-500 text-ink-950 hover:bg-brand-400" : "bg-ink-900 text-white hover:bg-ink-800"}`}
                >
                  Start free trial
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-3xl px-6 py-24">
          <h2 className="text-center text-3xl font-bold tracking-tight">Frequently asked questions</h2>
          <div className="mt-10 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {faqs.map((f) => (
              <details key={f.q} className="group px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-slate-900">
                  {f.q}
                  <span className="text-slate-400 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-indigo-700 px-10 py-14 text-white">
          <BarChart3 className="absolute -right-6 -bottom-6 h-48 w-48 text-white/10" />
          <h2 className="max-w-xl text-3xl font-bold tracking-tight">See your whole practice on one screen, starting today.</h2>
          <p className="mt-3 max-w-xl text-brand-100">Set up takes about 5 minutes. Import your patients, add your frames, and send your first recall today.</p>
          <Link href="/signup" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-ink-900 hover:bg-brand-50">
            Create your practice <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-100">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-slate-500">
          <Logo />
          <p>© {new Date().getFullYear()} OptiVault. Optical practice management & accounting.</p>
        </div>
      </footer>
    </div>
  );
}
