import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

/**
 * Service-role client. SERVER ONLY.
 *
 * This key bypasses every Row Level Security policy in the schema, so it is
 * deliberately the single place in the codebase that touches it:
 *
 *   * the variable is NOT prefixed NEXT_PUBLIC_, so Next.js will never inline
 *     it into a browser bundle
 *   * this module imports "server-only", so importing it from a Client
 *     Component is a build error rather than a silent leak
 *   * it is used by exactly one caller: the reminder dispatcher, which has to
 *     read every user's queued reminders and therefore cannot run as any one
 *     of them
 *
 * Nothing that serves a user request should use this. Use `@/lib/supabase/server`.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Reminder delivery needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
