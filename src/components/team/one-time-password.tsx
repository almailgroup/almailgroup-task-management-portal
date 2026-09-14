"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * The credentials an admin has to pass on, shown once.
 *
 * Used both when an account is created and when its password is reset, so the
 * two read identically — including the part that matters most, which is that
 * this is the only time the password appears.
 */
export function OneTimePassword({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      toast.success("Password copied");
    } catch {
      // Clipboard access can be refused; the password is on screen anyway.
      toast.error("Could not copy — select the password and copy it by hand.");
    }
  }

  return (
    <>
      <dl className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-3.5">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Email</dt>
          <dd className="break-all font-mono text-sm">{email}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">One-time password</dt>
          <dd className="flex items-center gap-2">
            <span className="min-w-0 flex-1 break-all font-mono text-sm">
              {password}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={copy}
              aria-label="Copy password"
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </dd>
        </div>
      </dl>

      <p className="text-xs leading-relaxed text-muted-foreground">
        This is the only time the password is shown. The first time they sign in
        with it, the app asks them to choose one of their own.
      </p>
    </>
  );
}
