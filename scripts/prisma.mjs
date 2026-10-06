/**
 * Runs the Prisma CLI against the schema that matches DATABASE_URL.
 *
 *   postgresql://…  → prisma/schema.prisma        (shared database — all deployments)
 *   file:…          → prisma/schema.sqlite.prisma (offline local development)
 *
 * This is why `npm run dev`, `npm run build` and `npm run db:push` all just work:
 * you change DATABASE_URL and nothing else. It also keeps the SQLite schema in
 * sync with the Postgres one on every run, so the two can never drift.
 *
 *   node scripts/prisma.mjs generate
 *   node scripts/prisma.mjs db push
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Prisma reads .env itself, but we need DATABASE_URL before we can call it. */
function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = join(root, ".env");
  if (!existsSync(envFile)) return "";
  const line = readFileSync(envFile, "utf8")
    .split("\n")
    .find((l) => l.trim().startsWith("DATABASE_URL"));
  return line ? line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "") : "";
}

const url = databaseUrl();
if (!url) {
  console.error("✗ DATABASE_URL is not set. Copy .env.example to .env and set it.");
  process.exit(1);
}

const sqlite = url.startsWith("file:");
const postgres = /^postgres(ql)?:\/\//i.test(url);
if (!sqlite && !postgres) {
  console.error(`✗ DATABASE_URL must be a postgresql:// or file: URL — got "${url.slice(0, 24)}…"`);
  process.exit(1);
}

// Always regenerate the SQLite copy first so it tracks prisma/schema.prisma.
const sync = spawnSync(process.execPath, [join(root, "scripts", "sync-sqlite-schema.mjs")], { stdio: "inherit" });
if (sync.status !== 0) process.exit(sync.status ?? 1);

const schema = sqlite ? "prisma/schema.sqlite.prisma" : "prisma/schema.prisma";
console.log(`→ prisma ${process.argv.slice(2).join(" ")}  [${sqlite ? "SQLite, this computer only" : "PostgreSQL, shared"}]`);

const res = spawnSync("npx", ["prisma", ...process.argv.slice(2), "--schema", schema], {
  stdio: "inherit",
  cwd: root,
  shell: process.platform === "win32",
});
process.exit(res.status ?? 1);
