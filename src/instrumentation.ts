/**
 * Runs once when the server boots. Fails fast on a configuration that would
 * give each computer its own data or sign users out when they move machines.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertEnv, envIssues } = await import("./lib/env");
  for (const issue of envIssues().filter((i) => i.level === "warning")) {
    console.warn(`⚠ ${issue.title} — ${issue.detail}`);
  }
  assertEnv();
}
