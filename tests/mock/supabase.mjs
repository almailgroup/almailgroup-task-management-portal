/**
 * Enough Supabase to run the app without one.
 *
 * The end-to-end specs need a backend that answers like PostgREST and GoTrue
 * and keeps what it is told, so a spec can create a task and then find it on
 * the board. A real Supabase cannot do that job: it is shared, it is slow to
 * reset between specs, and pointing tests at the production project is the
 * one thing this repository must never do.
 *
 * What it is NOT: an authority. Row-level security lives in the migrations
 * and is verified against a real Postgres, never here — this server answers
 * every request as the signed-in user and enforces nothing. A spec that
 * passes here proves the interface works, not that the rules hold.
 *
 *   node tests/mock/supabase.mjs        # :54999, 5ms per call
 *   PORT=1234 LATENCY_MS=120 node …     # somewhere else, production-ish
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

import { IDS, NOW, seed } from "./seed.mjs";

const PORT = Number(process.env.PORT ?? 54999);
const LATENCY = Number(process.env.LATENCY_MS ?? 5);

/**
 * Who a request is from.
 *
 * Sign-in hands back a token carrying the id of whoever's address was typed,
 * and every later request carries that token, so a spec signs in as a member
 * and is one — which is what makes a role-shaped check possible at all.
 */
const DEFAULT_USER = process.env.MOCK_USER_ID ?? IDS.admin;

function actor(request) {
  const header = request.headers.authorization ?? "";
  const token = header.replace(/^Bearer /i, "");
  const payload = token.split(".")[1];
  if (!payload) return DEFAULT_USER;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof claims.sub === "string" ? claims.sub : DEFAULT_USER;
  } catch {
    return DEFAULT_USER;
  }
}

let db = seed();

/**
 * How rows reach each other, as PostgREST would know it from foreign keys:
 * table -> column -> the table it points at.
 */
const FK = {
  tasks: { project_id: "projects", created_by: "profiles" },
  task_assignments: { task_id: "tasks", user_id: "profiles" },
  comments: { task_id: "tasks", author_id: "profiles" },
  task_activity: { task_id: "tasks", actor_id: "profiles" },
  task_attachments: { task_id: "tasks", created_by: "profiles" },
  notifications: { user_id: "profiles", actor_id: "profiles", task_id: "tasks", conversation_id: "conversations" },
  project_members: { project_id: "projects", user_id: "profiles" },
  personal_notes: { user_id: "profiles" },
  personal_note_items: { note_id: "personal_notes" },
  personal_note_shares: { note_id: "personal_notes", user_id: "profiles" },
  team_messages: { author_id: "profiles" },
  direct_messages: { conversation_id: "conversations", author_id: "profiles" },
  conversation_participants: { conversation_id: "conversations", user_id: "profiles" },
  reminder_queue: { task_id: "tasks", user_id: "profiles" },
};

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Split on commas that are not inside parentheses. */
function topLevelSplit(text) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of text) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** `alias:table!hint(inner)` — everything but the table name is optional. */
function parseSelect(select) {
  const columns = [];
  const embeds = [];
  for (const part of topLevelSplit(select || "*")) {
    const open = part.indexOf("(");
    if (open === -1) {
      columns.push(part.trim());
      continue;
    }
    const head = part.slice(0, open);
    const inner = part.slice(open + 1, part.lastIndexOf(")"));
    const [aliasOrTable, rest] = head.includes(":")
      ? [head.slice(0, head.indexOf(":")), head.slice(head.indexOf(":") + 1)]
      : [null, head];
    const [table, ...hints] = rest.split("!");
    embeds.push({
      alias: (aliasOrTable ?? table).trim(),
      table: table.trim(),
      inner: hints.includes("inner"),
      fk: hints.find((hint) => hint !== "inner") ?? null,
      select: inner,
    });
  }
  return { columns, embeds };
}

/**
 * One embed, resolved.
 *
 * A parent that holds the key gets an object; a child that holds it gets an
 * array. `notifications` points at `profiles` twice, so an ambiguous pair is
 * decided by the `!constraint_name` hint the app already passes.
 */
