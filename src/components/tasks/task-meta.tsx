import { CalendarDays } from "lucide-react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { initialsFrom } from "@/lib/initials";
import { Badge } from "@/components/ui/badge";
import { priorityMeta, statusMeta } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type {
  Profile,
  TaskPriority,
  TaskStatus,
} from "@/lib/supabase/database.types";

/** Status pill. Weight, not hue, carries the meaning. */
export function StatusBadge({ status }: { status: TaskStatus }) {
  const meta = statusMeta(status);
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

/**
 * Four-bar severity ramp. Colourless by design: filled bars count up with
 * priority, and the label is exposed to assistive tech.
 */
export function PriorityIndicator({
  priority,
  showLabel = false,
}: {
  priority: TaskPriority;
  showLabel?: boolean;
}) {
  const meta = priorityMeta(priority);

  return (
    <span className="inline-flex items-center gap-1.5" title={`${meta.label} priority`}>
      <span className="flex items-end gap-0.5" aria-hidden>
        {[1, 2, 3, 4].map((bar) => (
          <span
            key={bar}
            className={cn(
              "w-0.5 rounded-[1px]",
              bar === 1 && "h-1.5",
              bar === 2 && "h-2",
              bar === 3 && "h-2.5",
              bar === 4 && "h-3",
              bar <= meta.weight ? "bg-foreground" : "bg-border",
            )}
          />
        ))}
      </span>
      <span className={showLabel ? "text-xs text-muted-foreground" : "sr-only"}>
        {meta.label}
      </span>
    </span>
  );
}

/** Formats a yyyy-mm-dd date, marking anything overdue on an unfinished task. */
export function DueDate({
  dueDate,
  status,
  className,
}: {
  dueDate: string | null;
  status: TaskStatus;
  className?: string;
}) {
  if (!dueDate) return null;

  const overdue = isOverdue(dueDate, status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        overdue
          ? "font-medium text-foreground underline decoration-dotted underline-offset-2"
          : "text-muted-foreground",
        className,
      )}
      title={overdue ? "Overdue" : "Due date"}
    >
      <CalendarDays className="size-3" />
      {formatDate(dueDate)}
      {overdue && <span className="sr-only">(overdue)</span>}
    </span>
  );
}

/** Overlapping avatar stack, capped so long assignee lists stay compact. */
export function AssigneeStack({
  assignees,
  max = 3,
}: {
  assignees: Profile[];
  max?: number;
}) {
  if (assignees.length === 0) return null;

  const shown = assignees.slice(0, max);
  const overflow = assignees.length - shown.length;

  return (
    <span className="flex items-center -space-x-1.5">
      {shown.map((person) => (
        <Avatar
          key={person.id}
          className="size-5 ring-1 ring-background"
          title={person.full_name ?? person.email}
        >
          {person.avatar_url && <AvatarImage src={person.avatar_url} alt="" />}
          <AvatarFallback className="text-[9px]">
            {initialsFrom(person.full_name, person.email)}
          </AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && (
        <span className="flex size-5 items-center justify-center rounded-full border border-border bg-muted text-[9px] font-medium text-muted-foreground ring-1 ring-background">
          +{overflow}
        </span>
      )}
    </span>
  );
}

/**
 * A task is overdue when its due date is strictly before today and the work is
 * not finished. Compared as calendar dates so timezone offsets cannot make a
 * task due today look late.
 */
export function isOverdue(dueDate: string | null, status: TaskStatus): boolean {
  if (!dueDate || status === "done") return false;
  return dueDate < todayIso();
}

/** Today as yyyy-mm-dd in the viewer's own timezone. */
export function todayIso(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function formatDate(value: string): string {
  // Parsed as UTC midday to keep the rendered day stable across timezones.
  const date = new Date(`${value}T12:00:00Z`);
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year:
      date.getUTCFullYear() === new Date().getUTCFullYear()
        ? undefined
        : "numeric",
  });
}
