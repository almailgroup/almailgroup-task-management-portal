"use client";

import * as React from "react";
import { PhoneCall } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { RescheduleMenu } from "@/components/tasks/reschedule-menu";
import {
  AssigneeStack,
  StatusBadge,
} from "@/components/tasks/task-meta";
import { formatDateTime } from "@/lib/dates";
import { relativeDay } from "@/lib/dates";
import { EmptyState } from "@/components/ui/empty-state";
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
      <EmptyState
        icon={<PhoneCall />}
        title="Nothing to follow up"
        description={
          canManage
            ? "Open a task and set a follow-up date to have it appear here."
            : "Your manager has not scheduled any follow-ups on your tasks."
        }
      />
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
              "flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-xl border bg-card p-4 shadow-[var(--shadow-sm)]",
              overdue ? "border-foreground/30" : "border-border",
            )}
          >
            <button
              type="button"
              onClick={() => onOpenTask(task)}
              className="w-full min-w-0 text-start focus-visible:outline-none sm:w-auto sm:flex-1"
            >
              <span className="block truncate text-[0.9375rem] font-medium">
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
