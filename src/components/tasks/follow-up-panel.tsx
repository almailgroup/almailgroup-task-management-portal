"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, PhoneCall, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setFollowUp } from "@/lib/data/task-actions";
import {
  atHourToday,
  isoFromLocalInput,
  nextMonday,
  relativeDay,
  toLocalInput,
} from "@/lib/dates";
import { formatDateTime } from "@/components/tasks/task-meta";
import type { TaskWithAssignees } from "@/lib/supabase/database.types";

/**
 * When to chase this task, and what to chase.
 *
 * Read-only for members: a follow-up is a planning decision, and the database
 * refuses the write anyway, so the form is simply not offered.
 */
export function FollowUpPanel({
  task,
  canManage,
}: {
  task: TaskWithAssignees;
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [when, setWhen] = React.useState(toLocalInput(task.follow_up_at));
  const [note, setNote] = React.useState(task.follow_up_note ?? "");
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    setWhen(toLocalInput(task.follow_up_at));
    setNote(task.follow_up_note ?? "");
  }, [task.follow_up_at, task.follow_up_note]);

  async function save() {
    if (!when) {
      toast.error("Pick a date and time to follow up.");
      return;
    }
    // Wall-clock in, absolute instant out — the server cannot do this
    // conversion, it does not know the viewer's timezone.
    const followUpAt = isoFromLocalInput(when);
    if (!followUpAt) {
      toast.error("Pick a valid date and time to follow up.");
      return;
    }

    setPending(true);
    const outcome = await setFollowUp(task.id, task.project_id, {
      followUpAt,
      note,
    });
    setPending(false);

    if (!outcome.ok) {
      toast.error(outcome.error);
      return;
    }
    toast.success("Follow-up set");
    setEditing(false);
    router.refresh();
  }

  async function clear() {
    setPending(true);
    const outcome = await setFollowUp(task.id, task.project_id, null);
    setPending(false);

    if (!outcome.ok) {
      toast.error(outcome.error);
      return;
    }
    toast.success("Follow-up cleared");
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border px-2.5 py-2">
        <PhoneCall className="size-3.5 shrink-0 text-muted-foreground" />

        {task.follow_up_at ? (
          <span className="min-w-0 flex-1">
            <span className="block text-sm">
              Follow up {relativeDay(task.follow_up_at)}
              <span className="ml-1.5 text-xs text-muted-foreground">
                {formatDateTime(task.follow_up_at)}
              </span>
            </span>
            {task.follow_up_note && (
              <span className="block text-xs text-muted-foreground">
                {task.follow_up_note}
              </span>
            )}
          </span>
        ) : (
          <span className="flex-1 text-sm text-muted-foreground">
            No follow-up set.
          </span>
        )}

        {canManage && (
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              {task.follow_up_at ? "Change" : "Set follow-up"}
            </Button>
            {task.follow_up_at && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={clear}
                disabled={pending}
                aria-label="Clear follow-up"
              >
                {pending ? <Loader2 className="animate-spin" /> : <X />}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-border p-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="followUpAt">Follow up on</Label>
        <Input
          id="followUpAt"
          type="datetime-local"
          value={when}
          onChange={(event) => setWhen(event.target.value)}
          autoFocus
        />
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "Tomorrow", value: () => atHourToday(9, 1) },
            { label: "In 3 days", value: () => atHourToday(9, 3) },
            { label: "Next Monday", value: () => nextMonday(9) },
            { label: "In a week", value: () => atHourToday(9, 7) },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setWhen(toLocalInput(option.value()))}
              className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="followUpNote">What to chase</Label>
        <Input
          id="followUpNote"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Call the supplier about delivery"
          maxLength={500}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(false)}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save follow-up
        </Button>
      </div>
    </div>
  );
}
