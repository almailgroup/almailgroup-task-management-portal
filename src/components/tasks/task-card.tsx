"use client";

import * as React from "react";
import { MessageSquare } from "lucide-react";

import {
  AssigneeStack,
  DueDate,
  PriorityIndicator,
} from "@/components/tasks/task-meta";
import { cn } from "@/lib/utils";
import type { TaskWithAssignees } from "@/lib/supabase/database.types";

/**
 * Kanban card. Compact by design — title, priority ramp, due date, assignees —
 * with everything else living in the task modal.
 */
export const TaskCard = React.forwardRef<
  HTMLDivElement,
  {
    task: TaskWithAssignees;
    onOpen?: () => void;
    dragging?: boolean;
    className?: string;
  } & React.HTMLAttributes<HTMLDivElement>
>(function TaskCard({ task, onOpen, dragging, className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "group rounded-md border border-border bg-card p-2.5 transition-colors",
        "hover:border-foreground/25",
        dragging && "opacity-40",
        className,
      )}
      {...props}
    >
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left focus-visible:outline-none"
      >
        <p className="text-sm font-medium leading-snug">{task.title}</p>
      </button>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <PriorityIndicator priority={task.priority} />
          <DueDate dueAt={task.due_at} status={task.status} />
        </div>
        <AssigneeStack assignees={task.assignees} max={2} />
      </div>
    </div>
  );
});

/** Screen-reader hint describing how to move a card with the keyboard. */
export function DragInstructions() {
  return (
    <p className="sr-only" id="kanban-drag-instructions">
      Press space or enter to pick up a task, use the arrow keys to move it
      between columns, then press space or enter again to drop it.
    </p>
  );
}

export { MessageSquare };
