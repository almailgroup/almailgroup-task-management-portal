import type { Metadata } from "next";

import { AuthFormShell } from "@/components/auth/auth-form-shell";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <AuthFormShell
      title="Create account"
      subtitle="Set up your Almailgroup workspace access."
      footer={{
        prompt: "Already have an account?",
        linkLabel: "Sign in",
        href: "/login",
      }}
    >
      <RegisterForm />
    </AuthFormShell>
  );
}
