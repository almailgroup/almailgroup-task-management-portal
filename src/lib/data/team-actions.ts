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

/**
 * The two things every action here needs: proof the caller is an admin, and a
 * service-role client.
 *
 * The service-role client ignores Row Level Security completely, so this is
 * one of the few places in the codebase that has to check a role in code —
 * there is no policy left to do it. The check runs first, and against the
 * caller's own session.
 */
async function requireAdmin(): Promise<
  | { supabase: Awaited<ReturnType<typeof createClient>>; admin: ReturnType<typeof createAdminClient>; userId: string }
  | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Please sign in again." };

  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (caller?.role !== "admin") {
    return { error: "Only an admin can do this." };
  }

  try {
    return { supabase, admin: createAdminClient(), userId: user.id };
  } catch {
    return {
      error:
        "This needs SUPABASE_SERVICE_ROLE_KEY in the server environment. Until it is set, accounts can only be managed from the Supabase dashboard.",
    };
  }
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

  const permitted = await requireAdmin();
  if ("error" in permitted) return fail(permitted.error);
  const { supabase, admin } = permitted;

  const password = temporaryPassword();

  const { data: created, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password,
    // Confirmed on creation: nothing is emailed, so nothing can be missed and
    // no send quota is spent.
    email_confirm: true,
    user_metadata: {
      full_name: parsed.data.fullName,
      // The app asks them to choose their own on first sign-in, and clears
      // this when they do. A nudge, not a lock: the account is already theirs,
      // and they could clear the flag themselves if they went looking.
      must_change_password: true,
    },
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

/**
 * Issue somebody a new password.
 *
 * For the person who has locked themselves out, or was never able to sign in
 * with what they were given. The alternative is the emailed reset link, which
 * depends on the mail quota that made all of this necessary in the first
 * place, and on them still having access to the inbox.
 *
 * The new password is temporary by construction: the account is flagged, so
 * the next sign-in lands on "Choose your password" the same way a new account
 * does. An admin never learns the password anybody is actually using.
 */
export async function resetMemberPassword(
  userId: string,
): Promise<ActionResult<{ email: string; password: string }>> {
  if (!z.string().uuid().safeParse(userId).success) {
    return fail("Unknown member.");
  }

  const permitted = await requireAdmin();
  if ("error" in permitted) return fail(permitted.error);
  const { admin, userId: callerId } = permitted;

  // Changing your own password is a different act with a different rule: it
  // asks for the current one, and that lives on the profile page.
  if (userId === callerId) {
    return fail("To change your own password, use Profile → Password.");
  }

  const { data: target, error: lookupError } =
    await admin.auth.admin.getUserById(userId);

  if (lookupError || !target.user?.email) {
    return fail("That account could not be found.");
  }

  const password = temporaryPassword();

  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    // Spread rather than replace: the metadata carries their name, and
    // overwriting the object would lose it.
    user_metadata: { ...target.user.user_metadata, must_change_password: true },
  });

  if (error) return fail(describeAuthError(error));

  revalidatePath("/team");
  return ok({ email: target.user.email, password });
}