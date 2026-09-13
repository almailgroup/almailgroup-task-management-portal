import { isOverdue, todayIso } from "@/components/tasks/task-meta";
import type { Profile, TaskWithAssignees } from "@/lib/supabase/database.types";

/** Aggregations behind the dashboard cards. Pure functions, easy to reason about. */

export type Metrics = {
  total: number;
  done: number;
  pending: number;
  overdue: number;
  dueToday: number;
  inProgress: number;
  inReview: number;
  completionRate: number;
};

export function summarise(tasks: TaskWithAssignees[]): Metrics {
  const today = todayIso();

  let done = 0;
  let overdue = 0;
  let dueToday = 0;
  let inProgress = 0;
  let inReview = 0;

  for (const task of tasks) {
    if (task.status === "done") done += 1;
    if (task.status === "in_progress") inProgress += 1;
    if (task.status === "in_review") inReview += 1;
    if (isOverdue(task.due_date, task.status)) overdue += 1;
    if (task.status !== "done" && task.due_date === today) dueToday += 1;
  }

  const total = tasks.length;

  return {
    total,
    done,
    pending: total - done,
    overdue,
    dueToday,
    inProgress,
    inReview,
    completionRate: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export type Workload = {
  profile: Profile;
  open: number;
  done: number;
  overdue: number;
};

/**
 * Open/done/overdue counts per person, busiest first.
 *
 * Only people who actually have assigned work are returned, so the card does
 * not turn into a roster of zeroes as the organisation grows.
 */
export function workloadByUser(
  tasks: TaskWithAssignees[],
  team: Profile[],
): Workload[] {
  const byId = new Map<string, Workload>();
  for (const profile of team) {
    byId.set(profile.id, { profile, open: 0, done: 0, overdue: 0 });
  }

  for (const task of tasks) {
    for (const assignee of task.assignees) {
      const entry = byId.get(assignee.id);
      if (!entry) continue;

      if (task.status === "done") entry.done += 1;
      else entry.open += 1;

      if (isOverdue(task.due_date, task.status)) entry.overdue += 1;
    }
  }

  return [...byId.values()]
    .filter((entry) => entry.open + entry.done > 0)
    .sort((a, b) => b.open - a.open || b.done - a.done);
}
