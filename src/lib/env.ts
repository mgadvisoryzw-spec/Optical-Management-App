import "server-only";

/**
 * Environment checks that protect the two things which decide whether a login
 * created on one computer works on another:
 *
 *  1. DATABASE_URL — every machine must point at the SAME database. A `file:`
 *     URL is a local SQLite file, so accounts created against it exist only on
 *     that one computer. That is fine for offline development and wrong for
 *     anything real.
 *
 *  2. AUTH_SECRET — session cookies are signed with it. Two deployments with
 *     different secrets will reject each other's sessions even when they share
 *     a database, so users get silently signed out when they move between them.
 */

const PLACEHOLDER_SECRETS = [
  "change-me-to-a-long-random-string-in-production-0123456789",
  "dev-secret-change-me",
];

export const databaseUrl = process.env.DATABASE_URL ?? "";
export const isSqlite = databaseUrl.startsWith("file:");
export const isPostgres = /^postgres(ql)?:\/\//i.test(databaseUrl);

export type EnvIssue = { level: "error" | "warning"; title: string; detail: string };

/** Problems with the current configuration, worst first. */
export function envIssues(): EnvIssue[] {
  const issues: EnvIssue[] = [];
  const production = process.env.NODE_ENV === "production";
  const secret = process.env.AUTH_SECRET ?? "";

  if (!databaseUrl) {
    issues.push({
      level: "error",
      title: "DATABASE_URL is not set",
      detail: "OptiVault cannot start without a database connection string.",
    });
  } else if (isSqlite && production) {
    issues.push({
      level: "error",
      title: "Running on a local SQLite file",
      detail:
        "DATABASE_URL points at a file on this computer, so accounts and data created here will not exist on any other machine. Point it at your shared PostgreSQL database.",
    });
  } else if (!isSqlite && !isPostgres) {
    issues.push({
      level: "warning",
      title: "Unrecognised DATABASE_URL",
      detail: "Expected a postgresql:// connection string (shared) or file: (local development only).",
    });
  }

  if (!secret || PLACEHOLDER_SECRETS.includes(secret)) {
    issues.push({
      level: production ? "error" : "warning",
      title: "AUTH_SECRET is still the example value",
      detail:
        "Sign-in sessions are signed with this. Generate one with `node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"` and use the SAME value everywhere OptiVault runs.",
    });
  } else if (secret.length < 32) {
    issues.push({
      level: production ? "error" : "warning",
      title: "AUTH_SECRET is too short",
      detail: "Use at least 32 characters so session tokens cannot be forged.",
    });
  }

  return issues.sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
}

/**
 * Refuses to serve a production build that is misconfigured in a way which
 * would quietly give each computer its own data or sign users out.
 * Set ALLOW_UNSAFE_ENV=true to override (single-machine demos only).
 */
export function assertEnv() {
  if (process.env.ALLOW_UNSAFE_ENV === "true") return;
  const errors = envIssues().filter((i) => i.level === "error");
  if (!errors.length) return;
  const message = errors.map((e) => `  ✗ ${e.title}\n    ${e.detail}`).join("\n\n");
  throw new Error(`\nOptiVault cannot start — configuration problem:\n\n${message}\n`);
}
