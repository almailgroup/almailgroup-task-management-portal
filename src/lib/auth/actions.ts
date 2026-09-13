"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  fail,
  fieldErrorsFrom,
  ok,
  type ActionResult,
} from "@/lib/action-result";
import { loginSchema, registerSchema } from "@/lib/validation";

/**
 * Only allow relative, single-slash paths as post-login redirects, so a crafted
 * `?next=https://evil.example` cannot turn sign-in into an open redirect.
 */
function safeRedirect(next: unknown): string {
  if (typeof next !== "string") return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export async function signIn(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return fail("Check the fields below.", fieldErrorsFrom(parsed.error.issues));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Deliberately vague: distinguishing "no such user" from "wrong password"
    // would let anyone enumerate which emails have accounts.
    return fail("Incorrect email or password.");
  }

  revalidatePath("/", "layout");
  return ok({ redirectTo: safeRedirect(formData.get("next")) });
}

export async function signUp(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return fail("Check the fields below.", fieldErrorsFrom(parsed.error.issues));
  }

  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Read by the handle_new_user trigger to populate profiles.full_name.
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return fail(error.message);
  }

  // With email confirmation enabled Supabase returns a user but no session.
  const needsConfirmation = Boolean(data.user) && !data.session;

  if (!needsConfirmation) {
    revalidatePath("/", "layout");
  }

  return ok({ needsConfirmation });
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
