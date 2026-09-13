import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthFormShell } from "@/components/auth/auth-form-shell";
import { LoginForm } from "@/components/auth/login-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthFormShell
      title="Sign in"
      subtitle="Access your Almailgroup workspace."
      footer={{
        prompt: "No account yet?",
        linkLabel: "Create one",
        href: "/register",
      }}
    >
      {/* LoginForm reads search params, so it needs a Suspense boundary. */}
      <Suspense fallback={<Skeleton className="h-56 w-full" />}>
        <LoginForm />
      </Suspense>
    </AuthFormShell>
  );
}
