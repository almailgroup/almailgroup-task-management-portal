import "server-only";

import { getAllTasks, getProjects, requireProfile } from "@/lib/data/queries";
import { summarise } from "@/lib/metrics";
import type { MahamSnapshot, MahamTask } from "@/lib/maham/types";

/**
 * Gather what MAHAM is allowed to know about the caller's work.
 *
 * Every read goes through the normal RLS-scoped queries, so the snapshot is
 * already the caller's own view of the board: a member sees only the tasks
 * assigned to them, a manager sees the projects they belong to. The assistant
 * needs no permission logic of its own, and nothing it says can be broader
 * than what that person could already open in the UI.
 *
 * Counts come from the same `summarise` the dashboard cards use, so the
 * assistant and the dashboard can never disagree about how many are overdue.
 */
export async function buildSnapshot(): Promise<MahamSnapshot> {
  const [profile, tasks, projects] = await Promise.all([
    requireProfile(),
    getAllTasks(),
    getProjects(),
  ]);

  const projectName = new Map(projects.map((project) => [project.id, project.name]));
  const metrics = summarise(tasks);
  const open = tasks.filter((task) => task.status !== "done");

  const flattened: MahamTask[] = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    project: task.project_id ? (projectName.get(task.project_id) ?? null) : null,
    dueAt: task.due_at,
    followUpAt: task.follow_up_at,
    assignees: task.assignees.map((person) => person.full_name ?? person.email),
    createdAt: task.created_at,
  }));

  return {
    viewer: { name: profile.full_name ?? profile.email, role: profile.role },
    takenAt: new Date().toISOString(),
    tasks: flattened,
    counts: {
      total: metrics.total,
      todo: metrics.todo,
      inProgress: metrics.inProgress,
      inReview: metrics.inReview,
      done: metrics.done,
      overdue: metrics.overdue,
      dueToday: metrics.dueToday,
      unassigned: open.filter((task) => task.assignees.length === 0).length,
      noDueDate: open.filter((task) => task.due_at === null).length,
    },
  };
}
