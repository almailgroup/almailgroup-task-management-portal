"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";

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
import { OneTimePassword } from "@/components/team/one-time-password";
import { USER_ROLES } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/client";
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
export function AddMemberDialog({ configured }: { configured: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<ActionResult<Created> | null>(null);

  function reset() {
    setResult(null);
    setPending(false);
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

  const created = result?.ok ? result.data : null;
  const errors = result?.ok === false ? result.fieldErrors : undefined;

  return (
    <>
      {/* A disabled button with nothing to explain it is a dead end, and a
          tooltip is no use on a phone, so the reason is on the page. */}
      <div className="flex flex-col items-end gap-1">
        <Button
          size="sm"
          onClick={() => {
            reset();
            setOpen(true);
          }}
          disabled={!configured}
        >
          <UserPlus />
          Add teammate
        </Button>
        {!configured && (
          <p className="max-w-[15rem] text-end text-xs leading-relaxed text-muted-foreground">
            Needs <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> in
            the server environment.
          </p>
        )}
      </div>

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
                  Nothing was emailed. Pass these on however you normally would
                  — the first time they sign in, the app asks them to choose a
                  password of their own.
                </DialogDescription>
              </DialogHeader>

              <OneTimePassword
                email={created.email}
                password={created.password}
              />

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
                        {t(role.label)}
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
