import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  VERIFIED_MUST_CHANGE_PASSWORD,
  VERIFIED_USER,
} from "@/lib/supabase/middleware";
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
  ConversationSummary,
  DirectMessageWithAuthor,
  TeamMessageWithAuthor,
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

/**
 * A failed read is not an empty one.
 *
 * Discarding the error and falling back to `[]` renders a confident lie: when
 * the database timed out, the dashboard said "0 projects" and offered to help
 * create the first one, while the workspace was sitting there unreachable.
 * Throwing hands the page to the error boundary, which says so and offers to
 * try again.
 *
 * Used for the reads a page is *about*. Peripheral ones — the notification
 * bell, say — still degrade quietly rather than taking a working page down.
 */
function orFail<T>(
  result: { data: T | null; error: { message: string; code?: string } | null },
  where: string,
): T | null {
  if (result.error) {
    reportQueryError(where, result.error);
    throw new Error(`Could not load ${where}.`);
  }
  return result.data;
}

/**
 * The identity the middleware already verified for this request.
 *
 * `getUser()` is a round trip to the auth server, and the middleware makes it
 * on every request before the render begins — so making it again here put a
 * second one on the critical path of every page, asking the same question and
 * waiting for the same answer. The middleware writes what it learned onto the
 * request instead.
 *
 * These headers cannot be forged: the middleware strips them from the incoming
 * request on every path through it before writing its own, and its matcher
 * covers every route. Where they are absent — nothing but a context the
 * middleware did not run in — the question is asked properly below.
 */
const verified = cache(async () => {
  const sent = await headers();
  const id = sent.get(VERIFIED_USER);
  return id
    ? { id, mustChangePassword: sent.get(VERIFIED_MUST_CHANGE_PASSWORD) === "1" }
    : null;
});

/**
 * The signed-in user's id, or null.
 *
 * Cached because more than one thing per request wants it — the profile, and
 * the password check below.
 */
const getUserId = cache(async (): Promise<string | null> => {
  const known = await verified();
  if (known) return known.id;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
});

/**
 * Whether this account is still on the one-time password an admin issued.
 *
 * Set when the account is created and cleared the moment a password is chosen.
 * It lives in the user's own metadata, so it is a nudge rather than a lock —
 * the account is already theirs either way.
 */
export const needsOwnPassword = cache(async (): Promise<boolean> => {
  const known = await verified();
  if (known) return known.mustChangePassword;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.user_metadata?.must_change_password === true;
});

/** The signed-in user's profile, or redirect to login. */
export const requireProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const userId = await getUserId();

  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
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
  const result = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  return orFail(result, "projects") ?? [];
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
  const result = await supabase
    .from("profiles")
    .select("*")
    .order("full_name", { ascending: true, nullsFirst: false });

  return orFail(result, "the team") ?? [];
});

/** Shape returned by the assignee embed below. */
type AssignmentEmbed = { user: Profile | null }[] | null;

/**
 * The one shape every task list asks for: the task, and its assignees resolved
 * in the same round trip. Written out seven times, it was seven chances for a
 * list to quietly come back without its avatars.
 */
const TASK_WITH_ASSIGNEES = "*, assignments:task_assignments(user:profiles(*))";

/** The same, but `!inner` drops tasks nobody is assigned to. */
const TASK_ASSIGNED_TO_SOMEONE =
  "*, assignments:task_assignments!inner(user:profiles(*))";

/** Rows straight from a `TASK_WITH_ASSIGNEES` select, flattened. */
function toTasks(data: unknown): TaskWithAssignees[] {
  return ((data ?? []) as (Task & { assignments: AssignmentEmbed })[]).map(
    withAssignees,
  );
}

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
    const result = await supabase
      .from("tasks")
      .select(TASK_WITH_ASSIGNEES)
      .eq("project_id", projectId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: false });

    return toTasks(orFail(result, "this project's tasks"));
  },
);

