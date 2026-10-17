/**
 * True when a read failed because its table is not there yet.
 *
 * A change that adds a table reaches Vercel minutes after it is pushed; the
 * table exists only once its migration has been run in Supabase. In between,
 * every read of it fails — Postgres says 42P01, PostgREST PGRST205 — and a
 * peripheral read that failed loudly would put the same line in the log on
 * every page view, or take the page down, for something that is simply not
 * switched on yet.
 */
export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the table/i.test(error.message ?? "")
  );
}

/** True when an RPC failed because its function is not there yet. */
export function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42883" ||
    error.code === "PGRST202" ||
    /could not find the function|function .* does not exist/i.test(error.message ?? "")
  );
}
