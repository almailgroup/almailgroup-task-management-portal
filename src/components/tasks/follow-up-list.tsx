"use client";

import * as React from "react";
import { PhoneCall } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { RescheduleMenu } from "@/components/tasks/reschedule-menu";
import {
  AssigneeStack,
  StatusBadge,
  formatDateTime,
} from "@/components/tasks/task-meta";
import { relativeDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { TaskWithAssignees } from "@/lib/supabase/database.types";

/**
 * The chase list: what needs following up, and when.
 *
 * Split into due and upcoming rather than one flat list, because the only
 * question being asked of this screen is "what do I need to chase now".
 */
export function FollowUpList({
  tasks,
  canManage,
  onOpenTask,
}: {
  tasks: TaskWithAssignees[];
  canManage: boolean;
  onOpenTask: (task: TaskWithAssignees) => void;
}) {
  const now = Date.now();
  const due = tasks.filter(
    (t) => t.follow_up_at && new Date(t.follow_up_at).getTime() <= now,
  );
  const upcoming = tasks.filter(
    (t) => t.follow_up_at && new Date(t.follow_up_at).getTime() > now,
  );

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center">
        <PhoneCall className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing to follow up.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {canManage
            ? "Open a task and set a follow-up date to have it appear here."
            : "Your manager has not scheduled any follow-ups on your tasks."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {due.length > 0 && (
        <Group
          title="Due to chase"
          tasks={due}
          overdue
          canManage={canManage}
          onOpenTask={onOpenTask}
        />
      )}
      {upcoming.length > 0 && (
        <Group
          title="Coming up"
          tasks={upcoming}
          canManage={canManage}
          onOpenTask={onOpenTask}
        />
      )}
    </div>
  );
}

function Group({
  title,
  tasks,
  overdue,
  canManage,
  onOpenTask,
}: {
  title: string;
  tasks: TaskWithAssignees[];
  overdue?: boolean;
  canManage: boolean;
  onOpenTask: (task: TaskWithAssignees) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-1.5 text-sm">
        {title}
        <span className="text-muted-foreground">{tasks.length}</span>
      </h2>

      <ul className="flex flex-col gap-2">
        {tasks.map((task) => (
          <li
            key={task.id}
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3",
              overdue ? "border-foreground/30" : "border-border",
            )}
          >
            <button
              type="button"
              onClick={() => onOpenTask(task)}
              className="min-w-0 flex-1 text-left focus-visible:outline-none"
            >
              <span className="block truncate text-sm font-medium">
                {task.title}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {task.follow_up_note ?? "No note"}
              </span>
            </button>

            <Badge variant={overdue ? "default" : "subtle"}>
              {task.follow_up_at ? relativeDay(task.follow_up_at) : ""}
            </Badge>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {task.follow_up_at ? formatDateTime(task.follow_up_at) : ""}
            </span>

            <StatusBadge status={task.status} />
            <AssigneeStack assignees={task.assignees} max={2} />
            {canManage && <RescheduleMenu task={task} compact />}
          </li>
        ))}
      </ul>
    </section>
  );
}
