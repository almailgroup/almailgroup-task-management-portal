"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { describeAuthError } from "@/lib/auth/errors";
import {
  describeDatabaseError,
  fail,
  fieldErrorsFrom,
  ok,
  type ActionResult,
} from "@/lib/action-result";
import { emailSchema, userRoleSchema } from "@/lib/validation";

/**
 * Adding somebody to the workspace directly.
 *
 * Self-registration depends on a confirmation email, and the mail service a
 * Supabase project starts with sends only a handful an hour — enough for
 * testing, not enough to onboard a company, which is what "email rate limit
 * exceeded" means when it appears on the sign-up form.
 *
 * This route sends nothing. An admin creates the account with a one-time
 * password, already confirmed, and passes it on however they normally would.
 * It is also simply the right shape for a company portal: people are added by
 * whoever is responsible for access, rather than admitting themselves.
 */

const newMemberSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter their full name")
    .max(120, "Name must be 120 characters or fewer"),
  email: emailSchema,
  role: userRoleSchema,
});

/**
 * A password that survives being read down a phone line.
 *
 * No 0/O or 1/l/I, and long enough that the ambiguity is not worth the risk —
 * sixteen characters from this alphabet is about 92 bits. It is meant to be
 * replaced: the person changes it from their profile once they are in.
 */
function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const symbols = "!@#$%&*";

  const draw = (source: string, count: number) => {
    const values = new Uint32Array(count);
    crypto.getRandomValues(values);
    return [...values].map((value) => source[value % source.length]).join("");
  };

  return `${draw(alphabet, 16)}${draw(symbols, 1)}`;
}

export async function addTeamMember(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ email: string; password: string }>> {
  const parsed = newMemberSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    role: formData.get("role") ?? "member",
  });

  if (!parsed.success) {
    return fail("Check the fields below.", fieldErrorsFrom(parsed.error.issues));
  }

  // The service-role client below ignores Row Level Security completely, so
  // this is one of the few places that has to check a role in code. It runs
  // first, and against the caller's own session.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Your session expired. Please sign in again.");

  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (caller?.role !== "admin") {
    return fail("Only an admin can add people to the workspace.");
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return fail(
      "Adding people directly needs SUPABASE_SERVICE_ROLE_KEY in the server environment. Until it is set, new accounts have to come through the sign-up page.",
    );
  }

  const password = temporaryPassword();

  const { data: created, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password,
    // Confirmed on creation: nothing is emailed, so nothing can be missed and
    // no send quota is spent.
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  });

  if (error) return fail(describeAuthError(error));
  if (!created.user) return fail("The account could not be created.");

  // The profile row already exists — handle_new_user creates it as the auth
  // user is inserted — so the role is set on it rather than passed in. This
  // deliberately runs as the admin who asked for it, not as the service key:
  // the trigger that guards role changes checks who is asking.
  if (parsed.data.role !== "member") {
    const { error: roleError } = await supabase
      .from("profiles")
      .update({ role: parsed.data.role })
      .eq("id", created.user.id);

    if (roleError) {
      revalidatePath("/team");
      return fail(
        `${parsed.data.fullName} was added, but their role could not be set: ${describeDatabaseError(roleError)}`,
      );
    }
  }

  revalidatePath("/team");
  revalidatePath("/", "layout");

  return ok({ email: parsed.data.email, password });
}
