import type { Metadata } from "next";

import { GeneralTasks } from "@/components/tasks/general-tasks";
import { getGeneralTasks, getTeam, requireProfile } from "@/lib/data/queries";

export const metadata: Metadata = { title: "General tasks" };

export default async function GeneralTasksPage() {
  const [profile, tasks, team] = await Promise.all([
    requireProfile(),
    getGeneralTasks(),
    getTeam(),
  ]);

  return <GeneralTasks tasks={tasks} team={team} profile={profile} />;
}
