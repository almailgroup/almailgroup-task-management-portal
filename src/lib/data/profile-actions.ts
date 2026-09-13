"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  describeDatabaseError,
  fail,
  fieldErrorsFrom,
  ok,
  type ActionResult,
} from "@/lib/action-result";
import { positionSchema, profileSchema, userRoleSchema } from "@/lib/validation";
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
  // A Server Action is a public endpoint, so the arguments are validated at
  // runtime rather than trusted from the TypeScript signature.
  const parsed = userRoleSchema.safeParse(role);
  if (!parsed.success) return fail("Unknown role.");
  if (!z.string().uuid().safeParse(userId).success) {
    return fail("Unknown member.");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .update({ role: parsed.data })
    .eq("id", userId)
    .select("id")
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!data) return fail("You do not have permission to change roles.");

  revalidatePath("/team");
  return ok(undefined);
}

/**
 * Set a member's job position.
 *
 * Admin-only, enforced by the guard_profile_role_change trigger rather than
 * here — the same trigger that blocks self-promotion now pins job_title too.
 * Passing an empty value clears it.
 */
export async function updateMemberPosition(
  userId: string,
  jobTitle: string,
): Promise<ActionResult<void>> {
  const parsed = positionSchema.safeParse(jobTitle);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "That position is not valid.");
  }
  if (!z.string().uuid().safeParse(userId).success) {
    return fail("Unknown member.");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .update({ job_title: parsed.data || null })
    .eq("id", userId)
    .select("id")
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!data) return fail("You do not have permission to set positions.");

  revalidatePath("/", "layout");
  return ok(undefined);
}

/** Record a newly uploaded avatar against the signed-in user's profile. */
export async function setOwnAvatar(
  publicUrl: string,
): Promise<ActionResult<void>> {
  const url = publicUrl.trim();
  if (url && !/^https?:\/\//i.test(url)) {
    return fail("That image could not be saved.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Your session expired. Please sign in again.");

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: url || null })
    .eq("id", user.id);

  if (error) return fail(describeDatabaseError(error));

  revalidatePath("/", "layout");
  return ok(undefined);
}

/**
 * Reminder preferences.
 *
 * RLS restricts every statement here to the caller's own row, and database
 * constraints refuse a channel switched on with nowhere to send to, so this
 * only has to translate the failure into something readable.
 */
export async function updateNotificationPreferences(input: {
  emailEnabled: boolean;
  telegramEnabled: boolean;
  whatsappEnabled: boolean;
  whatsappNumber: string;
  remindAssigned: boolean;
  remindDueSoon: boolean;
  remindOverdue: boolean;
  remindFollowUp: boolean;
  dueSoonLeadHours: number;
}): Promise<ActionResult<void>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Your session expired. Please sign in again.");

  const number = input.whatsappNumber.trim();
  if (input.whatsappEnabled && !/^\+[1-9]\d{6,14}$/.test(number)) {
    return fail(
      "Enter your WhatsApp number in international format, e.g. +971501234567.",
    );
  }

  const lead = Math.min(168, Math.max(1, Math.round(input.dueSoonLeadHours)));

  const { error } = await supabase
    .from("notification_preferences")
    .update({
      email_enabled: input.emailEnabled,
      telegram_enabled: input.telegramEnabled,
      whatsapp_enabled: input.whatsappEnabled,
      whatsapp_number: number || null,
      remind_assigned: input.remindAssigned,
      remind_due_soon: input.remindDueSoon,
      remind_overdue: input.remindOverdue,
      remind_follow_up: input.remindFollowUp,
      due_soon_lead_hours: lead,
    })
    .eq("user_id", user.id);

  if (error) {
    if (error.code === "23514") {
      return fail(
        "A channel cannot be switched on without somewhere to send to. Link Telegram or add a WhatsApp number first.",
      );
    }
    return fail(describeDatabaseError(error));
  }

  revalidatePath("/profile");
  return ok(undefined);
}

/**
 * Issue a single-use code for linking Telegram.
 *
 * The chat id can only come from Telegram itself, so the user sends this code
 * to the bot and the webhook records which chat replied.
 */
export async function createTelegramLinkCode(): Promise<
  ActionResult<{ code: string }>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Your session expired. Please sign in again.");

  // Unambiguous alphabet: no O/0 or I/1 to mistype when copying by hand.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = Array.from(
    { length: 8 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join("");

  const { error } = await supabase
    .from("notification_preferences")
    .update({ telegram_link_code: code })
    .eq("user_id", user.id);

  if (error) return fail(describeDatabaseError(error));

  revalidatePath("/profile");
  return ok({ code });
}

/** Disconnect Telegram and stop sending there. */
export async function unlinkTelegram(): Promise<ActionResult<void>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Your session expired. Please sign in again.");

  const { error } = await supabase
    .from("notification_preferences")
    .update({
      telegram_enabled: false,
      telegram_chat_id: null,
      telegram_link_code: null,
    })
    .eq("user_id", user.id);

  if (error) return fail(describeDatabaseError(error));

  revalidatePath("/profile");
  return ok(undefined);
}
