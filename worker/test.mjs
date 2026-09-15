/**
 * The Worker, exercised against a stubbed Gemini.
 *
 *   npm test
 *
 * No framework and no dependencies: Node's own test runner, and the module
 * under test is the same file that goes into Cloudflare's editor.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import worker from "./src/index.js";

const snapshot = {
  viewer: { name: "Admin", role: "admin" },
  locale: "en",
  timeZone: "Asia/Dubai",
  takenAt: "2026-09-15T10:00:00.000Z",
  tasks: [
    {
      id: "t1",
      title: "Chase customs",
      status: "todo",
      priority: "high",
      project: "Freight",
      // 13:00 UTC, which is 17:00 where the reader is.
      dueAt: "2026-09-14T13:00:00.000Z",
      followUpAt: null,
      assignees: ["Sara"],
      createdAt: "2026-09-01T06:00:00.000Z",
    },
  ],
  counts: {
    total: 1, todo: 1, inProgress: 0, inReview: 0, done: 0,
    overdue: 1, dueToday: 0, unassigned: 0, noDueDate: 0,
  },
};

const env = { GEMINI_API_KEY: "test-key", SHARED_SECRET: "test-secret" };

/** What the Worker sent upstream on the last call. */
let sent;

/** Answer the next Gemini call with this body. */
function gemini(body, status = 200) {
  globalThis.fetch = async (url, init) => {
    sent = {
      url: String(url),
      key: init.headers["x-goog-api-key"],
      body: JSON.parse(init.body),
    };
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
}

/** Whatever the Worker logged, so a failure can be checked for its reason. */
let logged = [];
console.error = (...parts) => logged.push(parts.join(" "));

function ask(overrides = {}) {
  logged = [];
  return worker.fetch(
    new Request("https://worker.example/", {
      method: "POST",
      headers: {
        authorization: "Bearer test-secret",
        "content-type": "application/json",
        ...overrides.headers,
      },
      body: JSON.stringify({
        messages: [{ id: "1", role: "user", text: "What is overdue?", at: snapshot.takenAt }],
        snapshot,
      }),
    }),
    { ...env, ...overrides.env },
  );
}

test("answers with the model's text", async () => {
  gemini({ candidates: [{ content: { parts: [{ text: "Nothing is overdue." }] }, finishReason: "STOP" }] });
  const response = await ask();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).text, "Nothing is overdue.");
});

test("the model's reasoning is not the answer", async () => {
  gemini({
    candidates: [
      { content: { parts: [{ text: "let me count", thought: true }, { text: "One is overdue." }] } },
    ],
  });
  assert.equal((await (await ask()).json()).text, "One is overdue.");
});

/**
 * Every current Gemini model thinks before it answers, and spends the output
 * budget doing it. Think past the budget and the call *succeeds* with nothing
 * in it — which must not reach the panel as an empty bubble.
 */
test("a reply that is all reasoning and no answer fails loudly", async () => {
  gemini({
    candidates: [{ content: { parts: [{ text: "thinking…", thought: true }] }, finishReason: "MAX_TOKENS" }],
  });
  const response = await ask();
  assert.equal(response.status, 502);
  assert.ok(logged.some((line) => line.includes("MAX_TOKENS")), logged.join("\n"));
});

test("a blocked prompt fails rather than returning nothing", async () => {
  gemini({ promptFeedback: { blockReason: "SAFETY" } });
  assert.equal((await ask()).status, 502);
  assert.ok(logged.some((line) => line.includes("SAFETY")));
});

test("an upstream error is a 502, so the portal falls back", async () => {
  gemini({ error: { message: "API key not valid" } }, 400);
  const response = await ask();
  assert.equal(response.status, 502);
  // The reason travels: the portal logs it, which is the only place anybody
  // is going to read it.
  assert.match((await response.json()).reason, /API key not valid/);
});

test("a key is never repeated back in the reason", async () => {
  gemini({ error: { message: "key AIzaSyEXAMPLE0123456789abcdef is invalid" } }, 400);
  const { reason } = await (await ask()).json();
  assert.match(reason, /\[key\]/);
  assert.doesNotMatch(reason, /AIzaSy/);
});

test("the key travels in a header, never in the URL", async () => {
  gemini({ candidates: [{ content: { parts: [{ text: "ok" }] } }] });
  await ask();
  assert.equal(sent.key, "test-key");
  assert.ok(!sent.url.includes("test-key"), sent.url);
});

