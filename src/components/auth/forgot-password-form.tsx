"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormError } from "@/components/auth/field-error";
import { requestPasswordReset } from "@/lib/auth/actions";
import type { ActionResult } from "@/lib/action-result";

export function ForgotPasswordForm() {
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult<{
    sentTo: string;
  }> | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setResult(null);
    setResult(await requestPasswordReset(null, new FormData(event.currentTarget)));
    setPending(false);
  }

  // Deliberately the same screen whether or not that address has an account.
  if (result?.ok) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/50 px-4 py-6 text-center">
          <span className="flex size-11 items-center justify-center rounded-full border border-border bg-card">
            <MailCheck className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="font-medium">Check your email</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              If an account exists for{" "}
              <span className="font-medium text-foreground">{result.data.sentTo}</span>,
              a link to set a new password is on its way. It expires in an hour.
            </p>
          </div>
        </div>

        <Button asChild variant="outline">
          <Link href="/login">
            <ArrowLeft className="rtl:-scale-x-100" />
            Back to sign in
          </Link>
        </Button>
      </div>
    );
  }

  const errors = result?.ok === false ? result.fieldErrors : undefined;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormError message={result?.ok === false ? result.error : null} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@almailgroup.com"
          required
          autoFocus
          aria-invalid={Boolean(errors?.email)}
        />
        <FieldError message={errors?.email} />
      </div>

      <Button type="submit" disabled={pending} className="mt-1">
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Sending" : "Email me a link"}
      </Button>

      <Button asChild variant="ghost" size="sm">
        <Link href="/login">
          <ArrowLeft className="rtl:-scale-x-100" />
          Back to sign in
        </Link>
      </Button>
    </form>
  );
}
