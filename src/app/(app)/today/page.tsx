import type { Metadata } from "next";

import { TodayView } from "@/components/dashboard/today-view";
import {
  getFollowUps,
  getOpenTasks,
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
  // Today is made of four questions — overdue, due today, in progress,
  // waiting on review — and every one of them is about work that is not
  // done. Asking for that rather than for everything means the page cannot
  // silently lose an old overdue task to a row cap it never mentioned.
  const [profile, open, followUps, projects, team] = await Promise.all([
    requireProfile(),
    getOpenTasks(),
    getFollowUps(),
    getProjects(),
    getTeam(),
  ]);

  return (
    <TodayView
      tasks={open.tasks}
      followUps={followUps}
      projects={projects}
      team={team}
      profile={profile}
    />
  );
}
