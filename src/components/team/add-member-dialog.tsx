"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldError, FormError } from "@/components/auth/field-error";
import { USER_ROLES } from "@/lib/constants";
import { addTeamMember } from "@/lib/data/team-actions";
import type { ActionResult } from "@/lib/action-result";

type Created = { email: string; password: string };

/**
 * Admin-only: add somebody to the workspace without sending them anything.
 *
 * Sign-up depends on a confirmation email, and a Supabase project's built-in
 * mail service allows only a few an hour — which is why onboarding a team
 * through the sign-up form runs into "email rate limit exceeded". An account
 * made here is confirmed from the start and comes with a one-time password to
 * hand over.
 */
export function AddMemberDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult<Created> | null>(null);
  const [copied, setCopied] = React.useState(false);

  function reset() {
    setResult(null);
    setPending(false);
    setCopied(false);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setResult(null);

    const outcome = await addTeamMember(null, new FormData(event.currentTarget));
    setResult(outcome);
    setPending(false);

    if (outcome.ok) router.refresh();
  }

  async function copyPassword(password: string) {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      toast.success("Password copied");
    } catch {
      // Clipboard access can be refused; the password is on screen anyway.
      toast.error("Could not copy — select the password and copy it by hand.");
    }
  }

  const created = result?.ok ? result.data : null;
  const errors = result?.ok === false ? result.fieldErrors : undefined;

  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <UserPlus />
        Add teammate
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="max-w-md">
          {created ? (
            <>
              <DialogHeader>
                <DialogTitle>Account ready</DialogTitle>
                <DialogDescription>
                  Nothing was emailed. Pass these on however you normally would,
                  and ask them to change the password from their profile once
                  they are in.
                </DialogDescription>
              </DialogHeader>

              <dl className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-3.5">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Email</dt>
                  <dd className="break-all font-mono text-sm">{created.email}</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">
                    One-time password
                  </dt>
                  <dd className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 break-all font-mono text-sm">
                      {created.password}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      onClick={() => copyPassword(created.password)}
                      aria-label="Copy password"
                    >
                      {copied ? <Check /> : <Copy />}
                    </Button>
                  </dd>
                </div>
              </dl>

              <p className="text-xs leading-relaxed text-muted-foreground">
                This is the only time the password is shown. If it is lost, they
                can reset it from the sign-in page — or you can add them again.
              </p>

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={reset}>
                  Add another
                </Button>
                <Button size="sm" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </div>
            </>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
              <DialogHeader>
                <DialogTitle>Add a teammate</DialogTitle>
                <DialogDescription>
                  Creates a working account straight away. No confirmation email
                  is sent, so this works however busy the mail quota is.
                </DialogDescription>
              </DialogHeader>

              <FormError message={result?.ok === false ? result.error : null} />

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="member-name">Full name</Label>
                <Input
                  id="member-name"
                  name="fullName"
                  autoComplete="off"
                  placeholder="Koshy John"
                  required
                  aria-invalid={Boolean(errors?.fullName)}
                />
                <FieldError message={errors?.fullName} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="member-email">Email</Label>
                <Input
                  id="member-email"
                  name="email"
                  type="email"
                  autoComplete="off"
                  placeholder="name@almailgroup.com"
                  required
                  aria-invalid={Boolean(errors?.email)}
                />
                <FieldError message={errors?.email} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="member-role">Role</Label>
                <Select name="role" defaultValue="member">
                  <SelectTrigger id="member-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {USER_ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={errors?.role} />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={pending}>
                  {pending && <Loader2 className="animate-spin" />}
                  {pending ? "Creating" : "Create account"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