function embed(parentTable, row, spec) {
  const target = spec.table;
  const outward = FK[parentTable] ?? {};

  const columnFor = (hint, map, table) => {
    const candidates = Object.entries(map).filter(([, points]) => points === table);
    if (candidates.length === 0) return null;
    if (hint) {
      const named = candidates.find(([column]) => hint.includes(column));
      if (named) return named[0];
    }
    return candidates[0][0];
  };

  const outwardColumn = columnFor(spec.fk, outward, target);
  if (outwardColumn) {
    const found = (db[target] ?? []).find((other) => other.id === row[outwardColumn]);
    return found ? shape(target, found, spec.select) : null;
  }

  const inward = FK[target] ?? {};
  const inwardColumn = columnFor(spec.fk, inward, parentTable);
  if (!inwardColumn) return null;
  return (db[target] ?? [])
    .filter((other) => other[inwardColumn] === row.id)
    .map((other) => shape(target, other, spec.select));
}

/** A row as the select asked for it, embeds and all. */
function shape(table, row, select) {
  const { columns, embeds } = parseSelect(select);
  const out = columns.includes("*") || columns.length === 0 ? { ...row } : {};
  for (const column of columns) {
    if (column !== "*") out[column] = row[column];
  }
  for (const spec of embeds) out[spec.alias] = embed(table, row, spec);
  return out;
}

const VALUE = (raw) => {
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  const unquoted = raw.replace(/^"|"$/g, "");
  return unquoted;
};

