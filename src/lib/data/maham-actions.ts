"use server";

import { buildSnapshot } from "@/lib/maham/snapshot";
import { answerLocally } from "@/lib/maham/local-brain";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import type { MahamAnswer, MahamMessage } from "@/lib/maham/types";

/**
 * Ask MAHAM a question.
 *
 * The snapshot is built server-side, per request, under the caller's own
 * permissions — the browser never holds the task data the assistant reasons
 * over, and never learns the Worker's address or its key.
 *
 * When MAHAM_WORKER_URL is set this forwards the turn history and the
 * snapshot to the Cloudflare Worker that fronts Gemini. Until then it answers
 * from the local brain, which is also the fallback if that call fails: a
 * network hiccup should degrade the answer, not break the panel.
 */
export async function askMaham(
  messages: MahamMessage[],
): Promise<ActionResult<MahamAnswer>> {
  const question = [...messages].reverse().find((m) => m.role === "user")?.text;
  if (!question?.trim()) return fail("Ask me something about your tasks.");
  if (question.length > 2000) return fail("That question is too long.");

  const snapshot = await buildSnapshot();
  const endpoint = process.env.MAHAM_WORKER_URL;

  if (!endpoint) {
    return ok(answerLocally(question, snapshot));
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Shared secret, so only this app can spend the Gemini quota.
        ...(process.env.MAHAM_WORKER_SECRET
          ? { authorization: `Bearer ${process.env.MAHAM_WORKER_SECRET}` }
          : {}),
      },
      body: JSON.stringify({ messages, snapshot }),
      // A chat turn that has not answered in 20s is not going to.
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) throw new Error(`Worker replied ${response.status}`);

    const body = (await response.json()) as { text?: string };
    if (!body.text?.trim()) throw new Error("Worker replied with no text");

    return ok({ text: body.text, source: "gemini" });
  } catch {
    // Deliberately silent about the cause: the person asking cannot act on a
    // Worker error, and the local answer is usually still useful.
    return ok(answerLocally(question, snapshot));
  }
}
