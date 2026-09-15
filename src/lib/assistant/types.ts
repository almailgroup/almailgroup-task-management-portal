/**
 * The AI assistant — shared types.
 *
 * Deliberately free of React and of Supabase: the same shapes travel from the
 * chat panel, through the Server Action, to the Cloudflare Worker that will
 * front Gemini. Keeping them in one plain module is what lets the Worker be
 * dropped in without touching the UI.
 */

import type {
  TaskPriority,
  TaskStatus,
} from "@/lib/supabase/database.types";

export type AssistantRole = "user" | "assistant";

export type AssistantMessage = {
  id: string;
  role: AssistantRole;
  text: string;
  /** ISO instant. Rendered in the viewer's timezone after hydration. */
  at: string;
};

/** A task flattened to what the assistant needs to talk about it. */
export type AssistantTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  project: string | null;
  dueAt: string | null;
  followUpAt: string | null;
  assignees: string[];
  createdAt: string;
};

/**
 * Everything the assistant knows when it answers, gathered under the caller's own
 * permissions. A member's snapshot holds only the tasks assigned to them,
 * because row-level security already scopes the query that builds it — the
 * assistant inherits the permission model rather than re-implementing it.
 */
export type AssistantSnapshot = {
  /** Who is asking, so the answer can say "you" and mean it. */
  viewer: { name: string; role: string };
  /**
   * The language to answer in. The panel is read in Arabic as often as in
   * English, and a model left to infer it from the question will answer an
   * English word typed into an Arabic interface in English.
   */
  locale: string;
  /**
   * The reader's IANA zone. Without it "what is due today" is unanswerable
   * from a list of instants — the same task is today in Dubai and tomorrow
   * in London.
   */
  timeZone: string;
  /** ISO instant the snapshot was taken, for relative phrasing. */
  takenAt: string;
  tasks: AssistantTask[];
  counts: {
    total: number;
    todo: number;
    inProgress: number;
    inReview: number;
    done: number;
    overdue: number;
    dueToday: number;
    unassigned: number;
    noDueDate: number;
  };
};

/** What the chat panel sends. */
export type AssistantRequest = {
  /** Full turn history, oldest first, including the question just asked. */
  messages: AssistantMessage[];
};

/** What comes back. `source` says which brain answered. */
export type AssistantAnswer = {
  text: string;
  source: "gemini" | "local";
};
