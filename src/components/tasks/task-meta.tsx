import { CalendarDays, Clock3 } from "lucide-react";

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
  const urgent = priority === "urgent";

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
              bar <= meta.weight
                ? urgent
                  ? "bg-warning-marker"
                  : "bg-foreground"
                : "bg-border",
            )}
          />
        ))}
      </span>
      <span
        className={
          showLabel
            ? cn("text-xs", urgent ? "font-medium text-warning" : "text-muted-foreground")
            : "sr-only"
        }
      >
        {meta.label}
      </span>
    </span>
  );
}

/** Formats a yyyy-mm-dd date, marking anything overdue on an unfinished task. */
export function DueDate({
  dueAt,
  status,
  className,
}: {
  dueAt: string | null;
  status: TaskStatus;
  className?: string;
}) {
  if (!dueAt) return null;

  const overdue = isOverdue(dueAt, status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        overdue
          // The one place colour is allowed. A dotted underline was easy to
          // scan straight past on a board full of dates.
          ? "rounded-full border border-warning-border bg-warning-surface px-2 py-0.5 font-semibold text-warning"
          : "text-muted-foreground",
        className,
      )}
      title={overdue ? "Overdue" : "Due date"}
    >
      <CalendarDays className="size-3" />
      {formatDateTime(dueAt)}
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
 * Who opened this task and when.
 *
 * `creator` is resolved from the team roster rather than joined onto the task:
 * every signed-in user can read every profile, so the lookup always succeeds
 * for an account that still exists. A null creator means the account was
 * removed — created_by is ON DELETE SET NULL — and the timestamp still stands.
 */
export function TaskProvenance({
  createdAt,
  creator,
}: {
  createdAt: string;
  creator: Profile | null;
}) {
  const name = creator?.full_name ?? creator?.email ?? null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <Avatar className="size-5">
          {creator?.avatar_url && <AvatarImage src={creator.avatar_url} alt="" />}
          <AvatarFallback className="text-[9px]">
            {initialsFrom(creator?.full_name, creator?.email)}
          </AvatarFallback>
        </Avatar>
        <span className="truncate">
          Created by{" "}
          {name ? (
            <span className="font-medium text-foreground">{name}</span>
          ) : (
            <span className="italic">a removed account</span>
          )}
          {creator?.job_title && <> · {creator.job_title}</>}
        </span>
      </span>

      <span className="inline-flex items-center gap-1.5">
        <Clock3 className="size-3.5 shrink-0" />
        <time dateTime={createdAt} title={new Date(createdAt).toLocaleString()}>
          {formatDateTime(createdAt)}
        </time>
      </span>
    </div>
  );
}

/**
 * A task is overdue once its due instant has passed and the work is not done.
 *
 * Now that due dates carry a time of day this is a plain instant comparison,
 * which is both simpler and more accurate than the calendar-date check it
 * replaces.
 */
export function isOverdue(dueAt: string | null, status: TaskStatus): boolean {
  if (!dueAt || status === "done") return false;
  return new Date(dueAt).getTime() < Date.now();
}

/** True when the due instant falls on the viewer's local calendar today. */
export function isDueToday(dueAt: string | null): boolean {
  if (!dueAt) return false;
  const due = new Date(dueAt);
  const now = new Date();
  return (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  );
}

/**
 * Date and time in the viewer's own timezone. The year is shown only when it
 * differs from the current one, to keep the board compact.
 */
export function formatDateTime(value: string): string {
  const date = new Date(value);
  const sameYear = date.getFullYear() === new Date().getFullYear();

  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

