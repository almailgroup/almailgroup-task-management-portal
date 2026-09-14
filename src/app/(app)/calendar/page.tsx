import type { Metadata } from "next";

import { CalendarView } from "@/components/tasks/calendar-view";
import { getAllTasks, getProjects, getTeam, requireProfile } from "@/lib/data/queries";

export const metadata: Metadata = { title: "Calendar" };

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
