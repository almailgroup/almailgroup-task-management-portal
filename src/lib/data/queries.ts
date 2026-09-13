import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type {
  CommentWithAuthor,
  NotificationWithActor,
  Profile,
  Project,
  Task,
  TaskActivityWithActor,
  TaskAttachment,
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

  // The handle_new_user trigger creates this row at signup. Its absence means
  // the account exists in auth but not in the app — typically the migrations
  // were never applied, or the user was created out of band.
  //
  // Redirecting straight to /login would loop, because the middleware sends
  // anyone holding a valid session back to /dashboard. Go via the sign-out
  // route, which can actually clear the session, and say what is wrong.
  if (!profile) {
    redirect(
      `/auth/signout?error=${encodeURIComponent(
        "Your account has no profile yet. If this is a new deployment, the database migrations may not have been applied.",
      )}`,
    );
  }

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

/** Tasks belonging to no project — the General Tasks list. */
export const getGeneralTasks = cache(async (): Promise<TaskWithAssignees[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select("*, assignments:task_assignments(user:profiles(*))")
    .is("project_id", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) =>
    withAssignees(row as unknown as Task & { assignments: AssignmentEmbed }),
  );
});

export const getTaskAttachments = cache(
  async (taskId: string): Promise<TaskAttachment[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("task_attachments")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });

    return data ?? [];
  },
);

/**
 * The signed-in user's notifications, newest first.
 *
 * RLS restricts this to their own rows, so there is no user filter here.
 */
export const getNotifications = cache(
  async (limit = 30): Promise<NotificationWithActor[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("notifications")
      .select("*, actor:profiles(*)")
      .order("created_at", { ascending: false })
      .limit(limit);

    return (data ?? []) as unknown as NotificationWithActor[];
  },
);

export const getUnreadNotificationCount = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  return count ?? 0;
});

/** Whether the signed-in user may mark tasks done (manager or admin). */
export const canCompleteTasks = cache(async (): Promise<boolean> => {
  const profile = await requireProfile();
  return profile.role === "admin" || profile.role === "manager";
});

/**
 * Members of a project.
 *
 * RLS already hides projects the caller cannot see, so an empty result here
 * means either no members or no access — both of which render the same.
 */
export const getProjectMembers = cache(
  async (projectId: string): Promise<Profile[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("project_members")
      .select("user:profiles(*)")
      .eq("project_id", projectId);

    return ((data ?? []) as unknown as { user: Profile | null }[])
      .map((row) => row.user)
      .filter((profile): profile is Profile => profile !== null)
      .sort((a, b) =>
        (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email),
      );
  },
);

/**
 * Tasks carrying a follow-up date, soonest first.
 *
 * RLS scopes this to what the caller can see, so a manager gets the whole
 * chase list while a member only sees follow-ups on their own work.
 */
export const getFollowUps = cache(
  async (
    opts: { generalOnly?: boolean } = {},
  ): Promise<TaskWithAssignees[]> => {
    const supabase = await createClient();
    let query = supabase
      .from("tasks")
      .select("*, assignments:task_assignments(user:profiles(*))")
      .not("follow_up_at", "is", null)
      .neq("status", "done")
      .order("follow_up_at", { ascending: true });

    if (opts.generalOnly) query = query.is("project_id", null);

    const { data } = await query;
    return (data ?? []).map((row) =>
      withAssignees(row as unknown as Task & { assignments: AssignmentEmbed }),
    );
  },
);
