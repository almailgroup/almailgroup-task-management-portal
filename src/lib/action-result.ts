/**
 * Uniform result type for Server Actions.
 *
 * Actions never throw for expected failures (bad input, denied by RLS) — they
 * return a result the form can render. `fieldErrors` maps a form field name to
 * its first message.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });

export const fail = (
  error: string,
  fieldErrors?: Record<string, string>,
): ActionResult<never> => ({ ok: false, error, fieldErrors });

/** Flatten a ZodError's issues into one message per field. */
export function fieldErrorsFrom(
  issues: { path: (string | number)[]; message: string }[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in result)) result[key] = issue.message;
  }
  return result;
}

/**
 * Turn a PostgREST error into something a user can act on.
 *
 * RLS denials surface as 42501 (insufficient privilege) or as an empty result;
 * both mean "you are not allowed to do this", not "something broke".
 */
export function describeDatabaseError(error: {
  code?: string;
  message?: string;
}): string {
  switch (error.code) {
    case "42501":
      // The review gate and the task-field guard raise this with a message
      // written for the user, so prefer it over the generic line.
      return error.message || "You do not have permission to do that.";
    case "23505":
    case "23505_unique":
      return "That already exists.";
    case "23503":
      return "That record no longer exists.";
    case "23514":
      return "Some of those values are not allowed.";
    case "PGRST116":
      return "Not found, or you do not have access to it.";
    default:
      return error.message || "Something went wrong. Please try again.";
  }
}
