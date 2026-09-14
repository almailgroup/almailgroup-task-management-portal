"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ListFilter } from "lucide-react";
import { toast } from "sonner";

import { BulkActionBar } from "@/components/tasks/bulk-action-bar";
import { RescheduleMenu } from "@/components/tasks/reschedule-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { deleteTask, moveTask } from "@/lib/data/task-actions";
import type { TaskStatus } from "@/lib/supabase/database.types";
import {
  AssigneeStack,
  DueDate,
  PriorityIndicator,
} from "@/components/tasks/task-meta";
import { StatusBadge } from "@/components/tasks/task-meta";
import { statusMeta } from "@/lib/constants";
import { cn } from "@/lib/utils";
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
  projectId = null,
  canComplete = false,
  canDelete = false,
  projectName,
  canReschedule = false,
  emptyState,
}: {
  tasks: TaskWithAssignees[];
  onOpenTask: (task: TaskWithAssignees) => void;
  projectId?: string | null;
  /** Whether the viewer may move tasks into Done. */
  canComplete?: boolean;
  /** Whether the viewer may delete tasks. Members may not. */
  canDelete?: boolean;
  /**
   * Supplied by the cross-project views, which need to say which project a
   * task belongs to. Inside a single project it would be the same word on
   * every row, so it is left out there.
   */
  projectName?: (projectId: string | null) => string;
  /** Shows the quick date control on each row. Managers only. */
  canReschedule?: boolean;
  /** Overrides the default "no matches" panel. */
  emptyState?: React.ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  // Selecting is only offered to people who can act on a selection.
  const selectable = canComplete || canDelete;
  const visibleIds = React.useMemo(() => tasks.map((t) => t.id), [tasks]);

  // Drop anything that has filtered out from under the selection, so the
  // count never claims more than is on screen.
  React.useEffect(() => {
    setSelected((current) => {
      const next = new Set([...current].filter((id) => visibleIds.includes(id)));
      return next.size === current.size ? current : next;
    });
  }, [visibleIds]);

  const allSelected = tasks.length > 0 && selected.size === tasks.length;

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const chosen = () => tasks.filter((task) => selected.has(task.id));

  async function bulkMove(status: TaskStatus) {
    const batch = chosen();
    // Positions are spaced so the moved tasks keep their relative order at
    // the end of the target column.
    const results = await Promise.all(
      batch.map((task, index) =>
        moveTask(task.id, task.project_id ?? projectId, status, Date.now() + index),
      ),
    );
    const failed = results.filter((r) => !r.ok).length;
    report(batch.length - failed, failed, `Moved`, status);
    setSelected(new Set());
    router.refresh();
  }

  async function bulkDelete() {
    const batch = chosen();
    const results = await Promise.all(
      batch.map((task) => deleteTask(task.id, task.project_id ?? projectId)),
    );
    const failed = results.filter((r) => !r.ok).length;
    report(batch.length - failed, failed, "Deleted");
    setSelected(new Set());
    router.refresh();
  }

  function report(done: number, failed: number, verb: string, status?: TaskStatus) {
    const what = `${done} ${done === 1 ? "task" : "tasks"}`;
    if (done > 0) {
      toast.success(
        status ? `${verb} ${what} to ${statusLabel(status)}` : `${verb} ${what}`,
      );
    }
    // Partial failure is the interesting case: RLS may refuse some of a
    // selection and allow the rest, and silence there would be a lie.
    if (failed > 0) {
      toast.error(
        `${failed} ${failed === 1 ? "task" : "tasks"} could not be changed — you may not have permission.`,
      );
    }
  }
  if (tasks.length === 0) {
    return (
      emptyState ?? (
        <EmptyState
          icon={<ListFilter />}
          title="No tasks match these filters"
          description="Try a different status or priority, or clear the filters to see everything."
        />
      )
    );
  }

  return (
    <>
      {/* Desktop */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)] md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-left">
              {selectable && (
                <Th className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={() =>
                      setSelected(allSelected ? new Set() : new Set(visibleIds))
                    }
                    aria-label={allSelected ? "Clear selection" : "Select all tasks"}
                  />
                </Th>
              )}
              <Th className={projectName ? "w-[34%]" : "w-[45%]"}>Task</Th>
              {projectName && <Th>Project</Th>}
              <Th>Status</Th>
              <Th>Priority</Th>
              <Th>Due</Th>
              <Th className="text-right">Assignees</Th>
              {canReschedule && <Th className="w-10 text-right sr-only">Move date</Th>}
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr
                key={task.id}
                onClick={() => onOpenTask(task)}
                className={cn(
                  "cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-accent/50",
                  selected.has(task.id) && "bg-accent/60",
                )}
              >
                {selectable && (
                  <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(task.id)}
                      onCheckedChange={() => toggle(task.id)}
                      aria-label={`Select ${task.title}`}
                    />
                  </td>
                )}
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
                {projectName && (
                  <td className="px-4 py-3.5 text-muted-foreground">
                    {projectName(task.project_id)}
                  </td>
                )}
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
                {canReschedule && (
                  <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end">
                      <RescheduleMenu task={task} compact />
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*
       * Mobile. The checkbox and the reschedule menu used to flank the card,
       * which cost a quarter of a phone's width and left every title wrapping
       * early. They now sit inside it, on a footer line, and the card itself
       * is the tap target — a full-size overlay rather than a wrapper, since
       * a <button> may not contain other controls.
       */}
      <ul className="flex flex-col gap-2 md:hidden">
        {tasks.map((task) => {
          const isSelected = selected.has(task.id);

          return (
            <li
              key={task.id}
              className={cn(
                "lift relative rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]",
                isSelected && "border-foreground/40 bg-accent/50",
              )}
            >
              <button
                type="button"
                onClick={() => onOpenTask(task)}
                aria-label={`Open ${task.title}`}
                className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />

              {/* Passes taps through to the overlay behind it. */}
              <div className="pointer-events-none relative">
                <p className="text-[0.9375rem] font-medium leading-snug">
                  {task.title}
                </p>
                {projectName && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {projectName(task.project_id)}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <StatusBadge status={task.status} />
                  <PriorityIndicator priority={task.priority} showLabel />
                  <DueDate dueAt={task.due_at} status={task.status} />
                  <span className="ml-auto">
                    <AssigneeStack assignees={task.assignees} max={3} />
                  </span>
                </div>
              </div>

              {(selectable || canReschedule) && (
                <div className="relative mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
                  {selectable ? (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggle(task.id)}
                        aria-label={`Select ${task.title}`}
                      />
                      Select
                    </label>
                  ) : (
                    <span />
                  )}
                  {canReschedule && <RescheduleMenu task={task} compact />}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {selectable && (
        <BulkActionBar
          count={selected.size}
          canComplete={canComplete}
          onMove={bulkMove}
          onDelete={bulkDelete}
          onClear={() => setSelected(new Set())}
        />
      )}
    </>
  );
}

function statusLabel(status: TaskStatus): string {
  return statusMeta(status).label;
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
