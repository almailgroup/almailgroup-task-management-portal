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
} from "@/components/tasks/task-meta";
import { formatDateTime, isDueToday, isOverdue } from "@/lib/dates";
import { initialsFrom } from "@/lib/initials";
import { relativeDay } from "@/lib/dates";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
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
  const i18n = useI18n();
  const { t, tn, tag, timeZone } = i18n;
  const [active, setActive] = React.useState<TaskWithAssignees | null>(null);
  const [open, setOpen] = React.useState(false);

  const isManager = profile.role === "admin" || profile.role === "manager";

  const projectName = React.useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.name]));
    return (id: string | null) =>
      id ? (map.get(id) ?? t("common.project")) : t("common.general");
  }, [projects, t]);

  const overdue = tasks.filter((t) => isOverdue(t.due_at, t.status));
  const dueToday = tasks.filter(
    (t) => t.status !== "done" && isDueToday(t.due_at, timeZone),
  );
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const inReview = tasks.filter((t) => t.status === "in_review");
  const completedToday = tasks.filter(
    (t) => t.status === "done" && isDueToday(t.updated_at, timeZone),
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
        if (task.status !== "done" && isDueToday(task.due_at, timeZone)) row.today += 1;
        if (task.status === "in_progress") row.active += 1;
      }
    }
    return [...rows.values()]
      .filter((r) => r.today + r.late + r.active > 0)
      .sort((a, b) => b.late - a.late || b.today - a.today);
  }, [tasks, team, timeZone]);

  function openTask(task: TaskWithAssignees) {
    setActive(task);
    setOpen(true);
  }

  const today = new Date().toLocaleDateString(tag, {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <PageShell>
      <PageHeader
        title={t("nav.today")}
        icon={<Sunrise />}
        description={
          <>
            {today} ·{" "}
            {t("today.summary", {
              overdue: overdue.length,
              due: dueToday.length,
              active: inProgress.length,
            })}
          </>
        }
      />

      <Section
        title={t("meta.overdue")}
        icon={<CircleAlert />}
        tasks={overdue}
        empty={t("today.nothingLate")}
        emphasis
        projectName={projectName}
        onOpen={openTask}
        canReschedule={isManager}
      />

      <Section
        title={t("today.dueToday")}
        icon={<CalendarClock />}
        tasks={dueToday}
        empty={t("today.nothingDue")}
        projectName={projectName}
        onOpen={openTask}
        canReschedule={isManager}
      />

      <Section
        title={t("status.in_progress")}
        icon={<Loader />}
        tasks={inProgress}
        empty={t("today.nothingActive")}
        projectName={projectName}
        onOpen={openTask}
        canReschedule={isManager}
      />

      {inReview.length > 0 && (
        <Section
          title={t("today.waitingReview")}
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
              {t("today.followUpNow")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {chaseNow.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => openTask(task)}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border px-2.5 py-2 text-start transition-colors hover:border-foreground/25"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-medium">
                    {task.title}
                  </span>
                  {task.follow_up_note && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {task.follow_up_note}
                    </span>
                  )}
                </span>
                <Badge variant="subtle">
                  {task.follow_up_at ? relativeDay(task.follow_up_at, i18n) : ""}
                </Badge>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {isManager && workload.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("today.whoIsBusy")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {workload.map(({ profile: person, today: due, late, active: a }) => (
              <div key={person.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Avatar className="size-7">
                  {person.avatar_url && (
                    <AvatarImage src={person.avatar_url} alt="" />
                  )}
                  <AvatarFallback className="text-[10px]">
                    {initialsFrom(person.full_name, person.email)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 basis-40 truncate text-sm">
                  {person.full_name ?? person.email}
                  {person.job_title && (
                    <span className="ms-1.5 text-xs text-muted-foreground">
                      {person.job_title}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                  {late > 0 && (
                    <span className="font-medium text-foreground">
                      {t("today.late", { n: late })}
                    </span>
                  )}
                  <span>{t("today.todayCount", { n: due })}</span>
                  <span>{t("today.active", { n: a })}</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {completedToday.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("today.completedToday", { tasks: tn("count.tasks", completedToday.length) })}
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
  const { tag, timeZone } = useI18n();
  return (
    <Card
      className={cn(
        emphasis &&
          tasks.length > 0 &&
          "border-warning-border bg-warning-surface",
      )}
    >
      <CardHeader>
        <CardTitle
          className={cn(
            "flex items-center gap-1.5",
            emphasis && tasks.length > 0 && "text-warning",
          )}
        >
          <span className="[&_svg]:size-3.5">{icon}</span>
          {title}
          <span className={cn(!(emphasis && tasks.length > 0) && "text-muted-foreground")}>
            {tasks.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {tasks.length === 0 ? (
          <EmptyState compact title={empty} className="border-0 bg-transparent py-6" />
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-xl border border-border bg-card px-3.5 py-3 shadow-[var(--shadow-sm)]"
            >
              {/* On a phone the badge, avatars and reschedule button between
                  them left the title about 100px and it read "Photogra…".
                  The title takes the row to itself and they drop below it. */}
              <div className="flex w-full min-w-0 items-center gap-2.5 sm:w-auto sm:flex-1">
                <PriorityIndicator priority={task.priority} />

                <button
                  type="button"
                  onClick={() => onOpen(task)}
                  className="min-w-0 flex-1 text-start focus-visible:outline-none"
                >
                  <span className="block truncate text-[0.9375rem] font-medium">
                    {task.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {projectName(task.project_id)}
                    {task.due_at && ` · ${formatDateTime(task.due_at, tag, timeZone)}`}
                  </span>
                </button>
              </div>

              <div className="flex w-full items-center justify-end gap-2.5 sm:w-auto">
                <StatusBadge status={task.status} />
                <AssigneeStack assignees={task.assignees} max={2} />
                {canReschedule && <RescheduleMenu task={task} compact />}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export { DueDate, Link };
