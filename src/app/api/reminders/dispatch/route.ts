import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { deliver } from "@/lib/reminders/providers";
import type { QueuedReminder } from "@/lib/reminders/types";

/**
 * Drains the reminder queue.
 *
 * Called on a schedule (Vercel Cron, or Supabase pg_cron) and authenticated by
 * a shared secret, because it runs with the service-role key and must not be
 * reachable by anyone else. Vercel Cron sends the secret as a Bearer token;
 * anything else can pass the same value as x-cron-secret.
 */

/** How many to attempt per run, so one invocation cannot run past its timeout. */
const BATCH_SIZE = 40;

/** After this many failed attempts a reminder is given up on. */
const MAX_ATTEMPTS = 4;

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;

  return request.headers.get("x-cron-secret") === secret;
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}

async function run(request: NextRequest) {
  if (!authorised(request)) {
    // Deliberately terse: this endpoint should look like nothing to a stranger.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // A missing service-role key is the commonest first-deploy mistake, so say
  // so plainly instead of returning an opaque 500.
  let supabase;
  try {
    supabase = createAdminClient();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Reminder delivery is not configured.",
        hint: "Set SUPABASE_SERVICE_ROLE_KEY in the server environment. It must NOT be prefixed NEXT_PUBLIC_.",
      },
      { status: 503 },
    );
  }

  // Refresh the queue from the current state of the tasks table first, so a
  // single scheduled run both finds new work and sends it.
  const { error: enqueueError } = await supabase.rpc("enqueue_task_reminders");

  const { data, error } = await supabase
    .from("reminder_queue")
    .select("id, user_id, task_id, channel, kind, recipient, subject, body, attempts")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json(
      { error: "Could not read the reminder queue." },
      { status: 500 },
    );
  }

  const queued = (data ?? []) as QueuedReminder[];
  let sent = 0;
  let failed = 0;
  let givenUp = 0;

  for (const reminder of queued) {
    const result = await deliver(reminder);
    const attempts = reminder.attempts + 1;

    if (result.ok) {
      sent += 1;
      await supabase
        .from("reminder_queue")
        .update({
          status: "sent",
          attempts,
          sent_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", reminder.id);
      continue;
    }

    // Stop retrying once it is clearly not going to work, or we have tried enough.
    const exhausted = !result.retryable || attempts >= MAX_ATTEMPTS;
    if (exhausted) givenUp += 1;
    else failed += 1;

    await supabase
      .from("reminder_queue")
      .update({
        status: exhausted ? "failed" : "pending",
        attempts,
        last_error: result.error,
        // Back off so a struggling provider is not hammered on every run.
        scheduled_for: exhausted
          ? undefined
          : new Date(Date.now() + attempts * 15 * 60_000).toISOString(),
      })
      .eq("id", reminder.id);
  }

  return NextResponse.json({
    considered: queued.length,
    sent,
    retrying: failed,
    givenUp,
    enqueueError: enqueueError ? enqueueError.message : null,
  });
}
