# OptiVault: optical practice management and accounting

OptiVault is multi-tenant SaaS for optometrists and optical retailers, developed and operated by **MG Advisory**. It covers patients, prescriptions, spectacle orders, medical aid claims, SMS/WhatsApp recalls, frame and lens inventory, and double-entry accounting, with multi-branch and multi-currency (USD / ZWG) support.

## Quick start

```bash
npm install
cp .env.example .env    # then set DATABASE_URL and AUTH_SECRET
npm run db:push         # creates the tables
npm run db:seed         # plans, the MG Advisory platform owner and a demo practice
npm run build && npm start   # or: npm run dev
```

Open http://localhost:3000.

### Where your data lives — read this before rolling out to clients

`DATABASE_URL` decides whether a login created on one computer works on another:

| Value | Effect |
|---|---|
| `postgresql://…` | **One shared database.** A password created on any computer works on every computer. This is what every real deployment uses. |
| `file:./dev.db` | A SQLite file on **that one computer**. Accounts and data created against it exist nowhere else. Offline development only. |

Every command (`dev`, `build`, `db:push`, `db:seed`) reads `DATABASE_URL` and picks the matching
Prisma schema automatically — you only change that one line. A production build refuses to start
on a `file:` database or a placeholder `AUTH_SECRET`, so a deployment cannot quietly end up
per-machine. **See [DEPLOYMENT.md](DEPLOYMENT.md)** for hosting and for moving an existing SQLite
database to Postgres without anyone losing their password.

| Login | Email | Password |
|---|---|---|
| Demo practice owner (3 branches, 1,000 patients) | owner@demo-optical.co.zw | demo1234 |
| Optometrist / front desk / accountant | kudzai@ · reception@ · accounts@demo-optical.co.zw | demo1234 |
| MG Advisory platform owner (`/platform/login`) | owner@mgadvisory.co.zw | see `PLATFORM_OWNER_PASSWORD` in `.env` |
| Legacy platform admin (`/platform/login`) | admin@optivault.app | admin1234 |

Change the platform owner's password straight after setup — either in `.env` + `npm run db:seed`, or in the console
under **Activity log → Change your console password**.

`npm run db:reset` wipes the database and reseeds it.

## Modules

| Area | What it does |
|---|---|
| **Patients** | Demographics, medical aid membership, SMS/WhatsApp consent, history, search by name, phone, ID or member no. |
| **Eye exams / Rx** | SPH, CYL, axis, ADD, prism/base, VA for each eye; PD distance/near, fitting height, IOP, contact lens parameters, diagnosis, lens recommendation. Printable Rx card. Saving an exam sets the recall date (default 24 months). |
| **Orders & jobs** | Frames, lenses, contact lenses, consultations, repairs and accessories. Status flow: quote → awaiting medical aid → confirmed → in lab → ready → collected. Deposits, invoice/quotation and job-card printing, and a "your glasses are ready" SMS/WhatsApp. |
| **Medical aid** | Pre-auth quotes, auth numbers, partial approvals (the difference moves to the patient), claim submission, remittances, shortfalls billed to the patient or written off, ageing by funder. PSMAS, CIMAS, First Mutual, Alliance, Bonvie and Generation Health are pre-loaded. |
| **Recalls & messaging** | Dashboard of overdue and due recalls, bulk send, one-click WhatsApp/SMS per patient, editable templates, message log. Daily cron sends recall and next-day appointment reminders. |
| **Appointments & follow-ups** | Week diary per branch and optometrist, walk-ins, confirm/arrived/completed/no-show, SMS reminders, follow-up task list. |
| **Inventory** | Frames by brand, model, colour, the **reference printed on the temple**, size and material. Lenses by type (single vision / bifocal / multifocal / office), index and coating. Stock per branch, transfers, adjustments, weighted-average cost, reorder alerts. |
| **Purchases** | Supplier and lab invoices in any currency, paid now or on account. Stocked items go into inventory; per-job lenses and consumables are expensed. |
| **Expenses & assets** | Operating expenses by chart-of-accounts category. Fixed-asset register with idempotent straight-line depreciation runs. |
| **Accounting** | Every transaction posts a balanced journal in the base currency, keeping the original currency amount. P&L, balance sheet, trial balance, journal, account ledgers, manual journals. Per-branch or consolidated. |
| **Reports** | Sales by category, branch, optometrist and payment method; best-selling frames; patient debtor ageing; recall return rate; CSV exports (patients, orders, receipts, expenses, general ledger, inventory). |
| **SaaS** | Self-serve sign-up with a 14-day trial, plans with branch/user limits, Paynow checkout (EcoCash, OneMoney, cards), bank-transfer invoices, read-only lock when a subscription lapses. |
| **Platform console** | MG Advisory's own area at `/platform`: every client with their plan and subscription state, MRR/ARR and collections, an approvals queue for payments and expired subscriptions, granting paid access for a term, plan changes, trial extensions, suspensions, plan pricing, and an audit trail of everything done from the console. |
| **Roles** | Owner, Admin, Optometrist, Front desk, Accountant. Front desk and optometrists only see their home branch. Owners and administrators can edit any team member under **Settings → Users & roles** (name, email, role, branch, password, access), with the last active owner protected. |

