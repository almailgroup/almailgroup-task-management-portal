import type { Metadata } from "next";

import { TodayView } from "@/components/dashboard/today-view";
import {
  getAllTasks,
  getFollowUps,
  getProjects,
  getTeam,
  requireProfile,
} from "@/lib/data/queries";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const [profile, tasks, followUps, projects, team] = await Promise.all([
    requireProfile(),
    getAllTasks(),
    getFollowUps(),
    getProjects(),
    getTeam(),
  ]);

  return (
    <TodayView
      tasks={tasks}
      followUps={followUps}
      projects={projects}
      team={team}
      profile={profile}
    />
  );
}
