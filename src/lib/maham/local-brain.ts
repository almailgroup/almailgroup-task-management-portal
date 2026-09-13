import { isDueToday, isOverdue } from "@/components/tasks/task-meta";
import { statusMeta } from "@/lib/constants";
import type { MahamAnswer, MahamSnapshot, MahamTask } from "@/lib/maham/types";

/**
 * MAHAM's placeholder brain.
 *
 * It answers the handful of tracking questions that can be resolved by
 * counting rows, and says plainly when a question needs the language model.
 * This is not a stand-in for Gemini — it is the floor: once the Cloudflare
 * Worker is wired up, everything here stays as the offline fallback for when
 * that call fails, so the panel is never simply dead.
 *
 * Pure, and free of server imports, so it runs in the action, in a test, or
 * inside the Worker itself.
 */

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

function dueLabel(task: MahamTask): string {
  if (!task.dueAt) return "no due date";
  const due = new Date(task.dueAt);
  return `due ${due.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

/** "Ship the catalogue — In Progress, due 14 Sep (Gemellry)" */
function describe(task: MahamTask): string {
  const bits = [statusMeta(task.status).label, dueLabel(task)];
  if (task.project) bits.push(task.project);
  return `${task.title} — ${bits.join(", ")}`;
}

function list(tasks: MahamTask[], limit = 8): string {
  const shown = tasks.slice(0, limit).map((task) => `• ${describe(task)}`);
  if (tasks.length > limit) {
    shown.push(`…and ${tasks.length - limit} more.`);
  }
  return shown.join("\n");
}

const answer = (text: string): MahamAnswer => ({ text, source: "local" });

/** Every word in one of these groups has to appear for the intent to match. */
const matches = (question: string, ...groups: string[][]) =>
  groups.some((group) => group.every((word) => question.includes(word)));

export function answerLocally(
  question: string,
  snapshot: MahamSnapshot,
): MahamAnswer {
  const q = question.toLowerCase().trim();
  const { counts, tasks } = snapshot;
  const open = tasks.filter((task) => task.status !== "done");

  if (tasks.length === 0) {
    return answer(
      "There are no tasks I can see yet. Once work is assigned to you it will show up here and I can track it.",
    );
  }

  // Overdue ------------------------------------------------------------
  if (matches(q, ["overdue"], ["late"], ["past", "due"], ["behind"])) {
    const overdue = tasks.filter((task) => isOverdue(task.dueAt, task.status));
    if (overdue.length === 0) {
      return answer("Nothing is overdue. Every task with a due date is still inside it.");
    }
    return answer(
      `${plural(overdue.length, "task is", "tasks are")} overdue:\n\n${list(overdue)}`,
    );
  }

  // Due today ----------------------------------------------------------
  if (matches(q, ["due", "today"], ["today"], ["due", "now"])) {
    const today = open.filter((task) => isDueToday(task.dueAt));
    // A task due at 09:00 this morning is both due today and overdue. It
    // belongs under today's heading, once — so the overdue section below
    // covers only the days already behind us.
    const todayIds = new Set(today.map((task) => task.id));
    const earlier = tasks.filter(
      (task) => isOverdue(task.dueAt, task.status) && !todayIds.has(task.id),
    );

    if (today.length === 0 && earlier.length === 0) {
      return answer("Nothing is due today, and nothing is overdue.");
    }

    const parts: string[] = [
      today.length > 0
        ? `Due today — ${plural(today.length, "task")}:\n\n${list(today)}`
        : "Nothing is due today.",
    ];
    if (earlier.length > 0) {
      parts.push(
        `\nOverdue from before today — ${plural(earlier.length, "task")}:\n\n${list(earlier)}`,
      );
    }
    return answer(parts.join("\n"));
  }

  // Review queue -------------------------------------------------------
  if (matches(q, ["review"], ["waiting"], ["approve"], ["approval"])) {
    const inReview = tasks.filter((task) => task.status === "in_review");
    if (inReview.length === 0) {
      return answer("Nothing is waiting in review right now.");
    }
    return answer(
      `${plural(inReview.length, "task is", "tasks are")} in review:\n\n${list(inReview)}`,
    );
  }

  // Unassigned ---------------------------------------------------------
  if (matches(q, ["unassigned"], ["nobody"], ["no", "one"], ["not", "assigned"])) {
    const unassigned = open.filter((task) => task.assignees.length === 0);
    if (unassigned.length === 0) {
      return answer("Every open task has someone on it.");
    }
    return answer(
      `${plural(unassigned.length, "open task has", "open tasks have")} nobody assigned:\n\n${list(unassigned)}`,
    );
  }

  // Follow-ups ---------------------------------------------------------
  if (matches(q, ["follow"], ["chase"], ["remind"])) {
    const followUps = open
      .filter((task) => task.followUpAt !== null)
      .sort((a, b) => (a.followUpAt ?? "").localeCompare(b.followUpAt ?? ""));
    if (followUps.length === 0) {
      return answer("No follow-ups are set. You can add one from any task.");
    }
    return answer(
      `${plural(followUps.length, "task has", "tasks have")} a follow-up set:\n\n${list(followUps)}`,
    );
  }

  // What should I work on ----------------------------------------------
  if (
    matches(
      q,
      ["what", "next"],
      ["work", "on"],
      ["priorit"],
      ["my", "task"],
      ["assigned", "me"],
      ["start"],
    )
  ) {
    const weight = (task: MahamTask) => {
      if (isOverdue(task.dueAt, task.status)) return 0;
      if (isDueToday(task.dueAt)) return 1;
      if (task.priority === "urgent") return 2;
      if (task.priority === "high") return 3;
      return task.dueAt ? 4 : 5;
    };
    const ordered = [...open].sort(
      (a, b) =>
        weight(a) - weight(b) || (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"),
    );
    if (ordered.length === 0) {
      return answer("Nothing open — everything visible to you is done.");
    }
    return answer(
      `Here is what I would take first, overdue and due-today work ahead of the rest:\n\n${list(ordered, 6)}`,
    );
  }

  // Summary / counts ---------------------------------------------------
  if (
    matches(
      q,
      ["how", "many"],
      ["summary"],
      ["status"],
      ["overview"],
      ["progress"],
      ["count"],
      ["where", "we"],
      ["stand"],
    )
  ) {
    const lines = [
      `${plural(counts.total, "task")} in view, ${counts.done} done.`,
      `To Do ${counts.todo} · In Progress ${counts.inProgress} · In Review ${counts.inReview} · Done ${counts.done}`,
    ];
    if (counts.overdue > 0) lines.push(`${plural(counts.overdue, "task is", "tasks are")} overdue.`);
    if (counts.dueToday > 0) lines.push(`${plural(counts.dueToday, "task is", "tasks are")} due today.`);
    if (counts.unassigned > 0) lines.push(`${plural(counts.unassigned, "open task has", "open tasks have")} no assignee.`);
    if (counts.noDueDate > 0) lines.push(`${plural(counts.noDueDate, "open task has", "open tasks have")} no due date.`);
    return answer(lines.join("\n"));
  }

  // Capabilities -------------------------------------------------------
  if (matches(q, ["help"], ["what", "can", "you"], ["who", "are", "you"])) {
    return answer(
      [
        "I am MAHAM, the assistant for this portal. I can see exactly the tasks you can see — no more.",
        "",
        "Ask me things like:",
        "• What is overdue?",
        "• What is due today?",
        "• What should I work on next?",
        "• What is waiting in review?",
        "• Give me a status summary",
        "",
        "Anything more open-ended needs my language model, which is not connected yet.",
      ].join("\n"),
    );
  }

  // Fallback -----------------------------------------------------------
  return answer(
    [
      "I cannot answer that one yet — my language model is not connected, so for now I only handle the tracking questions I can count from the board.",
      "",
      "Try: what is overdue, what is due today, what should I work on next, what is in review, or a status summary.",
    ].join("\n"),
  );
}
