import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Metrics, Workload } from "@/lib/metrics";
import type {
  CommentWithAuthor,
  NoteWithItems,
  NotificationWithActor,
  Profile,
  Project,
  Task,
  TaskActivityWithActor,
  NotificationPreferences,
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

/**
 * Say so when a read fails.
 *
 * Most queries here discard their error and fall back to an empty list, which
 * renders identically to "there is nothing here". That is the right thing for
 * the page — a missing sidebar section beats a crash — but it must not also be
 * silent in the logs, or a broken query looks like an empty database.
 */
function reportQueryError(where: string, error: { message: string; code?: string }) {
  console.error(`[query:${where}] ${error.code ?? "error"}: ${error.message}`);
}

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
    const { data, error } = await supabase
      .from("notifications")
      // Ambiguous without the hint: notifications reference profiles through
      // both user_id and actor_id.
      .select("*, actor:profiles!notifications_actor_id_fkey(*)")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) reportQueryError("getNotifications", error);

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
 * `project_members` points at `profiles` twice — once for the member, once for
 * whoever added them — so the embed has to name which foreign key it travels.
 * Left ambiguous, PostgREST rejects the whole request (PGRST201) rather than
 * guessing, and the list comes back empty: the member is really on the project
 * and can see it, but nobody appears here and so nobody can be removed either.
 *
 * RLS already hides projects the caller cannot see, so an empty result here
 * means either no members or no access — both of which render the same.
 */
export const getProjectMembers = cache(
  async (projectId: string): Promise<Profile[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_members")
      .select("user:profiles!project_members_user_id_fkey(*)")
      .eq("project_id", projectId);

    if (error) {
      reportQueryError("getProjectMembers", error);
      // An embed that will not resolve must not cost people their members
      // list, so fall back to the two plain reads it was a shorthand for.
      return byName(await membersTheLongWay(projectId));
    }

    return byName(
      ((data ?? []) as unknown as { user: Profile | null }[])
        .map((row) => row.user)
        .filter((profile): profile is Profile => profile !== null),
    );
  },
);

const byName = (people: Profile[]) =>
  [...people].sort((a, b) =>
    (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email),
  );

/** Membership and profiles read separately — no relationship to resolve. */
async function membersTheLongWay(projectId: string): Promise<Profile[]> {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId);

  if (error) {
    reportQueryError("getProjectMembers:ids", error);
    return [];
  }

  const ids = (rows ?? []).map((row) => row.user_id);
  if (ids.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("*")
    .in("id", ids);

  if (profilesError) {
    reportQueryError("getProjectMembers:profiles", profilesError);
    return [];
  }

  return profiles ?? [];
}

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

/** The signed-in user's reminder settings. RLS scopes this to their own row. */
export const getNotificationPreferences = cache(
  async (): Promise<NotificationPreferences | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("notification_preferences")
      .select("*")
      .maybeSingle();

    return data;
  },
);

/**
 * The signed-in user's personal notes, with their checklists.
 *
 * RLS restricts both tables to the caller's own rows, so there is no user
 * filter here — and no way for one to leak into someone else's list.
 *
 * Pinned first, then most recently touched, which matches the order the list
 * renders in. Ticking an item bumps the note (a trigger does it), so a list
 * you are working through floats to the top.
 */
export const getMyNotes = cache(async (): Promise<NoteWithItems[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("personal_notes")
    .select("*, items:personal_note_items(*)")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  return ((data ?? []) as unknown as NoteWithItems[]).map((note) => ({
    ...note,
    items: [...(note.items ?? [])].sort((a, b) => a.position - b.position),
  }));
});

/**
 * The dashboard's six figures, counted in Postgres.
 *
 * This used to fetch every task the viewer could see and reduce it in
 * JavaScript — the rows were serialised and shipped only to become six
 * numbers. The function is SECURITY INVOKER, so the counts are filtered by
 * the caller's own RLS exactly as the old query was.
 */
export const getTaskCounts = cache(async (): Promise<Metrics> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("task_counts");
  const row = data?.[0];

  const total = Number(row?.total ?? 0);
  const done = Number(row?.done ?? 0);

  return {
    total,
    done,
    pending: total - done,
    todo: Number(row?.todo ?? 0),
    inProgress: Number(row?.in_progress ?? 0),
    inReview: Number(row?.in_review ?? 0),
    overdue: Number(row?.overdue ?? 0),
    dueToday: Number(row?.due_today ?? 0),
    completionRate: total === 0 ? 0 : Math.round((done / total) * 100),
  };
});

/** Per-person open/done/overdue, busiest first. Counted in Postgres too. */
export const getWorkload = cache(async (): Promise<Workload[]> => {
  const supabase = await createClient();
  const [{ data }, team] = await Promise.all([
    supabase.rpc("workload_counts"),
    getTeam(),
  ]);

  const byUser = new Map((data ?? []).map((row) => [row.user_id, row]));

  return team
    .map((profile) => {
      const row = byUser.get(profile.id);
      return {
        profile,
        open: Number(row?.open ?? 0),
        done: Number(row?.done ?? 0),
        overdue: Number(row?.overdue ?? 0),
      };
    })
    .filter((entry) => entry.open > 0 || entry.done > 0)
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open);
});

/** A short, bounded list rather than "every task, then slice(0, n)". */
export const getMyOpenTasks = cache(
  async (limit = 6): Promise<TaskWithAssignees[]> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
      .from("tasks")
      .select("*, assignments:task_assignments!inner(user:profiles(*))")
      .eq("assignments.user_id", user.id)
      .neq("status", "done")
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(limit);

    return (data ?? []).map((row) =>
      withAssignees(row as unknown as Task & { assignments: AssignmentEmbed }),
    );
  },
);

/** The overdue work, soonest-overdue first, bounded. */
export const getOverdueTasks = cache(
  async (limit = 6): Promise<TaskWithAssignees[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("tasks")
      .select("*, assignments:task_assignments(user:profiles(*))")
      .neq("status", "done")
      .lt("due_at", new Date().toISOString())
      .order("due_at", { ascending: true })
      .limit(limit);

    return (data ?? []).map((row) =>
      withAssignees(row as unknown as Task & { assignments: AssignmentEmbed }),
    );
  },
);