export const getTask = cache(
  async (taskId: string): Promise<TaskWithAssignees | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("tasks")
      .select(TASK_WITH_ASSIGNEES)
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
  const result = await supabase
    .from("tasks")
    .select(TASK_WITH_ASSIGNEES)
    .order("created_at", { ascending: false });

  return toTasks(orFail(result, "tasks"));
});

/** Tasks belonging to no project — the General Tasks list. */
export const getGeneralTasks = cache(async (): Promise<TaskWithAssignees[]> => {
  const supabase = await createClient();
  const result = await supabase
    .from("tasks")
    .select(TASK_WITH_ASSIGNEES)
    .is("project_id", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: false });

  return toTasks(orFail(result, "general tasks"));
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
      .select(TASK_WITH_ASSIGNEES)
      .not("follow_up_at", "is", null)
      .neq("status", "done")
      .order("follow_up_at", { ascending: true });

    if (opts.generalOnly) query = query.is("project_id", null);

    return toTasks(orFail(await query, "follow-ups"));
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
  const userId = await getUserId();

  /**
   * RLS returns the caller's own lists and the ones shared with them, so this
   * is both at once — which is why each note has to say whose it is.
   *
   * `owner` names its foreign key even though `personal_notes` reaches
   * `profiles` through only one of its own columns. PostgREST also resolves
   * many-to-many relationships through junction tables, and both
   * `personal_note_items` and `personal_note_shares` point at a note and at a
   * profile — which makes them junctions, and makes a bare `profiles(*)` here
   * ambiguous four ways over.
   */
  const withShares = await supabase
    .from("personal_notes")
    .select(
      "*, items:personal_note_items(*), owner:profiles!personal_notes_user_id_fkey(*), shares:personal_note_shares(user:profiles!personal_note_shares_user_id_fkey(*))",
    )
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  /**
   * Sharing arrived in migration 0019, and app code deploys before anybody
   * runs SQL. Asking for a table that is not there yet would otherwise take
   * the whole page down — for a feature nobody has used yet — so the lists
   * themselves are fetched again without it. Sharing stays unavailable until
   * the migration lands; reading your own list does not wait for it.
   */
  const result = withShares.error
    ? await (() => {
        reportQueryError("getMyNotes:shares", withShares.error);
        return supabase
          .from("personal_notes")
          .select("*, items:personal_note_items(*), owner:profiles!personal_notes_user_id_fkey(*)")
          .order("pinned", { ascending: false })
          .order("updated_at", { ascending: false });
      })()
    : withShares;

  const notes = orFail(result, "your list") ?? [];

  type Row = NoteWithItems & {
    shares: { user: Profile | null }[] | null;
  };

  return (notes as unknown as Row[]).map(({ shares, ...note }) => ({
    ...note,
    items: [...(note.items ?? [])].sort((a, b) => a.position - b.position),
    collaborators: (shares ?? [])
      .map((share) => share.user)
      .filter((profile): profile is Profile => profile !== null)
      .sort((a, b) =>
        (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email),
      ),
    mine: note.user_id === userId,
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
/**
 * The team room, oldest last.
 *
 * Bounded: a room read from the top would grow without limit and the first
 * paint would get slower every week. The newest `limit` are fetched — which
 * means asking for them newest-first — and then reversed, because a
 * conversation reads downwards.
 */
export const getTeamMessages = cache(
  async (limit = 100): Promise<TeamMessageWithAuthor[]> => {
    const supabase = await createClient();
    const result = await supabase
      .from("team_messages")
      .select("*, author:profiles(*)")
      .order("created_at", { ascending: false })
      .limit(limit);

    const rows = (orFail(result, "the team chat") ?? []) as unknown as
      TeamMessageWithAuthor[];
    return rows.reverse();
  },
);

/**
 * Every private conversation this person is in, most recent first.
 *
 * One round trip. Asked the obvious way this is a query for the threads and
 * then two more for each of them — the last thing said and the unread count —
 * which is forty-one round trips at twenty conversations. `my_conversations()`
 * answers all of it in one statement, and runs as the caller, so row-level
 * security still decides what comes back.
 */
export const getConversations = cache(async (): Promise<ConversationSummary[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_conversations");
  if (error) {
    orFail({ data: null, error }, "your messages");
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    lastMessageAt: row.last_message_at,
    other: row.other_id
      ? {
          id: row.other_id,
          full_name: row.other_name,
          email: row.other_email,
          avatar_url: row.other_avatar,
          job_title: row.other_title,
        }
      : null,
    lastMessage: row.last_message,
    lastAuthorId: row.last_author_id,
    unread: Number(row.unread ?? 0),
  }));
});

/**
 * How many private messages are waiting, across every conversation.
 *
 * Its own function rather than a sum of the list above: the app shell draws
 * this badge on every page, and most of those pages will never show a
 * conversation. One number is cheaper to ask for than a list to add up.
 */
export const getUnreadDirectCount = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unread_direct_count");
  // A badge is not worth failing a page for. Every other read on the shell
  // would have to succeed for this one to be reached anyway.
  if (error) return 0;
  return Number(data ?? 0);
});

