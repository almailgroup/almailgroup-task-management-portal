"use server";

import { buildSnapshot } from "@/lib/assistant/snapshot";
import { answerLocally } from "@/lib/assistant/local-brain";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getI18n } from "@/lib/i18n/server";
import type { AssistantAnswer, AssistantMessage } from "@/lib/assistant/types";

/**
 * Ask the assistant a question.
 *
 * The snapshot is built server-side, per request, under the caller's own
 * permissions — the browser never holds the task data the assistant reasons
 * over, and never learns the Worker's address or its key.
 *
 * When ALMAIL_AI_WORKER_URL is set this forwards the turn history and the
 * snapshot to the Cloudflare Worker that fronts Gemini. Until then it answers
 * from the local brain, which is also the fallback if that call fails: a
 * network hiccup should degrade the answer, not break the panel.
 */
export async function askAssistant(
  messages: AssistantMessage[],
): Promise<ActionResult<AssistantAnswer>> {
  const question = [...messages].reverse().find((m) => m.role === "user")?.text;
  if (!question?.trim()) return fail("action.askSomething");
  if (question.length > 2000) return fail("action.questionTooLong");

  const [snapshot, i18n] = await Promise.all([buildSnapshot(), getI18n()]);
  const endpoint = process.env.ALMAIL_AI_WORKER_URL;

  if (!endpoint) {
    // Whoever is asking cannot act on this; whoever runs the workspace can,
    // and until now had nothing to act on. Both ways of ending up with a
    // local answer looked identical from every side, which is a poor way to
    // spend an evening wondering why Gemini is not answering.
    console.warn(
      "[assistant] ALMAIL_AI_WORKER_URL is not set on this deployment, " +
        "so the answer came from the local brain. Environment variables are " +
        "fixed when a deployment is built: adding one means redeploying.",
    );
    return ok(answerLocally(question, snapshot, i18n));
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Shared secret, so only this app can spend the Gemini quota.
        ...(process.env.ALMAIL_AI_WORKER_SECRET
          ? { authorization: `Bearer ${process.env.ALMAIL_AI_WORKER_SECRET}` }
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
  } catch (error) {
    // Silent in front of the person asking, who cannot act on it and is
    // better served by a worse answer than by an error. Not silent in the
    // server log, which is where somebody can.
    console.error("[assistant] the Worker call failed, answering locally:", error);
    // `true`: a model is configured, it just did not answer. Saying otherwise
    // would send whoever asked to re-check settings that are fine.
    return ok(answerLocally(question, snapshot, i18n, true));
  }
}
