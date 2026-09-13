import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarClock,
  CircleAlert,
  CircleCheck,
  CircleDot,
  FolderOpen,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard, ProgressBar } from "@/components/dashboard/metric-card";
import { WorkloadCard } from "@/components/dashboard/workload-card";
import {
  AssigneeStack,
  DueDate,
  PriorityIndicator,
  StatusBadge,
  isOverdue,
} from "@/components/tasks/task-meta";
import { summarise, workloadByUser } from "@/lib/metrics";
import {
  getAllTasks,
  getProjects,
  getTeam,
  requireProfile,
} from "@/lib/data/queries";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const [profile, tasks, projects, team] = await Promise.all([
    requireProfile(),
    getAllTasks(),
    getProjects(),
    getTeam(),
  ]);

  const metrics = summarise(tasks);
  const workload = workloadByUser(tasks, team);

  const myTasks = tasks
    .filter(
      (task) =>
        task.status !== "done" &&
        task.assignees.some((person) => person.id === profile.id),
    )
    // Soonest due first; undated work sorts last.
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
    .slice(0, 6);

  const attention = tasks
    .filter((task) => isOverdue(task.due_date, task.status))
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .slice(0, 6);

  const firstName = profile.full_name?.split(" ")[0];

  return (
    <div className="flex flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>{firstName ? `Welcome back, ${firstName}` : "Dashboard"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {projects.length} {projects.length === 1 ? "project" : "projects"} ·{" "}
            {metrics.total} {metrics.total === 1 ? "task" : "tasks"}
          </p>
        </div>
      </header>

      {projects.length === 0 ? (
        <EmptyState canCreate={profile.role !== "member"} />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Completed"
              value={metrics.done}
              hint={`${metrics.completionRate}% of all tasks`}
              icon={<CircleCheck />}
            />
            <MetricCard
              label="Pending"
              value={metrics.pending}
              hint={`${metrics.inProgress} in progress · ${metrics.inReview} in review`}
              icon={<CircleDot />}
            />
            <MetricCard
              label="Overdue"
              value={metrics.overdue}
              hint={
                metrics.overdue === 0
                  ? "Nothing past its due date"
                  : "Past the due date and unfinished"
              }
              icon={<CircleAlert />}
              emphasis={metrics.overdue > 0}
            />
            <MetricCard
              label="Due today"
              value={metrics.dueToday}
              hint="Unfinished tasks due today"
              icon={<CalendarClock />}
            />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Overall progress</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <ProgressBar
                value={metrics.completionRate}
                label="Overall completion"
              />
              <p className="text-xs text-muted-foreground">
                {metrics.done} of {metrics.total} tasks complete
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            <TaskListCard
              title="Assigned to you"
              tasks={myTasks}
              empty="Nothing is assigned to you right now."
            />
            <TaskListCard
              title="Needs attention"
              tasks={attention}
              empty="No overdue tasks."
            />
          </div>

          <WorkloadCard workload={workload} />
        </>
      )}
    </div>
  );
}

function TaskListCard({
  title,
  tasks,
  empty,
}: {
  title: string;
  tasks: Awaited<ReturnType<typeof getAllTasks>>;
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          tasks.map((task) => (
            <Link
              key={task.id}
              href={taskHref(task)}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-2.5 py-2 transition-colors hover:border-foreground/25"
            >
              <span className="flex min-w-0 items-center gap-2">
                <PriorityIndicator priority={task.priority} />
                <span className="truncate text-sm">{task.title}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <DueDate dueDate={task.due_date} status={task.status} />
                <StatusBadge status={task.status} />
                <AssigneeStack assignees={task.assignees} max={2} />
              </span>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/** Where a task lives: its project board, or the general list. */
function taskHref(task: { project_id: string | null }) {
  return task.project_id ? `/projects/${task.project_id}` : "/general";
}

function EmptyState({ canCreate }: { canCreate: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
        <FolderOpen className="size-6 text-muted-foreground" />
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            No projects yet
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {canCreate
              ? "Create a project to start tracking work. Use the plus button in the sidebar."
              : "Once a manager creates a project, it will show up here."}
          </p>
        </div>
        {canCreate && (
          <Button variant="outline" size="sm" asChild>
            <Link href="/team">View team</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
