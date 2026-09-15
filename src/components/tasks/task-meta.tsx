"use client";

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
import { formatDateTime, isOverdue } from "@/lib/dates";
import { useI18n } from "@/lib/i18n/client";
import type {
  Profile,
  TaskPriority,
  TaskStatus,
} from "@/lib/supabase/database.types";

/** Status pill. Weight, not hue, carries the meaning. */
export function StatusBadge({ status }: { status: TaskStatus }) {
  const { t } = useI18n();
  const meta = statusMeta(status);
  return <Badge variant={meta.variant}>{t(meta.label)}</Badge>;
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
  const { t } = useI18n();
  const meta = priorityMeta(priority);
  const urgent = priority === "urgent";
  const label = t(meta.label);

  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={t("meta.priorityTitle", { label })}
    >
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
        {label}
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
  const { t, tag, timeZone } = useI18n();
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
      title={overdue ? t("meta.overdue") : t("meta.dueDate")}
    >
      <CalendarDays className="size-3" />
      {formatDateTime(dueAt, tag, timeZone)}
      {overdue && <span className="sr-only">{t("meta.overdueSr")}</span>}
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
  const { t, tag, timeZone } = useI18n();
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
          {t("meta.createdBy")}{" "}
          {name ? (
            <span className="font-medium text-foreground">{name}</span>
          ) : (
            <span className="italic">{t("meta.removedAccount")}</span>
          )}
          {creator?.job_title && <> · {creator.job_title}</>}
        </span>
      </span>

      <span className="inline-flex items-center gap-1.5">
        <Clock3 className="size-3.5 shrink-0" />
        <time
          dateTime={createdAt}
          title={new Date(createdAt).toLocaleString(tag, { timeZone })}
        >
          {formatDateTime(createdAt, tag, timeZone)}
        </time>
      </span>
    </div>
  );
}