test("dates reach the model in the reader's zone, already resolved", async () => {
  gemini({ candidates: [{ content: { parts: [{ text: "ok" }] } }] });
  await ask();
  const prompt = sent.body.systemInstruction.parts[0].text;
  // 13:00 UTC is 17:00 in Dubai. Sent as an instant, the model would have to
  // do that arithmetic itself, which is a way of finding out that it cannot.
  assert.match(prompt, /Chase customs \| todo \| high priority \| Sep 14, 2026, 5:00/);
  assert.match(prompt, /It is now Sep 15, 2026, 2:00 p\.m\. in Asia\/Dubai/);
});

test("the answer's language is stated rather than guessed", async () => {
  gemini({ candidates: [{ content: { parts: [{ text: "ok" }] } }] });
  await ask();
  assert.match(sent.body.systemInstruction.parts[0].text, /Answer in this language: English/);

  snapshot.locale = "ar";
  await ask();
  assert.match(sent.body.systemInstruction.parts[0].text, /Answer in this language: Arabic/);
  snapshot.locale = "en";
});

test("the budget leaves room to think and still answer", async () => {
  gemini({ candidates: [{ content: { parts: [{ text: "ok" }] } }] });
  await ask();
  assert.equal(sent.body.generationConfig.maxOutputTokens, 4096);
});

test("refuses anything that is not an authorised POST", async () => {
  gemini({ candidates: [{ content: { parts: [{ text: "ok" }] } }] });

  const get = await worker.fetch(new Request("https://worker.example/"), env);
  assert.equal(get.status, 405);

  const anonymous = await ask({ headers: { authorization: "" } });
  assert.equal(anonymous.status, 401);

  const wrong = await ask({ headers: { authorization: "Bearer not-it" } });
  assert.equal(wrong.status, 401);
});

/**
 * The gap between deploying and setting the secret is a window in which an
 * address that spends someone's Gemini quota would otherwise sit open.
 */
test("without a secret of its own it serves nobody", async () => {
  gemini({ candidates: [{ content: { parts: [{ text: "ok" }] } }] });
  const response = await ask({ env: { SHARED_SECRET: undefined } });
  assert.equal(response.status, 401);
  assert.ok(logged.some((line) => line.includes("SHARED_SECRET is not set")));
});

// ---- proposals ------------------------------------------------------------

/**
 * A snapshot from somebody who may change things. The plain `snapshot` above
 * deliberately has no `canManage`, so the tests that use it also cover a
 * viewer who has not been granted one.
 */
const manager = {
  ...snapshot,
  viewer: { name: "Admin", role: "admin", canManage: true },
  projects: [{ id: "p1", name: "Freight" }],
  team: [{ id: "u1", name: "Sara" }],
};

function askAs(view, question = "Create a task to file the manifest") {
  logged = [];
  return worker.fetch(
    new Request("https://worker.example/", {
      method: "POST",
      headers: {
        authorization: "Bearer test-secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ id: "1", role: "user", text: question, at: view.takenAt }],
        snapshot: view,
      }),
    }),
    env,
  );
}

test("a viewer who may not change things is not offered the tools", async () => {
  gemini({ candidates: [{ content: { parts: [{ text: "ok" }] } }] });
  await askAs({ ...snapshot, projects: [], team: [] });
  assert.equal(sent.body.tools, undefined);
});

test("a manager is offered exactly the three tools", async () => {
  gemini({ candidates: [{ content: { parts: [{ text: "ok" }] } }] });
  await askAs(manager);
  const names = sent.body.tools[0].functionDeclarations.map((tool) => tool.name);
  assert.deepEqual(names, ["create_task", "set_task_status", "reschedule_task"]);
});

/**
 * The model deals in ids, so it has to be given them. A name it cannot map to
 * an id is a proposal the portal will reject, which reads to the person as the
 * assistant simply not working.
 */
test("the ids a proposal needs are in the prompt", async () => {
  gemini({ candidates: [{ content: { parts: [{ text: "ok" }] } }] });
  await askAs(manager);
  const prompt = sent.body.systemInstruction.parts[0].text;
  assert.match(prompt, /p1 \| Freight/);
  assert.match(prompt, /u1 \| Sara/);
  // And the task ids, for the two tools that move an existing one.
  assert.match(prompt, /^- t1 \| Chase customs/m);
});

