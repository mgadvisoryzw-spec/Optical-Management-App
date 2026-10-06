/**
 * Moves an entire OptiVault database between engines (or takes a backup).
 *
 *   npm run data:export            # read the CURRENT database → backup/optivault-data.json
 *   npm run data:import            # write that file into the CURRENT database
 *   npm run data:import -- --wipe  # clear the target first (destructive)
 *
 * Export and import are two separate runs on purpose: each one talks to whichever
 * database DATABASE_URL points at, so you export while still on SQLite, switch
 * DATABASE_URL to Postgres, then import. Record ids are preserved, so every
 * password, order, receipt and journal line keeps its existing relationships.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../src/lib/db";

/**
 * Tables in dependency order: a row is only written after everything it points
 * at already exists. Importing walks this list forwards, wiping walks it back.
 */
const TABLES = [
  "plan",
  "organization",
  "branch",
  "user",
  "currency",
  "exchangeRate",
  "medicalAid",
  "supplier",
  "product",
  "stockLevel",
  "stockMovement",
  "patient",
  "prescription",
  "appointment",
  "followUp",
  "account",
  "order",
  "orderItem",
  "receipt",
  "medicalAidClaim",
  "purchase",
  "purchaseItem",
  "expense",
  "asset",
  "journalEntry",
  "journalLine",
  "messageTemplate",
  "message",
  "subscriptionInvoice",
  "counter",
  "auditLog",
  "platformAudit",
] as const;

type Table = (typeof TABLES)[number];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const model = (t: Table) => (db as any)[t];

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "backup", "optivault-data.json");
const file = () => {
  const i = process.argv.indexOf("--file");
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : OUT;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** JSON has no Date type, so revive anything that looks like one. */
function reviveDates<T>(value: T): T {
  if (typeof value === "string") return (ISO_DATE.test(value) ? new Date(value) : value) as T;
  if (Array.isArray(value)) return value.map(reviveDates) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = reviveDates(v);
    return out as T;
  }
  return value;
}

async function exportData() {
  const data: Record<string, unknown[]> = {};
  let total = 0;
  for (const t of TABLES) {
    const rows = await model(t).findMany();
    data[t] = rows;
    total += rows.length;
    if (rows.length) console.log(`  ${t.padEnd(22)} ${rows.length}`);
  }
  const path = file();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ exportedAt: new Date().toISOString(), source: describeDb(), data }, null, 2), "utf8");
  console.log(`\n✓ Exported ${total} rows from ${describeDb()}\n  → ${path}`);
  console.log("\nNext: point DATABASE_URL at your Postgres database, run `npm run db:push`, then `npm run data:import`.");
}

async function importData() {
  const path = file();
  if (!existsSync(path)) throw new Error(`No export found at ${path}. Run \`npm run data:export\` first.`);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { exportedAt?: string; source?: string; data: Record<string, unknown[]> };
  const data = reviveDates(parsed.data);
  console.log(`Importing export taken ${parsed.exportedAt ?? "(unknown date)"} from ${parsed.source ?? "(unknown)"}`);
  console.log(`Target: ${describeDb()}\n`);

  if (process.argv.includes("--wipe")) {
    console.log("Clearing the target database…");
    for (const t of [...TABLES].reverse()) await model(t).deleteMany();
  }

  let total = 0;
  for (const t of TABLES) {
    const rows = data[t] ?? [];
    if (!rows.length) continue;
    // createMany with skipDuplicates keeps the import re-runnable.
    const res = await model(t).createMany({ data: rows, skipDuplicates: true });
    total += res.count;
    console.log(`  ${t.padEnd(22)} ${res.count}${res.count < rows.length ? ` (${rows.length - res.count} already present)` : ""}`);
  }
  console.log(`\n✓ Imported ${total} rows into ${describeDb()}`);
  console.log("  Every existing password still works — password hashes were copied unchanged.");
}

function describeDb() {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("file:")) return `SQLite (${url})`;
  // Never print credentials.
  const host = url.match(/@([^/?]+)/)?.[1] ?? "unknown host";
  const name = url.match(/\/([^/?]+)(\?|$)/)?.[1] ?? "";
  return `PostgreSQL (${host}/${name})`;
}

const mode = process.argv.includes("--import") ? "import" : process.argv.includes("--export") ? "export" : null;
if (!mode) {
  console.error("Pass --export or --import. See the comment at the top of this file.");
  process.exit(1);
}

(mode === "export" ? exportData() : importData())
  .catch((e) => {
    console.error("\n✗", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
