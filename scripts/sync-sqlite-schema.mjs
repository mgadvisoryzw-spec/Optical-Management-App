/**
 * Generates prisma/schema.sqlite.prisma from prisma/schema.prisma.
 *
 * The Postgres schema is the source of truth. Prisma cannot take its `provider`
 * from an environment variable, so offline local development uses a generated
 * copy with the datasource block swapped. Everything else is identical, which is
 * what stops the two from drifting apart.
 *
 *   node scripts/sync-sqlite-schema.mjs        # write the SQLite copy
 *   node scripts/sync-sqlite-schema.mjs --check # fail if it is out of date (CI)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(root, "prisma", "schema.prisma");
const TARGET = join(root, "prisma", "schema.sqlite.prisma");

const BANNER = `// ─────────────────────────────────────────────────────────────────────────────
// GENERATED FILE — DO NOT EDIT.
// Produced from prisma/schema.prisma by scripts/sync-sqlite-schema.mjs.
// Edit prisma/schema.prisma instead, then run: npm run schema:sync
//
// This SQLite copy exists only for offline local development (npm run dev).
// Every real deployment uses the PostgreSQL schema so that all computers share
// one database.
// ─────────────────────────────────────────────────────────────────────────────
`;

function build() {
  const source = readFileSync(SOURCE, "utf8");
  const datasource = /datasource\s+db\s*\{[^}]*\}/;
  if (!datasource.test(source)) throw new Error("No datasource block found in prisma/schema.prisma");
  if (!/provider\s*=\s*"postgresql"/.test(source)) {
    throw new Error('prisma/schema.prisma is expected to use provider = "postgresql" — it is the source of truth.');
  }
  const body = source.replace(datasource, 'datasource db {\n  provider = "sqlite"\n  url      = env("DATABASE_URL")\n}');
  return BANNER + body.replace(/^\/\/[^\n]*\n(?:\/\/[^\n]*\n)*\n?/, "");
}

const next = build();

if (process.argv.includes("--check")) {
  const current = existsSync(TARGET) ? readFileSync(TARGET, "utf8") : "";
  if (current !== next) {
    console.error("✗ prisma/schema.sqlite.prisma is out of date. Run: npm run schema:sync");
    process.exit(1);
  }
  console.log("✓ SQLite schema is in sync");
} else {
  writeFileSync(TARGET, next, "utf8");
  console.log("✓ Wrote prisma/schema.sqlite.prisma from prisma/schema.prisma");
}
