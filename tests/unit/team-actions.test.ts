/**
 * Adding a teammate — the only way an account is made.
 *
 * The database refuses an account that does not name the admin who added it
 * in app_metadata (close_self_registration, proven against Postgres in
 * supabase/tests/self-registration.sql). These cover this side of that
 * agreement: the account created here names the admin who asked, and nobody
 * but an admin gets as far as creating one.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";

let callerRole: string;
let createUser: ReturnType<typeof vi.fn>;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "admin-1" } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { role: callerRole } }) }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { createUser } } }),
}));

const { addTeamMember } = await import("@/lib/data/team-actions");

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const newHire = { fullName: "Lina Aboud", email: "lina@almailgroup.com", role: "member" };

beforeEach(() => {
  callerRole = "admin";
  createUser = vi.fn(async () => ({ data: { user: { id: "new-1" } }, error: null }));
});

describe("addTeamMember", () => {
  test("the account names the admin who added it, where only the server can write", async () => {
    const outcome = await addTeamMember(null, form(newHire));
    expect(outcome.ok).toBe(true);
    expect(createUser).toHaveBeenCalledTimes(1);
    expect(createUser.mock.calls[0][0]).toMatchObject({
      email: "lina@almailgroup.com",
      email_confirm: true,
      app_metadata: { added_by: "admin-1" },
    });
    // Not in user_metadata, which the person themselves can edit — the
    // database would not accept it from there.
    expect(createUser.mock.calls[0][0].user_metadata).not.toHaveProperty("added_by");
  });

  test("somebody who is not an admin never gets as far as creating an account", async () => {
    callerRole = "manager";
    const outcome = await addTeamMember(null, form(newHire));
    expect(outcome).toEqual({ ok: false, error: "action.adminOnly" });
    expect(createUser).not.toHaveBeenCalled();
  });
});
