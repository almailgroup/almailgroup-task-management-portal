import type { Metadata } from "next";

import { AuthFormShell } from "@/components/auth/auth-form-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Set a new password" };

/**
 * Reached only from a password-reset email: the callback exchanges the link
 * for a session before forwarding here, so this page is behind the middleware
 * like any other signed-in route. Someone arriving without a valid link has no
 * session and is sent to sign in, which is the correct answer.
 */
export default function ResetPasswordPage() {
  return (
    <AuthFormShell
      title="Set a new password"
      subtitle="Choose something you have not used here before."
    >
      <ResetPasswordForm />
    </AuthFormShell>
  );
}
