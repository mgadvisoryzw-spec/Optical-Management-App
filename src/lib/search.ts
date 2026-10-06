/**
 * Case-insensitive "contains" filter that behaves the same on PostgreSQL and SQLite.
 *
 * SQLite's LIKE is already case-insensitive for ASCII, and it rejects Prisma's
 * `mode: "insensitive"` outright. PostgreSQL is the opposite: LIKE is
 * case-sensitive, so without `mode` a search for "moyo" would miss "Moyo".
 *
 * The return type is deliberately narrowed to `{ contains: string }` so the same
 * call type-checks against both the Postgres and SQLite generated clients — the
 * `mode` key is still sent at runtime when we are on Postgres.
 */
const INSENSITIVE = /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL ?? "");

export function like(value: string): { contains: string } {
  const v = value.trim();
  return (INSENSITIVE ? { contains: v, mode: "insensitive" } : { contains: v }) as { contains: string };
}

/** Builds an OR filter matching `value` across several fields of one model. */
export function likeAny<F extends string>(fields: readonly F[], value: string) {
  return fields.map((f) => ({ [f]: like(value) }) as Record<F, { contains: string }>);
}
