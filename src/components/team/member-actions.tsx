"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OneTimePassword } from "@/components/team/one-time-password";
import { resetMemberPassword } from "@/lib/data/team-actions";

/**
 * Per-member admin actions. Currently one: issue a new password.
 *
 * Somebody locked out has two other routes, and both can fail them — the
 * emailed reset link depends on the mail quota and on their still having the
 * inbox, and waiting for either helps nobody who needs to work today. An admin
 * can hand them a new password the same way they handed them the first one.
 *
 * It is temporary by construction: the account is flagged, so their next sign
 * in asks them to choose their own, and the admin never learns what it becomes.
 */
export function MemberActions({
  userId,
  name,
  configured,
}: {
  userId: string;
  /** Shown in the confirmation, so nobody resets the wrong person. */
  name: string;
  /** Whether the server has the key these actions need. */
  configured: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [issued, setIssued] = React.useState<{
    email: string;
    password: string;
  } | null>(null);

  async function reset() {
    setPending(true);
    const outcome = await resetMemberPassword(userId);
    setPending(false);
    setConfirming(false);

    if (!outcome.ok) {
      toast.error(outcome.error);
      return;
    }

    setIssued(outcome.data);
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${name}`}
            disabled={pending}
          >
            {pending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={!configured}
            onSelect={(event) => {
              event.preventDefault();
              setConfirming(true);
            }}
          >
            <KeyRound />
            Reset password
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Reset this password?"
        description={
          <>
            {name}&rsquo;s current password stops working immediately, and you
            get a one-time password to pass on. They choose their own the next
            time they sign in.
          </>
        }
        confirmLabel="Reset password"
        onConfirm={reset}
      />

      <Dialog
        open={issued !== null}
        onOpenChange={(open) => {
          if (!open) setIssued(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New password for {name}</DialogTitle>
            <DialogDescription>
              Nothing was emailed. Pass this on however you normally would.
            </DialogDescription>
          </DialogHeader>

          {issued && (
            <OneTimePassword email={issued.email} password={issued.password} />
          )}

          <div className="flex justify-end">
            <Button size="sm" onClick={() => setIssued(null)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
