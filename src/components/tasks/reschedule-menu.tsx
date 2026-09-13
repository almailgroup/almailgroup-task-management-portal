"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { rescheduleTask } from "@/lib/data/task-actions";
import { quickDateOptions, relativeDay, toLocalInput } from "@/lib/dates";
import { formatDateTime } from "@/components/tasks/task-meta";
import type { TaskWithAssignees } from "@/lib/supabase/database.types";

/**
 * One-click rescheduling.
 *
 * Moving a due date is the commonest edit during a daily review, so it gets a
 * dedicated control instead of a trip through the full task form.
 */
export function RescheduleMenu({
  task,
  compact = false,
}: {
  task: TaskWithAssignees;
  /** Icon-only, for dense rows. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const [custom, setCustom] = React.useState("");

  async function apply(dueAt: string | null) {
    setPending(true);
    const outcome = await rescheduleTask(task.id, task.project_id, dueAt);
    setPending(false);

    if (!outcome.ok) {
      toast.error(outcome.error);
      return;
    }

    toast.success(
      dueAt ? `Moved to ${formatDateTime(dueAt)}` : "Due date cleared",
    );
    setPicking(false);
    router.refresh();
  }

  if (picking) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!custom) return;
          apply(new Date(custom).toISOString());
        }}
        className="flex items-center gap-1.5"
      >
        <Input
          type="datetime-local"
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          className="h-8 w-[13rem] text-xs"
          autoFocus
          aria-label="New due date and time"
        />
        <Button type="submit" size="sm" disabled={pending || !custom}>
          {pending && <Loader2 className="animate-spin" />}
          Move
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setPicking(false)}
          aria-label="Cancel"
        >
          <X />
        </Button>
      </form>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={compact ? "icon-sm" : "sm"}
          disabled={pending}
          aria-label="Reschedule"
          className={compact ? undefined : "gap-1.5 font-normal"}
        >
          {pending ? <Loader2 className="animate-spin" /> : <CalendarClock />}
          {!compact && (task.due_at ? relativeDay(task.due_at) : "No due date")}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Move due date</DropdownMenuLabel>

        {quickDateOptions().map((option) => (
          <DropdownMenuItem
            key={option.label}
            onSelect={() => apply(option.value())}
          >
            {option.label}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            setCustom(toLocalInput(task.due_at));
            setPicking(true);
          }}
        >
          Pick a date and time
        </DropdownMenuItem>

        {task.due_at && (
          <DropdownMenuItem onSelect={() => apply(null)}>
            Clear due date
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
