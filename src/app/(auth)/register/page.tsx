import type { Metadata } from "next";

import { AuthFormShell } from "@/components/auth/auth-form-shell";
import { getI18n } from "@/lib/i18n/server";
import { RegisterForm } from "@/components/auth/register-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("auth.register.title") };
}

export default async function RegisterPage() {
  const { t } = await getI18n();

  return (
    <AuthFormShell
      title={t("auth.register.title")}
      subtitle={t("auth.register.subtitle")}
      footer={{
        prompt: t("auth.register.prompt"),
        linkLabel: t("auth.signIn"),
        href: "/login",
      }}
    >
      <RegisterForm />
    </AuthFormShell>
  );
}
