import type { Metadata } from "next";

import { GeneralTasks } from "@/components/tasks/general-tasks";
import {
  getFollowUps,
  getGeneralTasks,
  getTeam,
  requireProfile,
} from "@/lib/data/queries";

export const metadata: Metadata = { title: "General tasks" };

export default async function GeneralTasksPage() {
  const [profile, tasks, followUps, team] = await Promise.all([
    requireProfile(),
    getGeneralTasks(),
    getFollowUps({ generalOnly: true }),
    getTeam(),
  ]);

  return (
    <GeneralTasks
      tasks={tasks}
      followUps={followUps}
      team={team}
      profile={profile}
    />
  );
}
