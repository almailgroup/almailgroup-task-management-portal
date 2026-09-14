import type { Metadata } from "next";

import { TodayView } from "@/components/dashboard/today-view";
import {
  getAllTasks,
  getFollowUps,
  getProjects,
  getTeam,
  requireProfile,
} from "@/lib/data/queries";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.today") };
}

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
