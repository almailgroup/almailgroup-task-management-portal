"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  describeDatabaseError,
  fail,
  ok,
  type ActionResult,
} from "@/lib/action-result";
import type { PersonalNote, PersonalNoteItem } from "@/lib/supabase/database.types";

/**
 * My List — personal note mutations.
 *
 * Every statement is scoped to the caller's own rows by RLS, so none of these
 * carry a user filter of their own beyond the owner column an insert has to
 * set. A write that touches somebody else's note comes back as zero rows,
 * which is reported as a permission failure rather than a crash.
 */

/** Gap between adjacent checklist items, so inserts between two stay exact. */
const POSITION_STEP = 1024;

const uuid = z.string().uuid();
const titleSchema = z.string().trim().max(200);
const bodySchema = z.string().max(20_000);
const contentSchema = z.string().max(1000);

async function currentUserId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function createNote(
  title = "",
): Promise<ActionResult<PersonalNote>> {
  const parsed = titleSchema.safeParse(title);
  if (!parsed.success) return fail("That title is too long.");

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return fail("Your session expired. Please sign in again.");

  const { data, error } = await supabase
    .from("personal_notes")
    .insert({ user_id: userId, title: parsed.data })
    .select("*")
    .single();

  if (error) return fail(describeDatabaseError(error));

  revalidatePath("/my-list");
  return ok(data as PersonalNote);
}

/** Save a note's title and body. Called on a debounce as the user types. */
export async function saveNote(
  noteId: string,
  input: { title: string; body: string },
): Promise<ActionResult<{ updatedAt: string }>> {
  if (!uuid.safeParse(noteId).success) return fail("Unknown note.");

  const title = titleSchema.safeParse(input.title);
  const body = bodySchema.safeParse(input.body);
  if (!title.success) return fail("Keep the title under 200 characters.");
  if (!body.success) return fail("That note is too long to save.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("personal_notes")
    .update({ title: title.data, body: body.data })
    .eq("id", noteId)
    .select("updated_at")
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!data) return fail("That note no longer exists.");

  revalidatePath("/my-list");
  return ok({ updatedAt: data.updated_at });
}

export async function setNotePinned(
  noteId: string,
  pinned: boolean,
): Promise<ActionResult<void>> {
  if (!uuid.safeParse(noteId).success) return fail("Unknown note.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("personal_notes")
    .update({ pinned })
    .eq("id", noteId)
    .select("id")
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!data) return fail("That note no longer exists.");

  revalidatePath("/my-list");
  return ok(undefined);
}

export async function deleteNote(
  noteId: string,
): Promise<ActionResult<void>> {
  if (!uuid.safeParse(noteId).success) return fail("Unknown note.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("personal_notes")
    .delete()
    .eq("id", noteId)
    .select("id")
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!data) return fail("That note no longer exists.");

  revalidatePath("/my-list");
  return ok(undefined);
}

/**
 * Append a checklist item.
 *
 * The position is read back from the note's own items rather than counted on
 * the client, so two devices adding at once cannot land on the same slot.
 */
export async function addNoteItem(
  noteId: string,
  content = "",
): Promise<ActionResult<PersonalNoteItem>> {
  if (!uuid.safeParse(noteId).success) return fail("Unknown note.");
  const parsed = contentSchema.safeParse(content);
  if (!parsed.success) return fail("That line is too long.");

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return fail("Your session expired. Please sign in again.");

  const { data: last } = await supabase
    .from("personal_note_items")
    .select("position")
    .eq("note_id", noteId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("personal_note_items")
    .insert({
      note_id: noteId,
      user_id: userId,
      content: parsed.data,
      position: (last?.position ?? 0) + POSITION_STEP,
    })
    .select("*")
    .single();

  if (error) return fail(describeDatabaseError(error));

  revalidatePath("/my-list");
  return ok(data as PersonalNoteItem);
}

export async function updateNoteItem(
  itemId: string,
  input: { content?: string; done?: boolean },
): Promise<ActionResult<void>> {
  if (!uuid.safeParse(itemId).success) return fail("Unknown item.");

  const patch: { content?: string; done?: boolean } = {};

  if (input.content !== undefined) {
    const parsed = contentSchema.safeParse(input.content);
    if (!parsed.success) return fail("That line is too long.");
    patch.content = parsed.data;
  }
  if (input.done !== undefined) patch.done = input.done;
  if (Object.keys(patch).length === 0) return ok(undefined);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("personal_note_items")
    .update(patch)
    .eq("id", itemId)
    .select("id")
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));
  if (!data) return fail("That line no longer exists.");

  revalidatePath("/my-list");
  return ok(undefined);
}

export async function deleteNoteItem(
  itemId: string,
): Promise<ActionResult<void>> {
  if (!uuid.safeParse(itemId).success) return fail("Unknown item.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("personal_note_items")
    .delete()
    .eq("id", itemId);

  if (error) return fail(describeDatabaseError(error));

  revalidatePath("/my-list");
  return ok(undefined);
}

/** Clear every ticked line — the "start tomorrow fresh" button. */
export async function clearDoneItems(
  noteId: string,
): Promise<ActionResult<void>> {
  if (!uuid.safeParse(noteId).success) return fail("Unknown note.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("personal_note_items")
    .delete()
    .eq("note_id", noteId)
    .eq("done", true);

  if (error) return fail(describeDatabaseError(error));

  revalidatePath("/my-list");
  return ok(undefined);
}

/**
 * Sharing a list.
 *
 * Who may do what is decided by the policies in migration 0019, not here: the
 * owner invites and removes, a collaborator may remove only themselves, and a
 * write that is not allowed comes back as zero rows rather than an error. Each
 * of these reports that as a permission failure.
 */

export async function shareNote(
  noteId: string,
  userId: string,
): Promise<ActionResult<void>> {
  if (!uuid.safeParse(noteId).success) return fail("Unknown note.");
  if (!uuid.safeParse(userId).success) return fail("Unknown person.");

  const supabase = await createClient();
  const currentId = await currentUserId(supabase);
  if (!currentId) return fail("Your session expired. Please sign in again.");
  if (currentId === userId) return fail("This list is already yours.");

  const { error } = await supabase
    .from("personal_note_shares")
    .insert({ note_id: noteId, user_id: userId, added_by: currentId });

  // Already shared: nothing to do, and not worth an error.
  if (error && error.code !== "23505") {
    return fail(
      error.code === "42501"
        ? "Only the owner of a list can share it."
        : describeDatabaseError(error),
    );
  }

  revalidatePath("/my-list");
  return ok(undefined);
}

/** Remove somebody from a list. Passing your own id is how you leave one. */
export async function unshareNote(
  noteId: string,
  userId: string,
): Promise<ActionResult<void>> {
  if (!uuid.safeParse(noteId).success) return fail("Unknown note.");
  if (!uuid.safeParse(userId).success) return fail("Unknown person.");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("personal_note_shares")
    .delete()
    .eq("note_id", noteId)
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();

  if (error) return fail(describeDatabaseError(error));

  // Nothing came back: either the policy refused, or they were already off the
  // list. Look before blaming the caller.
  if (!data) {
    const { data: still } = await supabase
      .from("personal_note_shares")
      .select("user_id")
      .eq("note_id", noteId)
      .eq("user_id", userId)
      .maybeSingle();

    if (still) return fail("Only the owner of a list can remove someone else.");
  }

  revalidatePath("/my-list");
  return ok(undefined);
}
