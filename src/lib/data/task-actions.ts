"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  describeDatabaseError,
  fail,
  fieldErrorsFrom,
  ok,
  type ActionResult,
} from "@/lib/action-result";
import { isSearchable, likeFilterValue } from "@/lib/search";
import { followUpSchema, taskSchema, taskStatusSchema } from "@/lib/validation";
import type { TaskStatus } from "@/lib/supabase/database.types";

/**
 * Task mutations.
 *
 * As with projects, authorisation is Row Level Security's job. These actions
 * translate denials into messages rather than duplicating the role rules.
 */

/** Gap between adjacent cards. Large enough that midpoints stay well-spaced. */
const POSITION_STEP = 1024;

function parseTaskForm(formData: FormData) {
  return taskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? undefined,
    status: formData.get("status") ?? "todo",
    priority: formData.get("priority") ?? "medium",
    dueAt: formData.get("dueAt") ?? undefined,
    assigneeIds: formData.getAll("assigneeIds").map(String).filter(Boolean),
  });
}

/**
 * Revalidate every view a task shows up in.
 *
 * It lives on its project page (or /general when it has no project), but it is
 * also counted on /dashboard, listed in the /tasks browser, and dated on
 * /today — all of which went stale when only the first two were revalidated.
 */
function revalidateTaskViews(projectId: string | null) {
  revalidatePath(projectId ? `/projects/${projectId}` : "/general");
  revalidatePath("/dashboard");
  revalidatePath("/tasks");
  revalidatePath("/today");
}

/** Next position at the end of a status column. */
async function nextPosition(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string | null,
  status: TaskStatus,
): Promise<number> {
  const query = supabase
    .from("tasks")
    .select("position")
    .eq("status", status);

  // A general task is ordered among the other general tasks.
  const { data } = await (projectId
    ? query.eq("project_id", projectId)
    : query.is("project_id", null))
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.position ?? 0) + POSITION_STEP;
}

export async function createTask(
  projectId: string | null,
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = parseTaskForm(formData);
  if (!parsed.success) {
    return fail("action.checkFields", fieldErrorsFrom(parsed.error.issues));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("action.sessionExpired");

  const position = await nextPosition(supabase, projectId, parsed.data.status);

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      project_id: projectId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      status: parsed.data.status,
      priority: parsed.data.priority,
      due_at: parsed.data.dueAt || null,
      position,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return fail(describeDatabaseError(error));

  if (parsed.data.assigneeIds.length > 0) {
    const { error: assignError } = await supabase
      .from("task_assignments")
      .insert(
        parsed.data.assigneeIds.map((userId) => ({
          task_id: data.id,
          user_id: userId,
        })),
      );

    // The task itself was created; report the partial failure rather than
    // pretending the whole thing worked.
    if (assignError) {
      revalidateTaskViews(projectId);
      return fail(
        "action.assigneesNotSaved",
      );
    }
  }

  revalidateTaskViews(projectId);
  return ok({ id: data.id });
}

export async function updateTask(
  taskId: string,
  projectId: string | null,
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = parseTaskForm(formData);
  if (!parsed.success) {
    return fail("action.checkFields", fieldErrorsFrom(parsed.error.issues));
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tasks")
    .update({
      title: parsed.data.title,
      description: parsed.data.description || null,
      status: parsed.data.status,
      priority: parsed.data.priority,
      due_at: parsed.data.dueAt || null,
    })
    .eq("id", taskId)
    .select("id")
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!data) return fail("action.noPermissionEditTask");

  const syncError = await syncAssignees(supabase, taskId, parsed.data.assigneeIds);
  if (syncError) return fail(syncError);

  revalidateTaskViews(projectId);
  return ok({ id: taskId });
}

/**
 * Reconcile the assignment rows for a task against the desired set.
 *
 * Only the difference is written, so the audit triggers do not log spurious
 * "assignee removed then re-added" pairs on every save.
 */
async function syncAssignees(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskId: string,
  desired: string[],
): Promise<string | null> {
  const { data: existingRows, error: readError } = await supabase
    .from("task_assignments")
    .select("user_id")
    .eq("task_id", taskId);

  if (readError) return describeDatabaseError(readError);

  const existing = new Set((existingRows ?? []).map((row) => row.user_id));
  const wanted = new Set(desired);

  const toAdd = desired.filter((id) => !existing.has(id));
  const toRemove = [...existing].filter((id) => !wanted.has(id));

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("task_assignments")
      .insert(toAdd.map((userId) => ({ task_id: taskId, user_id: userId })));
    if (error) return describeDatabaseError(error);
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("task_assignments")
      .delete()
      .eq("task_id", taskId)
      .in("user_id", toRemove);
    if (error) return describeDatabaseError(error);
  }

  return null;
}

/**
 * Move a card on the Kanban board.
 *
 * `position` is supplied by the client as the midpoint between the cards the
 * drop landed between, so a move rewrites exactly one row.
 */
export async function moveTask(
  taskId: string,
  projectId: string | null,
  status: string,
  position: number,
): Promise<ActionResult<{ id: string }>> {
  const parsedStatus = taskStatusSchema.safeParse(status);
  if (!parsedStatus.success) return fail("action.unknownStatus");
  if (!Number.isFinite(position)) return fail("action.invalidDrop");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tasks")
    .update({ status: parsedStatus.data, position })
    .eq("id", taskId)
    .select("id")
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!data) return fail("action.noPermissionMoveTask");

  revalidateTaskViews(projectId);
  return ok({ id: taskId });
}

