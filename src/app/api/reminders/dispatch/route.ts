import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendClaimed } from "@/lib/reminders/dispatch";
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
  // Housekeeping on the same daily run: tasks that have sat in the bin for
  // thirty days are gone for good. Failure here is logged, not fatal — the
  // reminders still go out.
  const { error: purgeError } = await supabase.rpc("purge_trashed_tasks");
  if (purgeError) console.error(`[reminders] purge_trashed_tasks: ${purgeError.message}`);

  const { error: enqueueError } = await supabase.rpc("enqueue_task_reminders");

  // Claim the batch before touching a provider. Reading pending rows and
  // marking them sent afterwards meant a run killed by the function timeout
  // left rows pending that had already gone out, and the next run sent them
  // a second time. claim_reminders moves them to 'sending' in one statement.
  const { data, error } = await supabase.rpc("claim_reminders", {
    batch_size: BATCH_SIZE,
  });

  if (error) {
    return NextResponse.json(
      { error: "Could not read the reminder queue." },
      { status: 500 },
    );
  }

  const queued = (data ?? []) as QueuedReminder[];

  // The sending is shared with the assignment path, which claims one task's
  // rows rather than a batch of everybody's. Only the claiming differs.
  const tally = await sendClaimed(supabase, queued);

  return NextResponse.json({
    ...tally,
    enqueueError: enqueueError ? enqueueError.message : null,
  });
}
