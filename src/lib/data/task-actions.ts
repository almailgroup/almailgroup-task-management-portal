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
import { taskSchema, taskStatusSchema } from "@/lib/validation";
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
    dueDate: formData.get("dueDate") ?? undefined,
    assigneeIds: formData.getAll("assigneeIds").map(String).filter(Boolean),
  });
}

/** Next position at the end of a status column. */
async function nextPosition(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  status: TaskStatus,
): Promise<number> {
  const { data } = await supabase
    .from("tasks")
    .select("position")
    .eq("project_id", projectId)
    .eq("status", status)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.position ?? 0) + POSITION_STEP;
}

export async function createTask(
  projectId: string,
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = parseTaskForm(formData);
  if (!parsed.success) {
    return fail("Check the fields below.", fieldErrorsFrom(parsed.error.issues));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Your session expired. Please sign in again.");

  const position = await nextPosition(supabase, projectId, parsed.data.status);

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      project_id: projectId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      status: parsed.data.status,
      priority: parsed.data.priority,
      due_date: parsed.data.dueDate || null,
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
      revalidatePath(`/projects/${projectId}`);
      return fail(
        "Task created, but the assignees could not be saved. Try editing the task.",
      );
    }
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  return ok({ id: data.id });
}

export async function updateTask(
  taskId: string,
  projectId: string,
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = parseTaskForm(formData);
  if (!parsed.success) {
    return fail("Check the fields below.", fieldErrorsFrom(parsed.error.issues));
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tasks")
    .update({
      title: parsed.data.title,
      description: parsed.data.description || null,
      status: parsed.data.status,
      priority: parsed.data.priority,
      due_date: parsed.data.dueDate || null,
    })
    .eq("id", taskId)
    .select("id")
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!data) return fail("You do not have permission to edit this task.");

  const syncError = await syncAssignees(supabase, taskId, parsed.data.assigneeIds);
  if (syncError) return fail(syncError);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
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
  projectId: string,
  status: string,
  position: number,
): Promise<ActionResult<{ id: string }>> {
  const parsedStatus = taskStatusSchema.safeParse(status);
  if (!parsedStatus.success) return fail("Unknown status.");
  if (!Number.isFinite(position)) return fail("Invalid drop position.");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tasks")
    .update({ status: parsedStatus.data, position })
    .eq("id", taskId)
    .select("id")
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!data) return fail("You do not have permission to move this task.");

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  return ok({ id: taskId });
}

export async function deleteTask(
  taskId: string,
  projectId: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .select("id")
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!data) return fail("You do not have permission to delete this task.");

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  return ok({ id: taskId });
}
