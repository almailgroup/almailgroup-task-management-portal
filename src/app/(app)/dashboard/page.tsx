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
} from "@/components/tasks/task-meta";
import {
  getMyOpenTasks,
  getOverdueTasks,
  getProjects,
  getTaskCounts,
  getWorkload,
  requireProfile,
} from "@/lib/data/queries";
import type { TaskWithAssignees } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  // Five bounded reads instead of "fetch every task, then reduce it here".
  // The counts and the workload are aggregated in Postgres; the two lists ask
  // for the six rows they show rather than everything and a slice.
  const [profile, metrics, workload, myTasks, attention, projects] =
    await Promise.all([
      requireProfile(),
      getTaskCounts(),
      getWorkload(),
      getMyOpenTasks(6),
      getOverdueTasks(6),
      getProjects(),
    ]);

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
          {/* Two up on a phone: six full-width tiles meant six screens of
              scrolling before the first list came into view. */}
          <section className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
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

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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
  tasks: TaskWithAssignees[];
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
              // Title and meta share a line once there is room for both. On a
              // phone there is not: the meta cluster used to be `shrink-0`,
              // which pushed the card 175px past the edge of the screen and
              // left Safari shrinking the whole page to fit.
              className="flex flex-col gap-1.5 rounded-lg border border-border px-2.5 py-2 transition-colors hover:border-foreground/25 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <span className="flex min-w-0 items-center gap-2">
                <PriorityIndicator priority={task.priority} />
                <span className="truncate text-sm">{task.title}</span>
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 ps-5 sm:shrink-0 sm:ps-0">
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
