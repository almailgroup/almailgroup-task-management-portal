import type { Metadata } from "next";

import { TaskBrowser } from "@/components/tasks/task-browser";
import {
  applyTaskFilter,
  filterLabel,
  isTaskFilter,
  TASK_FILTERS,
  type TaskFilter,
} from "@/lib/task-filters";
import { getAllTasks, getProjects, getTeam, requireProfile } from "@/lib/data/queries";
import { getI18n, getTimeZone } from "@/lib/i18n/server";

type PageProps = { searchParams: Promise<{ filter?: string }> };

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const [{ filter }, { t }] = await Promise.all([searchParams, getI18n()]);
  return { title: t(isTaskFilter(filter) ? filterLabel(filter) : "nav.tasks") };
}

export default async function TasksPage({ searchParams }: PageProps) {
  const { filter: raw } = await searchParams;
  const filter: TaskFilter = isTaskFilter(raw) ? raw : "all";

  const [profile, tasks, projects, team, timeZone] = await Promise.all([
    requireProfile(),
    getAllTasks(),
    getProjects(),
    getTeam(),
    getTimeZone(),
  ]);

  // Every chip shows its own count, computed from the same predicates the
  // dashboard cards use, so the two can never disagree.
  const counts = Object.fromEntries(
    TASK_FILTERS.map((entry) => [
      entry.value,
      applyTaskFilter(tasks, entry.value, timeZone).length,
    ]),
  ) as Record<TaskFilter, number>;

  return (
    <TaskBrowser
      tasks={applyTaskFilter(tasks, filter, timeZone)}
      filter={filter}
      counts={counts}
      projects={projects}
      team={team}
      profile={profile}
    />
  );
}
