import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type {
  CommentWithAuthor,
  Profile,
  Project,
  Task,
  TaskActivityWithActor,
  TaskWithAssignees,
} from "@/lib/supabase/database.types";

/**
 * Server-side reads.
 *
 * Every query runs as the signed-in user, so Row Level Security — not code in
 * this file — is what decides visibility. `cache()` deduplicates repeat calls
 * within a single request (e.g. layout and page both needing the profile).
 */

/** The signed-in user's profile, or redirect to login. */
export const requireProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // The signup trigger creates this row. A missing profile means the user was
  // created out of band, so send them back through auth rather than crashing.
  if (!profile) redirect("/login");

  return profile;
});

export const getProjects = cache(async (): Promise<Project[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  return data ?? [];
});

export const getProject = cache(
  async (projectId: string): Promise<Project | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle();

    return data;
  },
);

export const getTeam = cache(async (): Promise<Profile[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("full_name", { ascending: true, nullsFirst: false });

  return data ?? [];
});

/** Shape returned by the assignee embed below. */
type AssignmentEmbed = { user: Profile | null }[] | null;

function withAssignees<T extends Task & { assignments: AssignmentEmbed }>(
  row: T,
): TaskWithAssignees {
  const { assignments, ...task } = row;
  return {
    ...task,
    assignees: (assignments ?? [])
      .map((a) => a.user)
      .filter((p): p is Profile => p !== null),
  };
}

/**
 * Tasks for one project, with assignees resolved in a single round trip.
 *
 * Ordered by status then position so the Kanban columns and the list view can
 * both consume the same result.
 */
export const getProjectTasks = cache(
  async (projectId: string): Promise<TaskWithAssignees[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("tasks")
      .select("*, assignments:task_assignments(user:profiles(*))")
      .eq("project_id", projectId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: false });

    return (data ?? []).map((row) =>
      withAssignees(row as unknown as Task & { assignments: AssignmentEmbed }),
    );
  },
);

export const getTask = cache(
  async (taskId: string): Promise<TaskWithAssignees | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("tasks")
      .select("*, assignments:task_assignments(user:profiles(*))")
      .eq("id", taskId)
      .maybeSingle();

    if (!data) return null;
    return withAssignees(
      data as unknown as Task & { assignments: AssignmentEmbed },
    );
  },
);

export const getTaskComments = cache(
  async (taskId: string): Promise<CommentWithAuthor[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("comments")
      .select("*, author:profiles(*)")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });

    return (data ?? []) as unknown as CommentWithAuthor[];
  },
);

export const getTaskActivity = cache(
  async (taskId: string): Promise<TaskActivityWithActor[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("task_activity")
      .select("*, actor:profiles(*)")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(100);

    return (data ?? []) as unknown as TaskActivityWithActor[];
  },
);

/** Every task across every visible project — powers the dashboard metrics. */
export const getAllTasks = cache(async (): Promise<TaskWithAssignees[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select("*, assignments:task_assignments(user:profiles(*))")
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) =>
    withAssignees(row as unknown as Task & { assignments: AssignmentEmbed }),
  );
});
