import type { Metadata } from "next";

import { AuthFormShell } from "@/components/auth/auth-form-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthFormShell
      title="Reset your password"
      subtitle="We will email you a link to set a new one."
    >
      <ForgotPasswordForm />
    </AuthFormShell>
  );
}
