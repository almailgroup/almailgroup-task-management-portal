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
import { projectSchema } from "@/lib/validation";

/**
 * Project mutations.
 *
 * Authorisation is left to Row Level Security — these actions do not re-check
 * roles. A denied write comes back as a Postgres error, which is translated
 * into a message for the form. That way there is exactly one source of truth
 * for who may do what.
 */

async function requireUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

export async function createProject(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
  });

  if (!parsed.success) {
    return fail("Check the fields below.", fieldErrorsFrom(parsed.error.issues));
  }

  const { supabase, userId } = await requireUserId();
  if (!userId) return fail("Your session expired. Please sign in again.");

  const { data, error } = await supabase
    .from("projects")
    .insert({
      name: parsed.data.name,
      description: parsed.data.description || null,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) return fail(describeDatabaseError(error));

  revalidatePath("/", "layout");
  return ok({ id: data.id });
}

export async function updateProject(
  projectId: string,
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
  });

  if (!parsed.success) {
    return fail("Check the fields below.", fieldErrorsFrom(parsed.error.issues));
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
    })
    .eq("id", projectId)
    .select("id")
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  // No row came back: RLS filtered the update out rather than erroring.
  if (!data) return fail("You do not have permission to edit this project.");

  revalidatePath("/", "layout");
  return ok({ id: data.id });
}

export async function deleteProject(
  projectId: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .select("id")
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!data) return fail("You do not have permission to delete this project.");

  revalidatePath("/", "layout");
  return ok({ id: data.id });
}
