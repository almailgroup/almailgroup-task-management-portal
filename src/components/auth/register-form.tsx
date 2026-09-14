"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/auth/password-input";
import { PasswordMeter } from "@/components/auth/password-meter";
import { FieldError, FormError } from "@/components/auth/field-error";
import { signUp } from "@/lib/auth/actions";
import { useI18n } from "@/lib/i18n/client";
import type { ActionResult } from "@/lib/action-result";

export function RegisterForm() {
  const router = useRouter();
  const { t } = useI18n();
  // Controlled purely so the strength meter can see what is being typed; the
  // value is still submitted by the form like any other field.
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult<{
    needsConfirmation: boolean;
  }> | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setResult(null);

    const formData = new FormData(event.currentTarget);
    const outcome = await signUp(null, formData);

    if (outcome.ok && !outcome.data.needsConfirmation) {
      router.replace("/dashboard");
      router.refresh();
      return;
    }

    setResult(outcome);
    setPending(false);
  }

  // Email confirmation is on: there is nothing more to do in this tab.
  if (result?.ok && result.data.needsConfirmation) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <MailCheck className="size-6" />
        <h2 className="text-base font-semibold tracking-tight">
          {t("auth.confirmTitle")}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("auth.confirmBody")}
        </p>
      </div>
    );
  }

  const errors = result?.ok === false ? result.fieldErrors : undefined;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormError message={result?.ok === false ? result.error : null} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">{t("auth.fullName")}</Label>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          placeholder={t("auth.fullNamePlaceholder")}
          required
          aria-invalid={Boolean(errors?.fullName)}
        />
        <FieldError message={errors?.fullName} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t("auth.email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder={t("auth.emailPlaceholder")}
          required
          aria-invalid={Boolean(errors?.email)}
        />
        <FieldError message={errors?.email} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t("auth.password")}</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          invalid={Boolean(errors?.password)}
        />
        <PasswordMeter value={password} />
        <FieldError message={errors?.password ?? undefined} />
      </div>

      <Button type="submit" disabled={pending} className="mt-1">
        {pending && <Loader2 className="animate-spin" />}
        {pending ? t("auth.creatingAccount") : t("auth.createAccount")}
      </Button>
    </form>
  );
}
