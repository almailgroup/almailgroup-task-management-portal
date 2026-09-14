"use client";

import * as React from "react";
import { MessageSquare, Timer } from "lucide-react";

import {
  AssigneeStack,
  DueDate,
  PriorityIndicator,
} from "@/components/tasks/task-meta";
import { compactAge, formatElapsed } from "@/lib/dates";
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
        "group lift rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]",
        "hover:border-foreground/30",
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

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <PriorityIndicator priority={task.priority} />
        <DueDate dueAt={task.due_at} status={task.status} />
        <ElapsedSinceCreated createdAt={task.created_at} />
        <span className="ml-auto">
          <AssigneeStack assignees={task.assignees} max={2} />
        </span>
      </div>
    </div>
  );
});

/**
 * How long the task has been open.
 *
 * Shown compactly — "3d" — and folded onto the meta row rather than given a
 * divider and a line of its own: it is context, not a headline. The exact
 * hh:mm:ss and the creation timestamp are in the tooltip.
 *
 * Renders a placeholder before hydration rather than nothing, so the card
 * does not change width the moment the clock starts.
 */
function ElapsedSinceCreated({ createdAt }: { createdAt: string }) {
  const now = useNow();

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground"
      // Formatted with the viewer's locale, so it waits for hydration too.
      title={
        now === null
          ? undefined
          : `Open ${formatElapsed(createdAt, now)} · created ${new Date(createdAt).toLocaleString()}`
      }
    >
      <Timer className="size-3 shrink-0" />
      {now === null ? "—" : compactAge(createdAt, now)}
      <span className="sr-only">since this task was created</span>
    </span>
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