/**
 * One thread, newest `limit` messages, oldest first for reading.
 *
 * Returns null when the conversation is not yours: RLS answers an empty set
 * rather than an error, and the page turns that into a 404 rather than an
 * empty room that looks like it belongs to you.
 */
export const getDirectMessages = cache(
  async (
    conversationId: string,
    limit = 100,
  ): Promise<DirectMessageWithAuthor[] | null> => {
    const supabase = await createClient();

    const conversation = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conversation.data) return null;

    const result = await supabase
      .from("direct_messages")
      .select("*, author:profiles(*)")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    const rows = (orFail(result, "this conversation") ?? []) as unknown as
      DirectMessageWithAuthor[];
    return rows.reverse();
  },
);

/** Who a conversation is with. Null when it is not yours to see. */
export const getConversationPartner = cache(
  async (conversationId: string): Promise<Profile | null> => {
    const supabase = await createClient();
    const me = await getUserId();
    if (!me) return null;

    const result = await supabase
      .from("conversation_participants")
      .select("user_id, profile:profiles(*)")
      .eq("conversation_id", conversationId)
      .neq("user_id", me)
      .limit(1)
      .maybeSingle();

    return ((result.data as unknown as { profile: Profile | null } | null)
      ?.profile) ?? null;
  },
);

export const getTaskCounts = cache(async (): Promise<Metrics> => {
  const supabase = await createClient();

  // "Due today" is the viewer's day, not the database's. The browser stores
  // its IANA zone in a cookie; an unknown or missing name falls back to UTC
  // inside the function rather than failing the whole dashboard.
  const timeZone = (await cookies()).get("tz")?.value || "UTC";

  const counts = orFail(
    await supabase.rpc("task_counts", { tz: timeZone }),
    "your figures",
  );
  const row = counts?.[0];

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
  const [counts, team] = await Promise.all([
    supabase.rpc("workload_counts").then((result) => orFail(result, "the workload")),
    getTeam(),
  ]);

  const byUser = new Map((counts ?? []).map((row) => [row.user_id, row]));

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
    // `getUserId` reads the id the middleware already verified, so this does
    // not put a round trip to the auth server in front of its own query. On
    // the dashboard that round trip was the difference between eleven calls in
    // two waves and eleven calls in three.
    const [supabase, userId] = await Promise.all([createClient(), getUserId()]);
    if (!userId) return [];

    const result = await supabase
      .from("tasks")
      .select(TASK_ASSIGNED_TO_SOMEONE)
      .eq("assignments.user_id", userId)
      .neq("status", "done")
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(limit);

    return toTasks(orFail(result, "your tasks"));
  },
);

/** The overdue work, soonest-overdue first, bounded. */
export const getOverdueTasks = cache(
  async (limit = 6): Promise<TaskWithAssignees[]> => {
    const supabase = await createClient();
    const result = await supabase
      .from("tasks")
      .select(TASK_WITH_ASSIGNEES)
      .neq("status", "done")
      .lt("due_at", new Date().toISOString())
      .order("due_at", { ascending: true })
      .limit(limit);

    return toTasks(orFail(result, "overdue tasks"));
  },
);
