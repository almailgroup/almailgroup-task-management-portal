import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectWorkspace } from "@/components/projects/project-workspace";
import {
  getProject,
  getProjectTasks,
  getTeam,
  requireProfile,
} from "@/lib/data/queries";

type PageProps = { params: Promise<{ projectId: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { projectId } = await params;
  const project = await getProject(projectId);
  return { title: project?.name ?? "Project" };
}

export default async function ProjectPage({ params }: PageProps) {
  const { projectId } = await params;

  const [profile, project] = await Promise.all([
    requireProfile(),
    getProject(projectId),
  ]);

  // Either the project does not exist or RLS hid it — same response either way,
  // so a 404 does not confirm the existence of something you cannot see.
  if (!project) notFound();

  const [tasks, team] = await Promise.all([
    getProjectTasks(projectId),
    getTeam(),
  ]);

  return (
    <ProjectWorkspace
      project={project}
      tasks={tasks}
      team={team}
      profile={profile}
    />
  );
}
