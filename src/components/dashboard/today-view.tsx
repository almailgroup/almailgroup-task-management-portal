"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarCheck,
  CalendarClock,
  CircleAlert,
  Loader,
  PhoneCall,
  Sunrise,
} from "lucide-react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { RescheduleMenu } from "@/components/tasks/reschedule-menu";
import { TaskDialog } from "@/components/tasks/task-dialog";
import {
  AssigneeStack,
  DueDate,
  PriorityIndicator,
  StatusBadge,
  formatDateTime,
  isDueToday,
  isOverdue,
} from "@/components/tasks/task-meta";
import { initialsFrom } from "@/lib/initials";
import { relativeDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type {
  Profile,
  Project,
  TaskWithAssignees,
} from "@/lib/supabase/database.types";

/**
 * The daily review.
 *
 * Ordered the way a morning check actually goes: what is late, what is due
 * today, what is being worked on, who needs chasing — and for a manager, how
 * the day is distributed across the team. Every row can be rescheduled inline,
 * because the usual outcome of this review is moving something.
 */
export function TodayView({
  tasks,
  followUps,
  projects,
  team,
  profile,
}: {
  tasks: TaskWithAssignees[];
  followUps: TaskWithAssignees[];
  projects: Project[];
  team: Profile[];
  profile: Profile;
}) {
  const [active, setActive] = React.useState<TaskWithAssignees | null>(null);
  const [open, setOpen] = React.useState(false);

  const isManager = profile.role === "admin" || profile.role === "manager";

  const projectName = React.useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? (map.get(id) ?? "Project") : "General");
  }, [projects]);

  const overdue = tasks.filter((t) => isOverdue(t.due_at, t.status));
  const dueToday = tasks.filter(
    (t) => t.status !== "done" && isDueToday(t.due_at),
  );
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const inReview = tasks.filter((t) => t.status === "in_review");
  const completedToday = tasks.filter(
    (t) => t.status === "done" && isDueToday(t.updated_at),
  );

  const chaseNow = followUps.filter(
    (t) => t.follow_up_at && new Date(t.follow_up_at) <= new Date(),
  );

  // Per-person load, so a manager can see where the day is concentrated.
  const workload = React.useMemo(() => {
    const rows = new Map<
      string,
      { profile: Profile; today: number; late: number; active: number }
    >();
    for (const person of team) {
      rows.set(person.id, { profile: person, today: 0, late: 0, active: 0 });
    }
    for (const task of tasks) {
      for (const person of task.assignees) {
        const row = rows.get(person.id);
        if (!row) continue;
        if (isOverdue(task.due_at, task.status)) row.late += 1;
        if (task.status !== "done" && isDueToday(task.due_at)) row.today += 1;
        if (task.status === "in_progress") row.active += 1;
      }
    }
    return [...rows.values()]
      .filter((r) => r.today + r.late + r.active > 0)
      .sort((a, b) => b.late - a.late || b.today - a.today);
  }, [tasks, team]);

  function openTask(task: TaskWithAssignees) {
    setActive(task);
    setOpen(true);
  }

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <PageShell>
      <PageHeader
        title="Today"
        icon={<Sunrise />}
        description={
          <>
            {today} · {overdue.length} overdue, {dueToday.length} due today,{" "}
            {inProgress.length} in progress
          </>
        }
      />

      <Section
        title="Overdue"
        icon={<CircleAlert />}
        tasks={overdue}
        empty="Nothing is late."
        emphasis
        projectName={projectName}
        onOpen={openTask}
        canReschedule={isManager}
      />

      <Section
        title="Due today"
        icon={<CalendarClock />}
        tasks={dueToday}
        empty="Nothing due today."
        projectName={projectName}
        onOpen={openTask}
        canReschedule={isManager}
      />

      <Section
        title="In progress"
        icon={<Loader />}
        tasks={inProgress}
        empty="Nothing is being worked on."
        projectName={projectName}
        onOpen={openTask}
        canReschedule={isManager}
      />

      {inReview.length > 0 && (
        <Section
          title="Waiting on review"
          icon={<CalendarCheck />}
          tasks={inReview}
          empty=""
          projectName={projectName}
          onOpen={openTask}
          canReschedule={isManager}
        />
      )}

      {chaseNow.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <PhoneCall className="size-3.5" />
              Follow up now
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {chaseNow.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => openTask(task)}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border px-2.5 py-2 text-left transition-colors hover:border-foreground/25"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {task.title}
                  </span>
                  {task.follow_up_note && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {task.follow_up_note}
                    </span>
                  )}
                </span>
                <Badge variant="subtle">
                  {task.follow_up_at ? relativeDay(task.follow_up_at) : ""}
                </Badge>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {isManager && workload.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Who is busy today</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {workload.map(({ profile: person, today: t, late, active: a }) => (
              <div key={person.id} className="flex items-center gap-3">
                <Avatar className="size-7">
                  {person.avatar_url && (
                    <AvatarImage src={person.avatar_url} alt="" />
                  )}
                  <AvatarFallback className="text-[10px]">
                    {initialsFrom(person.full_name, person.email)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {person.full_name ?? person.email}
                  {person.job_title && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {person.job_title}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                  {late > 0 && (
                    <span className="font-medium text-foreground">
                      {late} late
                    </span>
                  )}
                  <span>{t} today</span>
                  <span>{a} active</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {completedToday.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {completedToday.length}{" "}
          {completedToday.length === 1 ? "task" : "tasks"} completed today.
        </p>
      )}

      {active && (
        <TaskDialog
          open={open}
          onOpenChange={setOpen}
          task={active}
          projectId={active.project_id}
          team={team}
          currentProfile={profile}
        />
      )}
    </PageShell>
  );
}

function Section({
  title,
  icon,
  tasks,
  empty,
  emphasis,
  projectName,
  onOpen,
  canReschedule,
}: {
  title: string;
  icon: React.ReactNode;
  tasks: TaskWithAssignees[];
  empty: string;
  emphasis?: boolean;
  projectName: (id: string | null) => string;
  onOpen: (task: TaskWithAssignees) => void;
  canReschedule: boolean;
}) {
  return (
    <Card className={cn(emphasis && tasks.length > 0 && "border-foreground/30")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <span className="[&_svg]:size-3.5">{icon}</span>
          {title}
          <span className="text-muted-foreground">{tasks.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border px-2.5 py-2"
            >
              <PriorityIndicator priority={task.priority} />

              <button
                type="button"
                onClick={() => onOpen(task)}
                className="min-w-0 flex-1 text-left focus-visible:outline-none"
              >
                <span className="block truncate text-sm font-medium">
                  {task.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {projectName(task.project_id)}
                  {task.due_at && ` · ${formatDateTime(task.due_at)}`}
                </span>
              </button>

              <StatusBadge status={task.status} />
              <AssigneeStack assignees={task.assignees} max={2} />
              {canReschedule && <RescheduleMenu task={task} compact />}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export { DueDate, Link };
