"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, FolderOpen, ListFilter, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { TaskTable } from "@/components/tasks/task-table";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { csvFilename, tasksToCsv } from "@/lib/csv";
import { downloadText } from "@/lib/download";
import { TASK_FILTERS, filterLabel, type TaskFilter } from "@/lib/task-filters";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
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
  const { t } = useI18n();
  const params = useSearchParams();
  const [query, setQuery] = React.useState(params.get("q") ?? "");
  const canManage = profile.role === "admin" || profile.role === "manager";
  const [activeTask, setActiveTask] = React.useState<TaskWithAssignees | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = React.useState(false);

  /**
   * `?task=<id>` opens that task straight away.
   *
   * This is what makes a task addressable: search results, and any link
   * someone pastes to a colleague, land on the task itself rather than on the
   * project it happens to live in.
   */
  // Keeps the box in step when a search arrives from the palette while this
  // page is already open — the component is reused, not remounted.
  const urlQuery = params.get("q") ?? "";
  React.useEffect(() => {
    if (urlQuery) setQuery(urlQuery);
  }, [urlQuery]);

  const requested = params.get("task");
  const opened = React.useRef<string | null>(null);

  React.useEffect(() => {
    // Once per id: closing the dialog drops the parameter and refreshes the
    // list, and those two arrive in their own time. Without this the refresh
    // could land while the parameter was still set and reopen what had just
    // been dismissed.
    if (!requested || opened.current === requested) return;
    const match = tasks.find((task) => task.id === requested);
    if (!match) return;
    opened.current = requested;
    setActiveTask(match);
    setDialogOpen(true);
  }, [requested, tasks]);

  const projectName = React.useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.name]));
    return (id: string | null) =>
      id ? (map.get(id) ?? t("common.project")) : t("common.general");
  }, [projects, t]);

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
        title={t("nav.tasks")}
        icon={<ListFilter />}
        description={t("browser.description")}
      />

      {/* Filter chips double as the legend for the dashboard cards. */}
      <nav className="chip-strip" aria-label={t("browser.filters")}>
        {TASK_FILTERS.map((entry) => {
          const active = entry.value === filter;
          return (
            <Link
              key={entry.value}
              href={`/tasks?filter=${entry.value}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "press inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all duration-150",
                "pointer-coarse:min-h-11 pointer-coarse:px-3",
                active
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {t(entry.label)}
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

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[10rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("browser.searchThese")}
            className="h-9 ps-8"
            aria-label={t("browser.searchTasks")}
          />
        </div>
        <span className="ms-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {t("browser.countOf", { shown: visible.length, total: tasks.length })}
          </span>
          {visible.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                downloadText(
                  csvFilename(`${t(filterLabel(filter))} ${t("nav.tasks")}`),
                  tasksToCsv(visible, projectName, t),
                )
              }
              aria-label={t("browser.exportLabel")}
              title={t("browser.exportTitle")}
            >
              <Download />
              <span className="hidden sm:inline">{t("common.export")}</span>
            </Button>
          )}
        </span>
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
            title={query.trim() ? t("browser.noMatches") : t("browser.nothingInView")}
            description={
              query.trim()
                ? t("browser.noMatchesBody", { query: query.trim() })
                : t("browser.pickFilter")
            }
          />
        }
      />

      {activeTask && (
        <TaskDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (open) return;
            // Drop ?task= on close, or reloading the page reopens the dialog
            // someone has just dismissed.
            if (requested) {
              const next = new URLSearchParams(params.toString());
              next.delete("task");
              router.replace(`/tasks?${next.toString()}`, { scroll: false });
            }
            router.refresh();
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

