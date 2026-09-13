import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarClock,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Eye,
  FolderOpen,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { EmptyState } from "@/components/ui/empty-state";
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
    .sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"))
    .slice(0, 6);

  const attention = tasks
    .filter((task) => isOverdue(task.due_at, task.status))
    .sort((a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? ""))
    .slice(0, 6);

  const firstName = profile.full_name?.split(" ")[0];

  return (
    <PageShell>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Dashboard"}
        description={
          <>
            {projects.length} {projects.length === 1 ? "project" : "projects"} ·{" "}
            {metrics.total} {metrics.total === 1 ? "task" : "tasks"} you can see
          </>
        }
      />

      {projects.length === 0 ? (
        <NoProjects canCreate={profile.role !== "member"} />
      ) : (
        <>
          {/* Every tile opens the matching list; counts and list share one
              set of predicates in lib/task-filters, so they cannot disagree. */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <MetricCard
              label="To Do"
              value={metrics.todo}
              hint="Not started"
              icon={<CircleDashed />}
              href="/tasks?filter=todo"
            />
            <MetricCard
              label="Pending"
              value={metrics.pending}
              hint="Not yet done"
              icon={<CircleDot />}
              href="/tasks?filter=pending"
            />
            <MetricCard
              label="In Review"
              value={metrics.inReview}
              hint="Awaiting review"
              icon={<Eye />}
              href="/tasks?filter=in_review"
            />
            <MetricCard
              label="Completed"
              value={metrics.done}
              hint={`${metrics.completionRate}% of all`}
              icon={<CircleCheck />}
              href="/tasks?filter=done"
            />
            <MetricCard
              label="Due Today"
              value={metrics.dueToday}
              hint="Due before midnight"
              icon={<CalendarClock />}
              href="/tasks?filter=due_today"
            />
            <MetricCard
              label="Overdue"
              value={metrics.overdue}
              hint={metrics.overdue === 0 ? "All clear" : "Past due"}
              icon={<CircleAlert />}
              emphasis={metrics.overdue > 0}
              href="/tasks?filter=overdue"
            />
          </section>

          <p className="-mt-1 text-xs text-muted-foreground">
            {metrics.inProgress} in progress. Select any tile to see those
            tasks.
          </p>

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
    </PageShell>
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
                <DueDate dueAt={task.due_at} status={task.status} />
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

function NoProjects({ canCreate }: { canCreate: boolean }) {
  return (
    <EmptyState
      icon={<FolderOpen />}
      title="Nothing here yet"
      description={
        canCreate
          ? "Create a project from the sidebar to start tracking work, or add a general task for anything that does not belong to one."
          : "Once you are added to a project, or a task is assigned to you, it will appear here."
      }
      action={
        canCreate ? (
          <Button variant="outline" size="sm" asChild>
            <Link href="/general">Go to general tasks</Link>
          </Button>
        ) : undefined
      }
    />
  );
}
