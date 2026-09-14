import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthFormShell } from "@/components/auth/auth-form-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { needsOwnPassword } from "@/lib/data/queries";

export const metadata: Metadata = { title: "Choose your password" };

/**
 * First sign-in for an account an admin created.
 *
 * They arrive holding a password somebody else picked and wrote down, which is
 * exactly as private as wherever it was written. The app asks for a new one
 * before anything else, and the layout of the signed-in app sends them here
 * until they have chosen it.
 *
 * Behind the middleware like every other private route, and outside the app
 * shell so the redirect that brings people here cannot loop.
 */
export default async function SetPasswordPage() {
  // Someone who has already chosen has no business on this page.
  if (!(await needsOwnPassword())) redirect("/dashboard");

  return (
    <AuthFormShell
      title="Choose your password"
      subtitle="You signed in with a one-time password. Pick your own to finish setting up your account."
      footer={{ prompt: "Not you?", linkLabel: "Sign out", href: "/auth/signout" }}
    >
      <ResetPasswordForm />
    </AuthFormShell>
  );
}
