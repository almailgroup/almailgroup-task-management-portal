"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  describeDatabaseError,
  fail,
  fieldErrorsFrom,
  ok,
  type ActionResult,
} from "@/lib/action-result";
import { profileSchema } from "@/lib/validation";
import type { UserRole } from "@/lib/supabase/database.types";

export async function updateProfile(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<void>> {
  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName"),
    avatarUrl: formData.get("avatarUrl") ?? undefined,
  });

  if (!parsed.success) {
    return fail("Check the fields below.", fieldErrorsFrom(parsed.error.issues));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return fail("Your session expired. Please sign in again.");

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      avatar_url: parsed.data.avatarUrl || null,
    })
    .eq("id", user.id);

  if (error) return fail(describeDatabaseError(error));

  revalidatePath("/", "layout");
  return ok(undefined);
}

/**
 * Change another member's role.
 *
 * Only admins can do this, and that is enforced in the database by the
 * guard_profile_role_change trigger — not here.
 */
export async function updateMemberRole(
  userId: string,
  role: UserRole,
): Promise<ActionResult<void>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId)
    .select("id")
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!data) return fail("You do not have permission to change roles.");

  revalidatePath("/team");
  return ok(undefined);
}
