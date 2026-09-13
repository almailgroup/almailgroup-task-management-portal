"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderOpen, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TaskDialog } from "@/components/tasks/task-dialog";
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
    <div className="flex flex-col gap-4 px-4 py-6 sm:px-6">
      <header>
        <h1>Tasks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Across every project and the general list.
        </p>
      </header>

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
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
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
        <div className="rounded-lg border border-dashed border-border px-4 py-14 text-center">
          <FolderOpen className="mx-auto size-5 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            {query.trim()
              ? "No tasks match that search."
              : "Nothing in this view."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => {
                  setActiveTask(task);
                  setDialogOpen(true);
                }}
                className="flex w-full flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-foreground/25"
              >
                <PriorityIndicator priority={task.priority} />

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {task.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {projectName(task.project_id)}
                  </span>
                </span>

                <DueDate dueAt={task.due_at} status={task.status} />
                <StatusBadge status={task.status} />
                <AssigneeStack assignees={task.assignees} max={3} />
              </button>
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
    </div>
  );
}

export { Badge };
