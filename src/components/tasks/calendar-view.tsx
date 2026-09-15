"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { TaskDialog } from "@/components/tasks/task-dialog";
import {
  AssigneeStack,
  DueDate,
  PriorityIndicator,
  StatusBadge,
} from "@/components/tasks/task-meta";
import { isOverdue } from "@/lib/dates";
import {
  addMonths,
  dayKey,
  dayKeyIn,
  isSameDay,
  monthGrid,
  monthParam,
  parseMonthParam,
  startOfDay,
  startOfMonth,
  todayIn,
  weekdayLabels,
} from "@/lib/calendar";
import { useI18n } from "@/lib/i18n/client";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import type {
  Profile,
  Project,
  TaskWithAssignees,
} from "@/lib/supabase/database.types";

/**
 * A month of due dates.
 *
 * The board answers "what state is everything in"; the list answers "what
 * matches"; neither answers "what is landing next week". This does. Tasks sit
 * on the local day they are due, overdue ones are marked, and anything with
 * no date is counted at the top rather than silently left out.
 *
 * On a wide screen each square lists its tasks. On a phone the squares are
 * too small for text, so they show a count and tapping one lists that day
 * below the grid.
 */
export function CalendarView({
  tasks,
  projects,
  team,
  profile,
}: {
  tasks: TaskWithAssignees[];
  projects: Project[];
  team: Profile[];
  profile: Profile;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const nowMs = useNow();
  const { t, tag, timeZone } = useI18n();
  const weekdays = React.useMemo(() => weekdayLabels(tag, "short"), [tag]);

  const [month, setMonth] = React.useState<Date>(
    () => parseMonthParam(params.get("month")) ?? startOfMonth(todayIn(timeZone)),
  );
  const [selectedDay, setSelectedDay] = React.useState<Date | null>(null);
  const [activeTask, setActiveTask] = React.useState<TaskWithAssignees | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  // The month is part of the address, so it survives a reload and can be sent.
  const goTo = (next: Date) => {
    setMonth(next);
    setSelectedDay(null);
    const url = new URL(window.location.href);
    if (isSameDay(next, startOfMonth(todayIn(timeZone)))) url.searchParams.delete("month");
    else url.searchParams.set("month", monthParam(next));
    window.history.replaceState(window.history.state, "", url);
  };

  const projectName = React.useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.name]));
    return (id: string | null) =>
      id ? (map.get(id) ?? t("common.project")) : t("common.general");
  }, [projects, t]);

  // Grouped by local day; undated ones set aside rather than lost.
  const { byDay, undated } = React.useMemo(() => {
    const byDay = new Map<string, TaskWithAssignees[]>();
    let undated = 0;
    for (const task of tasks) {
      if (!task.due_at) {
        undated += 1;
        continue;
      }
      const key = dayKeyIn(new Date(task.due_at), timeZone);
      byDay.set(key, [...(byDay.get(key) ?? []), task]);
    }
    for (const list of byDay.values()) {
      list.sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());
    }
    return { byDay, undated };
  }, [tasks, timeZone]);

  const today = nowMs === null ? null : startOfDay(new Date(nowMs));
  const days = monthGrid(month);
  const inMonth = (day: Date) => day.getMonth() === month.getMonth();
  const dueThisMonth = days.filter(inMonth).reduce(
    (sum, day) => sum + (byDay.get(dayKey(day))?.length ?? 0),
    0,
  );

  const selectedTasks = selectedDay ? (byDay.get(dayKey(selectedDay)) ?? []) : [];

  function openTask(task: TaskWithAssignees) {
    setActiveTask(task);
    setDialogOpen(true);
  }

  return (
    <PageShell>
      <PageHeader
        title={t("nav.calendar")}
        icon={<CalendarDays />}
        description={
          <>
            {t("cal.dueThisMonth", { n: dueThisMonth })}
            {undated > 0 && ` · ${t("cal.noDate", { n: undated })}`}
          </>
        }
        actions={
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => goTo(addMonths(month, -1))}
              aria-label={t("cal.prevMonth")}
            >
              <ChevronLeft className="rtl:-scale-x-100" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goTo(startOfMonth(todayIn(timeZone)))}
            >
              {t("nav.today")}
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => goTo(addMonths(month, 1))}
              aria-label={t("cal.nextMonth")}
            >
              <ChevronRight className="rtl:-scale-x-100" />
            </Button>
          </div>
        }
      />

      <h2 className="-mt-1 text-lg font-semibold tracking-tight" aria-live="polite">
        {month.toLocaleDateString(tag, { month: "long", year: "numeric" })}
      </h2>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]">
        <div className="grid grid-cols-7 border-b border-border bg-muted/60 text-center text-[0.6875rem] font-medium text-muted-foreground sm:text-xs">
          {weekdays.map((day) => (
            <div key={day} className="py-2">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7" role="grid" aria-label={t("cal.gridLabel")}>
          {days.map((day) => {
            const key = dayKey(day);
            const list = byDay.get(key) ?? [];
            const isToday = today !== null && isSameDay(day, today);
            const selected = selectedDay !== null && isSameDay(day, selectedDay);
            const weekend = day.getDay() === 0 || day.getDay() === 6;
            const late = list.filter((task) => isOverdue(task.due_at, task.status)).length;

            return (
              <div
                key={key}
                role="gridcell"
                aria-selected={selected}
                className={cn(
                  "flex min-h-[4.25rem] flex-col border-b border-e border-border p-1 sm:min-h-[6.5rem] sm:p-1.5 [&:nth-child(7n)]:border-e-0",
                  !inMonth(day) && "bg-muted/30 text-muted-foreground",
                  weekend && inMonth(day) && "bg-muted/15",
                  selected && "bg-accent",
                )}
              >
                {/* On a phone the square itself is the control; on a desktop
                    the tasks inside it are, so the square is plain. */}
                <button
                  type="button"
                  onClick={() => setSelectedDay(selected ? null : day)}
                  aria-label={t("cal.dayLabel", {
                    date: day.toLocaleDateString(tag, { weekday: "long", day: "numeric", month: "long" }),
                    n: list.length,
                  })}
                  className="flex flex-1 flex-col items-start rounded-lg text-start md:pointer-events-none"
                >
                  <span
                    className={cn(
                      "mb-0.5 flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                      isToday && "bg-primary font-semibold text-primary-foreground",
                    )}
                  >
                    {day.getDate()}
                  </span>

                  {list.length > 0 && (
                    <span
                      className={cn(
                        "mt-auto rounded-full px-1.5 text-[0.6875rem] font-medium tabular-nums md:hidden",
                        late > 0 ? "bg-warning-surface text-warning" : "bg-muted text-foreground",
                      )}
                    >
                      {list.length}
                    </span>
                  )}
                </button>

                <ul className="hidden flex-col gap-0.5 md:flex">
                  {list.slice(0, 3).map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => openTask(task)}
                        title={task.title}
                        className={cn(
                          "w-full truncate rounded-md px-1.5 py-0.5 text-start text-xs transition-colors hover:bg-accent",
                          task.status === "done" && "text-muted-foreground line-through",
                          isOverdue(task.due_at, task.status) &&
                            "border border-warning-border bg-warning-surface text-warning",
                        )}
                      >
                        {task.title}
                      </button>
                    </li>
                  ))}
                  {list.length > 3 && (
                    <li>
                      <button
                        type="button"
                        onClick={() => setSelectedDay(day)}
                        className="px-1.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {t("cal.more", { n: list.length - 3 })}
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {selectedDay && (
        <section aria-label={t("cal.selectedSection")} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">
            {selectedDay.toLocaleDateString(tag, { weekday: "long", day: "numeric", month: "long" })}
            <span className="ms-1.5 text-muted-foreground">{selectedTasks.length}</span>
          </h3>
          {selectedTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("cal.nothingThatDay")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {selectedTasks.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => openTask(task)}
                    className="lift flex w-full flex-col gap-1.5 rounded-xl border border-border bg-card p-3 text-start shadow-[var(--shadow-xs)] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <PriorityIndicator priority={task.priority} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{task.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {projectName(task.project_id)}
                        </span>
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 ps-5 sm:shrink-0 sm:ps-0">
                      <DueDate dueAt={task.due_at} status={task.status} />
                      <StatusBadge status={task.status} />
                      <AssigneeStack assignees={task.assignees} max={2} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {activeTask && (
        <TaskDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) router.refresh();
          }}
          task={activeTask}
          projectId={activeTask.project_id}
          team={team}
          currentProfile={profile}
        />
      )}
    </PageShell>
  );
}
