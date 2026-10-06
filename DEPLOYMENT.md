# Deploying OptiVault so every computer shares the same accounts

Until now OptiVault stored everything in `prisma/dev.db` — a single file inside the project
folder. That is why a password created on one laptop did not work on another: **each computer
had its own separate database.**

The fix is to run OptiVault **once, on a server, against one shared PostgreSQL database**.
Every practice then opens a URL in a browser. Nothing is installed on their machines, logins
work from any computer or phone, and MG Advisory manages all clients from one console.

```
Optical Frames staff  ─┐
Clearview staff       ─┼─→  https://your-domain  ─→  one PostgreSQL database
MG Advisory console   ─┘
```

---

## The two settings that make logins portable

| Setting | Why it matters |
|---|---|
| `DATABASE_URL` | Must be the **same PostgreSQL** connection for every server. A `file:` URL is a local SQLite file and is per-computer by definition. |
| `AUTH_SECRET` | Signs sign-in cookies. Two servers with **different** secrets reject each other's sessions, so users get silently signed out even with a shared database. Generate once, reuse everywhere. |

OptiVault now refuses to start a production build that gets either of these wrong, rather than
quietly giving each machine its own data. You can see the current state any time in the console
under **Activity log → Deployment health**.

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## Step 1 — Create the shared database

Any managed PostgreSQL works. Free tiers are fine to start:

- **[Neon](https://neon.tech)** — generous free tier, scales to zero. Good default.
- **[Supabase](https://supabase.com)** — free tier, includes backups.
- **[Railway](https://railway.app)** — Postgres and the app in one place.

Copy the connection string; it looks like:

```
postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

## Step 2 — Move your existing data across

This preserves every record **and every password hash**, so nobody has to reset anything.

```bash
# 1. Still pointing at the old SQLite file — take the export
npm run data:export                 # → backup/optivault-data.json

# 2. Point DATABASE_URL at the new Postgres, then create the tables
npm run db:push

# 3. Load the data in
npm run data:import
```

`npm run db:push`, `npm run dev` and `npm run build` all read `DATABASE_URL` and pick the right
schema automatically — you only ever change that one line.

If you are starting fresh instead of migrating, run `npm run db:seed` after step 2.

> `backup/optivault-data.json` contains password hashes and patient records. It is gitignored —
> keep it somewhere safe and delete it once the move is confirmed.

## Step 3 — Deploy the app

Push the repo to GitHub, then on **[Vercel](https://vercel.com)** (or Railway/Render) import it
and set these environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the PostgreSQL string from step 1 |
| `AUTH_SECRET` | the generated secret — the same value on every server |
| `APP_URL` | `https://your-domain` (used for Paynow return URLs) |
| `CRON_SECRET` | any long random string |
| `PLATFORM_OWNER_EMAIL` / `PLATFORM_OWNER_PASSWORD` | the MG Advisory console login |
| `PAYNOW_INTEGRATION_ID` / `PAYNOW_INTEGRATION_KEY` | to take live payments |

Do **not** set `ALLOW_UNSAFE_ENV` on the server — it exists only so a single demo machine can
run against the local SQLite file.

Build command is `npm run build`, which generates the Postgres client and compiles the app.

## Step 4 — Daily reminders

Point a scheduler at `https://your-domain/api/cron/reminders` once a day with the
`CRON_SECRET`. On Vercel add a `vercel.json` cron; elsewhere use any cron service.

---

## After the move

- Practices sign in at `https://your-domain/login` — from any computer, no install.
- MG Advisory signs in at `https://your-domain/platform/login`.
- Change the platform owner password immediately (**Activity log → Change your console password**).
- Set up database backups with your Postgres provider. `npm run data:export` is a second,
  provider-independent backup you can run any time.

## Still developing offline

Keep a local `.env` with `DATABASE_URL="file:./dev.db"` and `ALLOW_UNSAFE_ENV="true"`.
`npm run dev` then uses the generated `prisma/schema.sqlite.prisma` and never touches live
client data. The SQLite schema is regenerated from `prisma/schema.prisma` on every command, so
the two cannot drift; `npm run schema:check` fails the build if the copy is stale.
