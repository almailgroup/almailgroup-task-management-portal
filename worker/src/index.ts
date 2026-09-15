/**
 * The assistant's language model, kept off the app server.
 *
 * The portal sends the question and a snapshot of the board the asker is
 * allowed to see; this forwards both to Gemini and returns the answer. It
 * exists for one reason: the Gemini key lives here, as a Cloudflare secret,
 * and never goes near Vercel — where anything is one `NEXT_PUBLIC_` typo away
 * from the browser.
 *
 * It is server-to-server only. There is deliberately no CORS header, so a page
 * cannot call it directly even if somebody learns the address.
 */

import type { MahamMessage, MahamSnapshot } from "../../src/lib/maham/types";

export interface Env {
  /** From Google AI Studio. `wrangler secret put GEMINI_API_KEY`. */
  GEMINI_API_KEY: string;
  /** Shared with the portal, so only it can spend the quota. */
  SHARED_SECRET?: string;
  /** Overridable without a code change, because model names come and go. */
  GEMINI_MODEL?: string;
}

type Body = { messages?: MahamMessage[]; snapshot?: MahamSnapshot };

const DEFAULT_MODEL = "gemini-2.5-flash";

/** Enough board to answer from, small enough to stay inside the free tier. */
const MAX_TASKS = 200;
/** Enough conversation to follow a thread, without resending an hour of it. */
const MAX_TURNS = 12;
/** Under the 20s the portal waits, so it falls back rather than hanging. */
const TIMEOUT_MS = 15_000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return json({ error: "Use POST." }, 405);
    }
    if (!authorised(request, env)) {
      return json({ error: "Not authorised." }, 401);
    }
    if (!env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not set on this Worker.");
      return json({ error: "Not configured." }, 500);
    }

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return json({ error: "Expected JSON." }, 400);
    }

    const { messages, snapshot } = body;
    if (!Array.isArray(messages) || messages.length === 0 || !snapshot?.counts) {
      return json({ error: "Expected { messages, snapshot }." }, 400);
    }

    try {
      const text = await ask(messages, snapshot, env);
      if (!text.trim()) throw new Error("Gemini returned no text");
      return json({ text });
    } catch (error) {
      // The portal answers from its own local brain on any non-2xx, so the
      // panel degrades to a worse answer rather than to an error. The reason
      // belongs in `wrangler tail`, not in front of whoever asked.
      console.error("Gemini call failed:", error);
      return json({ error: "Upstream failed." }, 502);
    }
  },
};

/**
 * The shared secret, compared in constant time.
 *
 * A plain `===` on a secret leaks its prefix through how long the comparison
 * takes. The cost of doing it properly is nothing, so there is no reason to
 * take the argument that this one is hard to exploit over the internet.
 */
function authorised(request: Request, env: Env): boolean {
  if (!env.SHARED_SECRET) return true; // Unset: open, and said so in the README.
  const offered = (request.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
  const a = new TextEncoder().encode(offered);
  const b = new TextEncoder().encode(env.SHARED_SECRET);
  if (a.byteLength !== b.byteLength) return false;
  if (crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(a, b);
  // Same idea by hand: every byte is compared, and the loop cannot finish
  // early on a mismatch the way `every` would.
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}

async function ask(
  messages: MahamMessage[],
  snapshot: MahamSnapshot,
  env: Env,
): Promise<string> {
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // In a header rather than the query string: URLs turn up in logs.
      "x-goog-api-key": env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: brief(snapshot) }] },
      contents: messages.slice(-MAX_TURNS).map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.text }],
      })),
      generationConfig: {
        // Low, not zero: this is a question about facts on a board, and the
        // answer should not drift between two identical asks.
        temperature: 0.2,
        maxOutputTokens: 900,
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Gemini replied ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    promptFeedback?: { blockReason?: string };
  };

  if (data.promptFeedback?.blockReason) {
    throw new Error(`Blocked: ${data.promptFeedback.blockReason}`);
  }

  return (data.candidates?.[0]?.content?.parts ?? [])
    // Newer models return their reasoning as parts too; those are not the answer.
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim();
}

/**
 * The board, written out for the model.
 *
 * Dates are resolved to the reader's own zone here rather than sent as
 * instants, because asking a language model to do timezone arithmetic is a
 * way of finding out that it cannot.
 */
function brief(snapshot: MahamSnapshot): string {
  const { viewer, counts, tasks, timeZone, locale, takenAt } = snapshot;
  const when = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone,
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(iso))
      : "no due date";

  const shown = tasks.slice(0, MAX_TASKS);
  const lines = shown.map((task) => {
    const bits = [
      task.title,
      task.status,
      `${task.priority} priority`,
      when(task.dueAt),
      task.project ?? "General",
      task.assignees.length ? task.assignees.join(", ") : "unassigned",
    ];
    if (task.followUpAt) bits.push(`follow up ${when(task.followUpAt)}`);
    return `- ${bits.join(" | ")}`;
  });

  return [
    "You are the assistant inside the Almailgroup task portal. You answer questions",
    "about where work stands, from the board below and from nothing else.",
    "",
    `Answer in this language: ${locale === "ar" ? "Arabic" : "English"}.`,
    `The reader is ${viewer.name} (${viewer.role}). It is now ${when(takenAt)} in ${timeZone};`,
    "that clock decides what counts as today, overdue and this week.",
    "",
    "Rules:",
    "- Answer only from the board below. If it is not there, say you cannot see it.",
    "- Never invent a task, a person, a date or a number.",
    "- Be brief. Lead with the answer, then the tasks that support it.",
    "- Plain text only. No markdown, no headings, no ** or ##.",
    "- For a list, put each item on its own line starting with the bullet '• '.",
    "- Refer to tasks by their title, as the reader sees them on the board.",
    "- You can read and count. You cannot create, edit, assign or delete anything;",
    "  if asked to, say so and describe where in the portal they can do it.",
    "",
    "Counts already worked out for you — use these rather than recounting:",
    `total ${counts.total}, to do ${counts.todo}, in progress ${counts.inProgress},`,
    `in review ${counts.inReview}, done ${counts.done}, overdue ${counts.overdue},`,
    `due today ${counts.dueToday}, unassigned ${counts.unassigned},`,
    `without a due date ${counts.noDueDate}.`,
    "",
    `The board (${shown.length} of ${tasks.length} tasks):`,
    "title | status | priority | due | project | assignees",
    ...lines,
    tasks.length > shown.length
      ? `…and ${tasks.length - shown.length} more not listed. Say so if it matters.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
