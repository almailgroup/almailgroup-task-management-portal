import { isDueToday, isOverdue } from "@/components/tasks/task-meta";
import type { TaskWithAssignees } from "@/lib/supabase/database.types";

/**
 * The buckets the dashboard links into.
 *
 * Defined once so a card's count and the page it opens can never disagree —
 * both sides run the same predicate over the same task list.
 */
export const TASK_FILTERS = [
  { value: "todo", label: "To Do", blurb: "Not started yet." },
  { value: "pending", label: "Pending", blurb: "Everything not yet done." },
  { value: "in_progress", label: "In Progress", blurb: "Being worked on." },
  { value: "in_review", label: "In Review", blurb: "Waiting on a review." },
  { value: "done", label: "Completed", blurb: "Finished and signed off." },
  { value: "due_today", label: "Due Today", blurb: "Unfinished and due today." },
  { value: "overdue", label: "Overdue", blurb: "Past due and still open." },
  { value: "all", label: "All tasks", blurb: "Everything you can see." },
] as const;

export type TaskFilter = (typeof TASK_FILTERS)[number]["value"];

export function isTaskFilter(value: string | undefined): value is TaskFilter {
  return TASK_FILTERS.some((filter) => filter.value === value);
}

export function filterLabel(filter: TaskFilter): string {
  return TASK_FILTERS.find((f) => f.value === filter)?.label ?? "Tasks";
}

export function filterBlurb(filter: TaskFilter): string {
  return TASK_FILTERS.find((f) => f.value === filter)?.blurb ?? "";
}

export function applyTaskFilter(
  tasks: TaskWithAssignees[],
  filter: TaskFilter,
): TaskWithAssignees[] {
  switch (filter) {
    case "todo":
      return tasks.filter((task) => task.status === "todo");
    case "pending":
      return tasks.filter((task) => task.status !== "done");
    case "in_progress":
      return tasks.filter((task) => task.status === "in_progress");
    case "in_review":
      return tasks.filter((task) => task.status === "in_review");
    case "done":
      return tasks.filter((task) => task.status === "done");
    case "due_today":
      return tasks.filter(
        (task) => task.status !== "done" && isDueToday(task.due_at),
      );
    case "overdue":
      return tasks.filter((task) => isOverdue(task.due_at, task.status));
    case "all":
    default:
      return tasks;
  }
}
