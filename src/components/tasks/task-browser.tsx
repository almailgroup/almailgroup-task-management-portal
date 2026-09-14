"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderOpen, ListFilter, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { TaskTable } from "@/components/tasks/task-table";
import { TaskDialog } from "@/components/tasks/task-dialog";
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

      {/* One row implementation for every task list in the app. The browser
          used to hand-roll its own, which is why selection never reached it. */}
      <TaskTable
        tasks={visible}
        onOpenTask={(task) => {
          setActiveTask(task);
          setDialogOpen(true);
        }}
        canComplete={canManage}
        canDelete={canManage}
        projectName={projectName}
        canReschedule={canManage}
        emptyState={
          <EmptyState
            icon={<FolderOpen />}
            title={query.trim() ? "No matches" : "Nothing in this view"}
            description={
              query.trim()
                ? `Nothing matches “${query.trim()}”. Try a different search, or pick another filter above.`
                : "Pick another filter above to see tasks in a different state."
            }
          />
        }
      />

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
