import type { Metadata } from "next";

import { CalendarView } from "@/components/tasks/calendar-view";
import { getAllTasks, getProjects, getTeam, requireProfile } from "@/lib/data/queries";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.calendar") };
}

/**
 * Every task the viewer can see, on the day it is due. Placement happens in
 * the browser, because only the browser knows which local day an instant
 * falls on.
 */
export default async function CalendarPage() {
  const [profile, tasks, projects, team] = await Promise.all([
    requireProfile(),
    getAllTasks(),
    getProjects(),
    getTeam(),
  ]);

  return (
    <CalendarView tasks={tasks} projects={projects} team={team} profile={profile} />
  );
}
