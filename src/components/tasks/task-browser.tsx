"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderOpen, ListFilter, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { RescheduleMenu } from "@/components/tasks/reschedule-menu";
import {
  AssigneeStack,
  DueDate,
  PriorityIndicator,
  StatusBadge,
} from "@/components/tasks/task-meta";
import { TASK_FILTERS, type TaskFilter } from "@/lib/task-filters";
import { cn } from "@/lib/utils";
import type {
  Profile,
  Project,
  TaskWithAssignees,
} from "@/lib/supabase/database.types";

/**
 * Cross-project task list behind the dashboard metric cards.
 *
 * Tasks open in the same dialog used everywhere else, so acting on something
 * you found here does not mean navigating to its project first.
 */
export function TaskBrowser({
  tasks,
  filter,
  counts,
  projects,
  team,
  profile,
}: {
  tasks: TaskWithAssignees[];
  filter: TaskFilter;
  counts: Record<TaskFilter, number>;
  projects: Project[];
  team: Profile[];
  profile: Profile;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const canManage = profile.role === "admin" || profile.role === "manager";
  const [activeTask, setActiveTask] = React.useState<TaskWithAssignees | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const projectName = React.useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? (map.get(id) ?? "Project") : "General");
  }, [projects]);

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tasks;
    return tasks.filter((task) =>
      `${task.title} ${task.description ?? ""}`.toLowerCase().includes(needle),
    );
  }, [tasks, query]);

  return (
    <PageShell>
      <PageHeader
        title="Tasks"
        icon={<ListFilter />}
        description="Everything you can see, across every project and the general list."
      />

      {/* Filter chips double as the legend for the dashboard cards. */}
      <nav className="flex flex-wrap gap-1.5" aria-label="Task filters">
        {TASK_FILTERS.map((entry) => {
          const active = entry.value === filter;
          return (
            <Link
              key={entry.value}
              href={`/tasks?filter=${entry.value}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "press inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all duration-150",
                "pointer-coarse:min-h-10 pointer-coarse:px-3",
                active
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {entry.label}
              <span
                className={cn(
                  "tabular-nums",
                  active ? "opacity-80" : "opacity-60",
                )}
              >
                {counts[entry.value]}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search these tasks"
          className="h-9 pl-8"
          aria-label="Search tasks"
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<FolderOpen />}
          title={query.trim() ? "No matches" : "Nothing in this view"}
          description={
            query.trim()
              ? `Nothing matches “${query.trim()}”. Try a different search, or pick another filter above.`
              : "Pick another filter above to see tasks in a different state."
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((task) => (
            <li key={task.id}>
              <div className="lift flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-sm)] hover:border-foreground/30">
                {/* Four trailing controls against one title: on a phone they
                    left it 29px wide. The title owns the first row and they
                    wrap beneath it until there is room for one line. */}
                <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1">
                  <PriorityIndicator priority={task.priority} />

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTask(task);
                      setDialogOpen(true);
                    }}
                    className="min-w-0 flex-1 text-left focus-visible:outline-none"
                  >
                    <span className="block truncate text-[0.9375rem] font-medium">
                      {task.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {projectName(task.project_id)}
                    </span>
                  </button>
                </div>

                <div className="flex w-full flex-wrap items-center justify-end gap-x-3 gap-y-2 sm:w-auto">
                  <DueDate dueAt={task.due_at} status={task.status} />
                  <StatusBadge status={task.status} />
                  <AssigneeStack assignees={task.assignees} max={3} />
                  {canManage && <RescheduleMenu task={task} compact />}
                </div>
              </div>
            </li>
          ))}
        </ul>
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

export { Badge };