/**
 * Delete a task — into the bin, not out of existence.
 *
 * The task is hidden from every read at once and kept for thirty days, so
 * "I deleted the wrong one" has an answer: restoreTask, offered on the toast
 * for ten seconds and available in the database for a month. Who may do it
 * is decided inside trash_task, in the database, exactly as it was for the
 * hard delete this replaces.
 */
export async function deleteTask(
  taskId: string,
  projectId: string | null,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("trash_task", { task: taskId });

  if (error) return fail(describeDatabaseError(error));
  if (!data) return fail("action.noPermissionDeleteTask");

  revalidateTaskViews(projectId);
  return ok({ id: taskId });
}

/** Bring a deleted task back, with everything that was on it. */
export async function restoreTask(
  taskId: string,
  projectId: string | null,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("restore_task", { task: taskId });

  if (error) return fail(describeDatabaseError(error));
  if (!data) return fail("action.restoreFailed");

  revalidateTaskViews(projectId);
  return ok({ id: taskId });
}

/**
 * Change only a task's status.
 *
 * Members are view-only on task details, so they never submit the full task
 * form — a disabled input is not included in FormData, and sending the form
 * anyway would blank the fields they cannot see. This narrow action lets an
 * assignee report progress without touching anything else.
 */
export async function changeTaskStatus(
  taskId: string,
  projectId: string | null,
  status: string,
): Promise<ActionResult<{ status: TaskStatus }>> {
  const parsed = taskStatusSchema.safeParse(status);
  if (!parsed.success) return fail("action.unknownStatus");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tasks")
    .update({ status: parsed.data })
    .eq("id", taskId)
    .select("status")
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!data) return fail("action.noPermissionUpdateTask");

  revalidateTaskViews(projectId);
  return ok({ status: data.status });
}

/**
 * Move a task's due date without opening the whole edit form.
 *
 * Rescheduling is the single most common edit during a daily review — work
 * slips and gets pushed — so it gets its own narrow action rather than
 * round-tripping every field.
 */
export async function rescheduleTask(
  taskId: string,
  projectId: string | null,
  dueAt: string | null,
): Promise<ActionResult<{ dueAt: string | null }>> {
  if (dueAt !== null && Number.isNaN(new Date(dueAt).getTime())) {
    return fail("action.invalidDate");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tasks")
    .update({ due_at: dueAt })
    .eq("id", taskId)
    .select("due_at")
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!data) return fail("action.noPermissionReschedule");

  revalidateTaskViews(projectId);
  return ok({ dueAt: data.due_at });
}

/** Set or clear when a task should next be chased. */
export async function setFollowUp(
  taskId: string,
  projectId: string | null,
  input: { followUpAt: string; note?: string } | null,
): Promise<ActionResult<void>> {
  const supabase = await createClient();

  // Clearing the date clears the note with it; the database rejects a note
  // with no date, since it would never surface in the follow-up list.
  const payload =
    input === null
      ? { follow_up_at: null, follow_up_note: null }
      : (() => {
          const parsed = followUpSchema.safeParse(input);
          if (!parsed.success) return null;
          return {
            follow_up_at: parsed.data.followUpAt,
            follow_up_note: parsed.data.note?.trim() || null,
          };
        })();

  if (payload === null && input !== null) {
    return fail("follow.pickValid");
  }

  const { data, error } = await supabase
    .from("tasks")
    .update(payload!)
    .eq("id", taskId)
    .select("id")
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!data) return fail("action.noPermissionFollowUp");

  revalidateTaskViews(projectId);
  return ok(undefined);
}

/**
 * Free-text search across every task the caller can see.
 *
 * The palette knows the pages of the app; it did not know its contents, so
 * looking for a task meant remembering which project it lived in. RLS decides
 * what is searchable, so a member searches their own work and an admin
 * searches the workspace, with no role check needed here.
 */
export type TaskSearchHit = {
  id: string;
  title: string;
  status: TaskStatus;
  projectId: string | null;
  projectName: string | null;
};

export async function searchTasks(term: string): Promise<TaskSearchHit[]> {
  const needle = term.trim();
  if (!isSearchable(needle)) return [];

  const supabase = await createClient();
  // Quoted: an `or` filter is comma-separated, and a search term may not be.
  const pattern = likeFilterValue(needle);

  const { data, error } = await supabase
    .from("tasks")
    // Named for the same reason as the owner embed in getMyNotes: `tasks`
    // holds one key to `projects`, but `notifications` points at both, and
    // where exactly PostgREST draws the line on what counts as a junction is
    // not worth finding out from a search that silently returns nothing.
    .select("id, title, status, project_id, project:projects!tasks_project_id_fkey(name)")
    .or(`title.ilike.${pattern},description.ilike.${pattern}`)
    .order("updated_at", { ascending: false })
    .limit(8);

  if (error) return [];

  return (data ?? []).map((row) => {
    const task = row as unknown as {
      id: string;
      title: string;
      status: TaskStatus;
      project_id: string | null;
      project: { name: string } | null;
    };
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      projectId: task.project_id,
      projectName: task.project?.name ?? null,
    };
  });
}
