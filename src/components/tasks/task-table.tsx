"use client";

import * as React from "react";
import { ListFilter } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import {
  AssigneeStack,
  DueDate,
  PriorityIndicator,
} from "@/components/tasks/task-meta";
import { StatusBadge } from "@/components/tasks/task-meta";
import type { TaskWithAssignees } from "@/lib/supabase/database.types";

/**
 * Filterable list view.
 *
 * A real <table> on desktop for scannability and correct semantics; stacked
 * rows below `md`, where a four-column table would be unreadable.
 */
export function TaskTable({
  tasks,
  onOpenTask,
}: {
  tasks: TaskWithAssignees[];
  onOpenTask: (task: TaskWithAssignees) => void;
}) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<ListFilter />}
        title="No tasks match these filters"
        description="Try a different status or priority, or clear the filters to see everything."
      />
    );
  }

  return (
    <>
      {/* Desktop */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)] md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-left">
              <Th className="w-[45%]">Task</Th>
              <Th>Status</Th>
              <Th>Priority</Th>
              <Th>Due</Th>
              <Th className="text-right">Assignees</Th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr
                key={task.id}
                onClick={() => onOpenTask(task)}
                className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-accent/50"
              >
                <td className="px-4 py-3.5">
                  <button
                    type="button"
                    className="text-left font-medium focus-visible:outline-none"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenTask(task);
                    }}
                  >
                    {task.title}
                  </button>
                </td>
                <td className="px-4 py-3.5">
                  <StatusBadge status={task.status} />
                </td>
                <td className="px-4 py-3.5">
                  <PriorityIndicator priority={task.priority} showLabel />
                </td>
                <td className="px-4 py-3.5">
                  <DueDate dueAt={task.due_at} status={task.status} />
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex justify-end">
                    <AssigneeStack assignees={task.assignees} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <ul className="flex flex-col gap-2 md:hidden">
        {tasks.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => onOpenTask(task)}
              className="lift w-full rounded-xl border border-border bg-card p-4 text-left shadow-[var(--shadow-sm)] hover:border-foreground/30"
            >
              <p className="text-[0.9375rem] font-medium leading-snug">{task.title}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={task.status} />
                <PriorityIndicator priority={task.priority} showLabel />
                <DueDate dueAt={task.due_at} status={task.status} />
                <span className="ml-auto">
                  <AssigneeStack assignees={task.assignees} max={3} />
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-xs font-medium text-muted-foreground ${className ?? ""}`}
    >
      {children}
    </th>
  );
}