## The MG Advisory platform console

OptiVault is sold and supported by MG Advisory. The platform owner account has no practice of its own and signs in
at **`/platform/login`** — a separate front door from the practice login at `/login`. Practice staff who reach
`/platform` are sent back to their own app, and the platform owner is kept out of `/app`.

| Page | What it is for |
|---|---|
| **Overview** | MRR and ARR, paying clients, trials, collections this month, what needs attention, renewals due in 45 days, recent console activity. |
| **Clients** | Every practice with its plan, subscription state, paid-up date, value, branch/user/patient counts. Filter by paying, trial, lapsed or suspended, or search. |
| **Client detail** | Approve a payment, grant paid access for a term, change plan, extend a trial, raise an invoice, suspend or reactivate, reset a locked-out user's password, keep internal account notes. |
| **Billing & approvals** | The work queue: payments awaiting confirmation, then expired and expiring subscriptions with grant-and-approve in one row, then recently approved payments. |
| **Plans & pricing** | What MG Advisory charges, plus the branch, user and message limits. Changes apply at the next renewal. |
| **Activity log** | Every approval, grant, plan change and suspension, with who did it and when. |

**Approving billing.** There are two routes, both of which end with a paid invoice and an open plan:

1. *The client picked a plan in the app* and paid by bank transfer or mobile money. Their invoice sits in
   **Billing & approvals → Payments awaiting approval**. Confirm the money landed, record the method and reference,
   and approve.
2. *The client paid MG Advisory directly* (or their subscription has already expired). Use **Grant paid access** on the
   client's page — pick the plan and the number of months, and OptiVault writes a paid invoice and opens the plan.
   A renewal approved after the old period lapsed runs a full term from the day it is approved, not from the lapsed date.

From the command line (useful before anyone has signed in):

```bash
npm run grant -- --org "Optical Frames Optometry" --plan PRACTICE --months 12   --method BANK --reference "12 months paid in advance" --start-now
```

### How the accounting works
- **Order confirmed:** Dr patient receivable + medical aid receivable (+ discount), Cr sales by category (frames 4000, lenses 4010, contact lenses 4020, consultations 4030, repairs 4040, accessories 4050) and VAT. Cost of sales is posted against inventory at weighted-average cost.
- **Receipts:** Dr cash / bank / mobile money (by payment method). The credit goes to patient deposits before confirmation and to receivables after.
- **Multi-currency:** each document stores its currency and exchange rate. Books are kept in the base currency. A USD payment against a ZWG order is converted automatically.

## Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite locally. For production, change `provider` in `prisma/schema.prisma` to `postgresql` and point this at Postgres (Neon, Supabase, RDS). |
| `AUTH_SECRET` | Long random string used to sign sessions. **Must be changed in production.** |
| `APP_URL` | Public URL, used for Paynow return and result URLs. |
| `CRON_SECRET` | Bearer token for `GET /api/cron/reminders`. Schedule it daily with Vercel Cron, GitHub Actions or cron-job.org. |
| `TWILIO_*`, `AFRICASTALKING_*` | SMS gateways. Pick one per practice in Settings → Messaging. |
| `WHATSAPP_CLOUD_TOKEN`, `WHATSAPP_CLOUD_PHONE_ID` | Automatic WhatsApp through Meta's Cloud API. Without these, WhatsApp uses click-to-chat links, so staff press send themselves. |
| `PAYNOW_INTEGRATION_ID`, `PAYNOW_INTEGRATION_KEY` | Live subscription payments. |
| `ALLOW_SANDBOX_BILLING` | `true` only for demos. It lets the billing page activate plans without a payment. |

## Before commercial launch
- Move to Postgres, set a strong `AUTH_SECRET`, run behind HTTPS and set up daily database backups.
- Replace the placeholder billing email (`billing@optivault.app`) and the example testimonial on the sign-in page.
- Automatic WhatsApp messages outside a 24-hour conversation window need Meta-approved message templates.
- Add a privacy policy and terms of service, and a data-processing agreement for clinics (patient health data).
- Suggested next features: patient self-booking portal, password reset emails, 2FA, lab EDI/order upload, barcode label printing, ZIMRA fiscal device integration, offline mode.

## Tech
Next.js 15 (App Router, server actions) · React 19 · TypeScript · Prisma 6 · Tailwind CSS 4 · Recharts · jose (JWT sessions) · bcrypt.

Key files: `src/lib/services.ts` (business logic and ledger postings), `src/lib/ledger.ts` (double-entry engine), `src/lib/messaging.ts` (SMS/WhatsApp providers), `src/lib/billing.ts` (subscriptions and Paynow), `prisma/schema.prisma`.