test("a function call comes back as a proposal", async () => {
  gemini({
    candidates: [
      {
        content: {
          parts: [
            { text: "Here is what I would create." },
            {
              functionCall: {
                name: "create_task",
                args: { title: "File the manifest", projectId: "p1" },
              },
            },
          ],
        },
      },
    ],
  });
  const body = await (await askAs(manager)).json();
  assert.equal(body.text, "Here is what I would create.");
  assert.deepEqual(body.action, {
    name: "create_task",
    arguments: { title: "File the manifest", projectId: "p1" },
  });
});

/**
 * Models routinely call a tool and say nothing at all. The portal has a card
 * to show for it, so that is an answer — not the empty reply that must fail.
 */
test("a proposal with no words is still an answer", async () => {
  gemini({
    candidates: [
      {
        content: { parts: [{ functionCall: { name: "set_task_status", args: { taskId: "t1", status: "done" } } }] },
        finishReason: "STOP",
      },
    ],
  });
  const response = await askAs(manager);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.text, "");
  assert.equal(body.action.name, "set_task_status");
});

test("an ordinary answer carries no proposal", async () => {
  gemini({ candidates: [{ content: { parts: [{ text: "Two are overdue." }] } }] });
  const body = await (await askAs(manager, "What is overdue?")).json();
  assert.equal(body.action, null);
});

// ---- a busy model ---------------------------------------------------------

/**
 * Queue a reply per attempt, so a test can say "fail, then succeed".
 * Returns how many times the Worker actually called upstream.
 */
function geminiSequence(replies) {
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    const reply = replies[Math.min(calls, replies.length - 1)];
    calls += 1;
    sent = { url: String(url), key: init.headers["x-goog-api-key"], body: JSON.parse(init.body) };
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return () => calls;
}

const answered = { body: { candidates: [{ content: { parts: [{ text: "One is overdue." }] } }] } };
const overloaded = { status: 503, body: { error: { code: 503, message: "The model is overloaded." } } };

/**
 * A free-tier Flash model returns 503 often enough that one question
 * succeeding and the next failing twenty seconds later is its ordinary
 * behaviour. Falling back to the local brain on the first 503 makes the
 * assistant look broken when it is merely busy.
 */
test("a busy model is asked again rather than given up on", async () => {
  const calls = geminiSequence([overloaded, answered]);
  const response = await ask();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).text, "One is overdue.");
  assert.equal(calls(), 2);
});

test("busy twice is a failure, and says so", async () => {
  const calls = geminiSequence([overloaded, overloaded]);
  const response = await ask();
  assert.equal(response.status, 502);
  assert.equal(calls(), 2);
  assert.match((await response.json()).reason, /503 twice/);
});

test("a wrong key is not worth asking twice", async () => {
  const calls = geminiSequence([
    { status: 400, body: { error: { message: "API key not valid" } } },
  ]);
  assert.equal((await ask()).status, 502);
  assert.equal(calls(), 1);
});

/**
 * A minute's rate limit clears on its own; a day's does not. Both arrive as
 * 429, and only the body says which — so the body is what decides.
 */
test("a per-minute 429 is retried; a per-day one is not", async () => {
  const perMinute = {
    status: 429,
    body: { error: { message: "Quota exceeded", details: [{ violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }] }] } },
  };
  const perDay = {
    status: 429,
    body: { error: { message: "Quota exceeded", details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }] } },
  };

  let calls = geminiSequence([perMinute, answered]);
  assert.equal((await ask()).status, 200);
  assert.equal(calls(), 2);

  calls = geminiSequence([perDay, answered]);
  assert.equal((await ask()).status, 502);
  assert.equal(calls(), 1, "a day's quota will say the same thing again");
});

/**
 * A turn that only proposed something carries no prose. Sending that back as
 * an empty part is at best pointless.
 */
test("an empty turn is not sent back as history", async () => {
  gemini(answered.body);
  await worker.fetch(
    new Request("https://worker.example/", {
      method: "POST",
      headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
      body: JSON.stringify({
        snapshot,
        messages: [
          { id: "1", role: "user", text: "Create a task", at: snapshot.takenAt },
          { id: "2", role: "assistant", text: "", at: snapshot.takenAt },
          { id: "3", role: "user", text: "What is overdue?", at: snapshot.takenAt },
        ],
      }),
    }),
    env,
  );
  assert.deepEqual(
    sent.body.contents.map((turn) => turn.parts[0].text),
    ["Create a task", "What is overdue?"],
  );
});
