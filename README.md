# OptiVault: optical practice management and accounting

OptiVault is multi-tenant SaaS for optometrists and optical retailers. It covers patients, prescriptions, spectacle orders, medical aid claims, SMS/WhatsApp recalls, frame and lens inventory, and double-entry accounting, with multi-branch and multi-currency (USD / ZWG) support.

## Quick start

```bash
npm install
npx prisma db push      # creates prisma/dev.db (SQLite)
npm run db:seed         # plans, super-admin and a fully populated demo practice
npm run build && npm start   # or: npm run dev
```

Open http://localhost:3000.

| Login | Email | Password |
|---|---|---|
| Demo practice owner (3 branches, 1,000 patients) | owner@demo-optical.co.zw | demo1234 |
| Optometrist / front desk / accountant | kudzai@ · reception@ · accounts@demo-optical.co.zw | demo1234 |
| Platform super-admin (`/admin`) | admin@optivault.app | admin1234 |

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
| **SaaS** | Self-serve sign-up with a 14-day trial, plans with branch/user limits, Paynow checkout (EcoCash, OneMoney, cards), bank-transfer invoices, read-only lock when a subscription lapses, super-admin console (MRR, tenants, confirm payments, extend trials). |
| **Roles** | Owner, Admin, Optometrist, Front desk, Accountant. Front desk and optometrists only see their home branch. |

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
