"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  fail,
  fieldErrorsFrom,
  ok,
  type ActionResult,
} from "@/lib/action-result";
import {
  emailSchema,
  loginSchema,
  passwordSchema,
  registerSchema,
} from "@/lib/validation";

/**
 * Only allow relative, single-slash paths as post-login redirects, so a crafted
 * `?next=https://evil.example` cannot turn sign-in into an open redirect.
 */
function safeRedirect(next: unknown): string {
  if (typeof next !== "string") return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

/**
 * Where the links in our emails should point.
 *
 * Derived from the request first, and only then from NEXT_PUBLIC_SITE_URL.
 * The old fallback was a bare `http://localhost:3000`, which meant a single
 * missing environment variable in production sent every confirmation and
 * password-reset link to a machine the recipient does not have.
 */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (host) {
    const proto = headerList.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  return "http://localhost:3000";
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
  const origin = await siteOrigin();

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

/**
 * Send a password reset link.
 *
 * The result is the same whether or not the address has an account. Saying
 * "no account with that email" here would hand anyone a way to test which of
 * the company's addresses are registered, which is the same reason sign-in
 * refuses to say which half of the credentials was wrong.
 */
export async function requestPasswordReset(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ sentTo: string }>> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return fail("Check the field below.", { email: parsed.error.issues[0].message });
  }

  const supabase = await createClient();
  const origin = await siteOrigin();

  // The link lands on the callback, which exchanges it for a session and then
  // forwards to the page that asks for the new password.
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  // Deliberately not checking the error: a failure here is most often "no such
  // user", and reporting it would defeat the point.
  return ok({ sentTo: parsed.data });
}

/**
 * Set a new password for whoever the recovery link signed in.
 *
 * There is no "current password" field because there is no current password to
 * hand — the session came from the emailed link, and possessing it is the
 * proof. The session is what authorises this, so it cannot be used to change
 * anyone else's.
 */
export async function updatePassword(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<void>> {
  const password = passwordSchema.safeParse(formData.get("password"));
  if (!password.success) {
    return fail("Check the fields below.", {
      password: password.error.issues[0].message,
    });
  }

  if (formData.get("password") !== formData.get("confirm")) {
    return fail("Those passwords do not match.", {
      confirm: "Those passwords do not match.",
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail(
      "That link has expired. Ask for a new one and try again.",
    );
  }

  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return fail(error.message);

  revalidatePath("/", "layout");
  return ok(undefined);
}
