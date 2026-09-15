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
 *
 * Plain JavaScript, and nothing is imported, so this file is exactly what goes
 * into Cloudflare's browser editor — copy it whole. The types below are JSDoc,
 * which is a comment at runtime and still checked against the portal's own
 * definitions by `npm run typecheck`.
 *
 * @typedef {import("../../src/lib/maham/types").MahamMessage} MahamMessage
 * @typedef {import("../../src/lib/maham/types").MahamSnapshot} MahamSnapshot
 *
 * @typedef {object} Env
 * @property {string}  GEMINI_API_KEY  From Google AI Studio. A secret.
 * @property {string} [SHARED_SECRET]  Shared with the portal. A secret.
 * @property {string} [GEMINI_MODEL]   Plain text; model names come and go.
 */

/**
 * Overridden by the GEMINI_MODEL variable. A Flash model, because those are
 * the ones the free tier carries; `models?key=…` will list what a given key
 * can see, though seeing a model is not the same as it being free.
 */
const DEFAULT_MODEL = "gemini-3.8-flash";

/** Enough board to answer from, small enough to stay inside the free tier. */
const MAX_TASKS = 200;
/** Enough conversation to follow a thread, without resending an hour of it. */
const MAX_TURNS = 12;
/** Under the 20s the portal waits, so it falls back rather than hanging. */
const TIMEOUT_MS = 15_000;

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
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

    /** @type {{ messages?: MahamMessage[], snapshot?: MahamSnapshot }} */
    let body;
    try {
      body = await request.json();
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
 *
 * No secret means no service. It would be friendlier to run open until one is
 * set, and that is exactly the window — between `wrangler deploy` and
 * `wrangler secret put` — in which an address that spends somebody's Gemini
 * quota sits on the internet waiting to be found.
 *
 * @param {Request} request
 * @param {Env} env
 * @returns {boolean}
 */
function authorised(request, env) {
  if (!env.SHARED_SECRET) {
    console.error(
      "SHARED_SECRET is not set, so every request is refused. Set it with:\n" +
        "  npx wrangler secret put SHARED_SECRET",
    );
    return false;
  }
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

/**
 * @param {MahamMessage[]} messages
 * @param {MahamSnapshot} snapshot
 * @param {Env} env
 * @returns {Promise<string>}
 */
async function ask(messages, snapshot, env) {
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
        /**
         * Far more than an answer needs, because on these models the budget
         * covers the reasoning as well. At 900 a model can think its way
         * through the whole allowance and stop before writing a word, which
         * arrives here as a perfectly successful response with no text in it.
         * The answer itself stays short; the system prompt asks for that.
         */
        maxOutputTokens: 4096,
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Gemini replied ${response.status}: ${await response.text()}`);
  }

  /**
   * @type {{
   *   candidates?: {
   *     content?: { parts?: { text?: string, thought?: boolean }[] },
   *     finishReason?: string,
   *   }[],
   *   promptFeedback?: { blockReason?: string },
   * }}
   */
  const data = await response.json();

  if (data.promptFeedback?.blockReason) {
    throw new Error(`Blocked: ${data.promptFeedback.blockReason}`);
  }

  const answer = (data.candidates?.[0]?.content?.parts ?? [])
    // Newer models return their reasoning as parts too; those are not the answer.
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim();

  if (!answer) {
    // Worth naming: an empty answer and a failed call look identical from the
    // portal, and the commonest cause — the reasoning eating the whole token
    // budget — is fixed by a number in this file rather than by retrying.
    throw new Error(
      `Gemini returned no text (finishReason: ${data.candidates?.[0]?.finishReason ?? "none"})`,
    );
  }

  return answer;
}

/**
 * The board, written out for the model.
 *
 * Dates are resolved to the reader's own zone here rather than sent as
 * instants, because asking a language model to do timezone arithmetic is a
 * way of finding out that it cannot.
 *
 * @param {MahamSnapshot} snapshot
 * @returns {string}
 */
function brief(snapshot) {
  const { viewer, counts, tasks, timeZone, locale, takenAt } = snapshot;
  const when = (/** @type {string | null} */ iso) =>
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

/**
 * @param {unknown} body
 * @param {number} [status]
 * @returns {Response}
 */
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
