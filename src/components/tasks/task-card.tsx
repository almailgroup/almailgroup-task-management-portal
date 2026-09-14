"use client";

import * as React from "react";
import { MessageSquare, Timer } from "lucide-react";

import {
  AssigneeStack,
  DueDate,
  PriorityIndicator,
} from "@/components/tasks/task-meta";
import { formatElapsed } from "@/lib/dates";
import { useNow } from "@/lib/use-now";
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
        "group rounded-lg border border-border bg-card p-3.5 shadow-[var(--shadow-xs)]",
        "transition-[border-color,box-shadow,opacity] duration-150",
        "hover:border-foreground/25 hover:shadow-[var(--shadow-sm)]",
        dragging && "opacity-40",
        className,
      )}
      {...props}
    >
      <button
        type="button"
        onClick={onOpen}
        // Negative margin cancels the padding, so the tappable area grows to a
        // thumb-friendly height on touch without changing the card's layout.
        className="w-full text-left focus-visible:outline-none pointer-coarse:-my-2 pointer-coarse:py-2"
      >
        <p className="text-[0.9375rem] font-medium leading-snug">{task.title}</p>
      </button>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <PriorityIndicator priority={task.priority} />
          <DueDate dueAt={task.due_at} status={task.status} />
        </div>
        <AssigneeStack assignees={task.assignees} max={2} />
      </div>

      <ElapsedSinceCreated createdAt={task.created_at} />
    </div>
  );
});

/**
 * How long the task has been open, ticking every second.
 *
 * Renders a fixed-width placeholder before hydration rather than nothing, so
 * the card does not change height the moment the timer starts.
 */
function ElapsedSinceCreated({ createdAt }: { createdAt: string }) {
  const now = useNow();

  return (
    <p
      className="mt-2.5 flex items-center gap-1.5 border-t border-border/60 pt-2 text-xs text-muted-foreground"
      // Formatted with the viewer's locale, so it waits for hydration too.
      title={now === null ? undefined : `Created ${new Date(createdAt).toLocaleString()}`}
    >
      <Timer className="size-3.5 shrink-0" />
      <span className="tabular-nums">
        {now === null ? "--:--:--" : formatElapsed(createdAt, now)}
      </span>
      <span className="sr-only">since this task was created</span>
    </p>
  );
}

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