/** One `column=op.value` pair from the query string. */
function matches(row, column, expression) {
  const dot = expression.indexOf(".");
  const op = expression.slice(0, dot);
  const raw = expression.slice(dot + 1);
  const value = VALUE(raw);
  const actual = row[column];

  switch (op) {
    case "eq": return String(actual) === String(value);
    case "neq": return String(actual) !== String(value);
    case "gt": return actual > value;
    case "gte": return actual >= value;
    case "lt": return actual < value;
    case "lte": return actual <= value;
    case "is": return value === null ? actual === null || actual === undefined : actual === value;
    case "in": {
      const list = raw.replace(/^\(|\)$/g, "").split(",").map((item) => VALUE(item.trim()));
      return list.some((item) => String(item) === String(actual));
    }
    case "like":
    case "ilike": {
      const pattern = String(value).replace(/%/g, ".*");
      return new RegExp(`^${pattern}$`, op === "ilike" ? "i" : "").test(String(actual ?? ""));
    }
    case "not": return !matches(row, column, raw);
    default: return true;
  }
}

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function filtered(table, params) {
  let rows = [...(db[table] ?? [])];

  for (const [column, expression] of params) {
    if (RESERVED.has(column)) continue;
    rows = rows.filter((row) => matches(row, column, expression));
  }

  const order = params.get("order");
  if (order) {
    for (const clause of order.split(",").reverse()) {
      const [column, ...rest] = clause.split(".");
      const descending = rest.includes("desc");
      rows.sort((a, b) => {
        const left = a[column];
        const right = b[column];
        if (left === right) return 0;
        if (left === null || left === undefined) return 1;
        if (right === null || right === undefined) return -1;
        return (left > right ? 1 : -1) * (descending ? -1 : 1);
      });
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Functions the app calls by name
// ---------------------------------------------------------------------------

const isOverdue = (task) =>
  task.due_at !== null && task.status !== "done" && new Date(task.due_at) < new Date(NOW);

const sameDay = (iso) =>
  iso !== null && iso.slice(0, 10) === NOW.slice(0, 10);

const RPC = {
  task_counts() {
    const live = db.tasks.filter((task) => !task.deleted_at);
    const count = (predicate) => live.filter(predicate).length;
    return [{
      total: live.length,
      done: count((t) => t.status === "done"),
      todo: count((t) => t.status === "todo"),
      in_progress: count((t) => t.status === "in_progress"),
      in_review: count((t) => t.status === "in_review"),
      overdue: count(isOverdue),
      due_today: count((t) => sameDay(t.due_at) && t.status !== "done"),
    }];
  },

  workload_counts() {
    const byUser = new Map();
    for (const assignment of db.task_assignments) {
      const task = db.tasks.find((row) => row.id === assignment.task_id && !row.deleted_at);
      if (!task) continue;
      const entry = byUser.get(assignment.user_id) ?? { user_id: assignment.user_id, open: 0, done: 0, overdue: 0 };
      if (task.status === "done") entry.done += 1;
      else entry.open += 1;
      if (isOverdue(task)) entry.overdue += 1;
      byUser.set(assignment.user_id, entry);
    }
    return [...byUser.values()];
  },

  my_conversations(_args, ME) {
    const mine = db.conversation_participants.filter((row) => row.user_id === ME);
    return mine.map((membership) => {
      const conversation = db.conversations.find((row) => row.id === membership.conversation_id);
      const others = db.conversation_participants.filter(
        (row) => row.conversation_id === membership.conversation_id && row.user_id !== ME,
      );
      const other = db.profiles.find((row) => row.id === others[0]?.user_id);
      const messages = db.direct_messages
        .filter((row) => row.conversation_id === membership.conversation_id)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return {
        id: membership.conversation_id,
        last_message_at: conversation?.last_message_at ?? null,
        other_id: other?.id ?? null,
        other_name: other?.full_name ?? null,
        other_email: other?.email ?? null,
        other_avatar: other?.avatar_url ?? null,
        other_title: other?.job_title ?? null,
        last_message: messages[0]?.body ?? null,
        last_author_id: messages[0]?.author_id ?? null,
        unread: messages.filter(
          (row) => row.author_id !== ME && row.created_at > (membership.last_read_at ?? ""),
        ).length,
      };
    }).sort((a, b) => (a.last_message_at < b.last_message_at ? 1 : -1));
  },

  unread_direct_count(_args, ME) {
    return RPC.my_conversations(null, ME).reduce((sum, row) => sum + row.unread, 0);
  },

  start_direct_conversation({ other }, ME) {
    const [low, high] = [ME, other].sort();
    const existing = db.conversations.find(
      (row) => row.member_low === low && row.member_high === high,
    );
    if (existing) return existing.id;

    const id = randomUUID();
    db.conversations.push({ id, member_low: low, member_high: high, created_at: new Date().toISOString(), last_message_at: new Date().toISOString() });
    db.conversation_participants.push(
      { conversation_id: id, user_id: ME, last_read_at: new Date().toISOString() },
      { conversation_id: id, user_id: other, last_read_at: null },
    );
    return id;
  },

  trash_task({ task }) {
    const row = db.tasks.find((candidate) => candidate.id === task);
    if (row) row.deleted_at = new Date().toISOString();
    return row ? 1 : 0;
  },

  restore_task({ task }) {
    const row = db.tasks.find((candidate) => candidate.id === task);
    if (row) row.deleted_at = null;
    return row ? 1 : 0;
  },

  purge_trashed_tasks: () => 0,
  enqueue_task_reminders: () => 0,
  claim_reminders: () => [],
  claim_task_reminders: () => [],
};

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

/** Every request, so a spec can count round trips. */
export const log = [];

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (who) =>
  `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
    sub: who,
    aud: "authenticated",
    role: "authenticated",
    email: db.profiles.find((row) => row.id === who)?.email,
    session_id: randomUUID(),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    user_metadata: {},
    app_metadata: {},
  })}.unsigned`;

const readBody = (request) =>
  new Promise((resolve) => {
    let text = "";
    request.on("data", (chunk) => (text += chunk));
    request.on("end", () => {
      try {
        resolve(text ? JSON.parse(text) : null);
      } catch {
        resolve(null);
      }
    });
  });

const defaults = (table, row) => ({
  id: randomUUID(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...(table === "tasks" ? { status: "todo", priority: "medium", deleted_at: null, position: 0, due_at: null, follow_up_at: null, description: null } : {}),
  ...row,
});

const server = createServer(async (request, response) => {
  const at = performance.now();
  log.push({ at, method: request.method, url: request.url });
  if (process.env.MOCK_QUIET !== "1") {
    process.stdout.write(`${at.toFixed(0)}\t${request.method} ${request.url}\n`);
  }

  await new Promise((resume) => setTimeout(resume, LATENCY));

  const url = new URL(request.url, `http://localhost:${PORT}`);
  const prefer = request.headers.prefer ?? "";

  const send = (payload, status = 200, headers = {}) => {
    response.writeHead(status, { "content-type": "application/json", ...headers });
    response.end(request.method === "HEAD" ? undefined : JSON.stringify(payload));
  };

  // --- the harness's own door -------------------------------------------
  if (url.pathname === "/__reset") {
    db = seed();
    log.length = 0;
    return send({ ok: true });
  }
  if (url.pathname === "/__db") {
    return send(db);
  }

  // --- GoTrue ------------------------------------------------------------
  if (url.pathname.startsWith("/auth/v1/user")) {
    const id = actor(request);
    const me = db.profiles.find((row) => row.id === id);
    return send({
      id, aud: "authenticated", role: "authenticated", email: me?.email,
      user_metadata: {}, app_metadata: {}, created_at: "2026-01-01T00:00:00Z",
    });
  }
  if (url.pathname.startsWith("/auth/v1/token")) {
    const credentials = (await readBody(request)) ?? {};
    const me =
      db.profiles.find((row) => row.email === credentials.email) ??
      db.profiles.find((row) => row.id === DEFAULT_USER);
    return send({
      access_token: jwt(me.id), token_type: "bearer", expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: randomUUID(),
      user: { id: me.id, email: me.email, user_metadata: {}, app_metadata: {} },
    });
  }
  if (url.pathname.startsWith("/auth/v1/")) return send({});

  // --- PostgREST ---------------------------------------------------------
  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    const name = url.pathname.replace("/rest/v1/rpc/", "");
    const handler = RPC[name];
    if (!handler) return send({ message: `no mock for rpc ${name}` }, 404);
    const args = (await readBody(request)) ?? {};
    return send(handler(args, actor(request)));
  }

  if (url.pathname.startsWith("/rest/v1/")) {
    const table = url.pathname.replace("/rest/v1/", "");
    if (!(table in db)) return send({ message: `no table ${table}` }, 404);

    const params = url.searchParams;
    const select = params.get("select") ?? "*";
    const wantsOne = (request.headers.accept ?? "").includes("vnd.pgrst.object");
    const wantsRows = prefer.includes("return=representation");
    const exactCount = prefer.includes("count=exact");

    if (request.method === "POST") {
      const payload = await readBody(request);
      const incoming = (Array.isArray(payload) ? payload : [payload]).map((row) => defaults(table, row));
      db[table].push(...incoming);
      const shaped = incoming.map((row) => shape(table, row, select));
      return send(wantsOne ? shaped[0] : shaped, 201);
    }

    if (request.method === "PATCH") {
      const payload = (await readBody(request)) ?? {};
      const hits = filtered(table, params);
      for (const row of hits) Object.assign(row, payload, { updated_at: new Date().toISOString() });
      const shaped = hits.map((row) => shape(table, row, select));
      return send(wantsRows ? (wantsOne ? shaped[0] ?? null : shaped) : null, 200);
    }

    if (request.method === "DELETE") {
      const hits = filtered(table, params);
      db[table] = db[table].filter((row) => !hits.includes(row));
      const shaped = hits.map((row) => shape(table, row, select));
      return send(
        wantsRows ? (wantsOne ? shaped[0] ?? null : shaped) : null,
        200,
        exactCount ? { "content-range": `*/${hits.length}` } : {},
      );
    }

    // GET / HEAD
    let rows = filtered(table, params);
    const total = rows.length;
    const offset = Number(params.get("offset") ?? 0);
    const limit = params.get("limit");
    rows = rows.slice(offset, limit ? offset + Number(limit) : undefined);

    const shaped = rows
      .map((row) => shape(table, row, select))
      // `!inner` on an embed drops parents with nothing on the other side.
      .filter((row) =>
        parseSelect(select).embeds.every(
          (spec) => !spec.inner || (Array.isArray(row[spec.alias]) ? row[spec.alias].length > 0 : row[spec.alias] !== null),
        ),
      );

    return send(
      wantsOne ? shaped[0] ?? null : shaped,
      200,
      { "content-range": `${offset}-${Math.max(offset, offset + shaped.length - 1)}/${exactCount ? total : "*"}` },
    );
  }

  // Realtime is not mocked: the app retries a failed socket and carries on
  // with what the server rendered, which is what a spec should assert on.
  send({}, 404);
});

server.listen(PORT, () => {
  process.stderr.write(`mock supabase on :${PORT} — ${LATENCY}ms per call\n`);
});
