import type { TaskStatus } from "@/lib/supabase/database.types";

/** Date helpers shared by the task views, the reschedule and follow-up controls. */

/**
 * A task is overdue once its due instant has passed and the work is not done.
 *
 * Now that due dates carry a time of day this is a plain instant comparison,
 * which is both simpler and more accurate than the calendar-date check it
 * replaces.
 */
export function isOverdue(dueAt: string | null, status: TaskStatus): boolean {
  if (!dueAt || status === "done") return false;
  return new Date(dueAt).getTime() < Date.now();
}

/** True when the due instant falls on the viewer's local calendar today. */
export function isDueToday(dueAt: string | null): boolean {
  if (!dueAt) return false;
  const due = new Date(dueAt);
  const now = new Date();
  return (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  );
}

/**
 * Date and time in the viewer's own timezone. The year is shown only when it
 * differs from the current one, to keep the board compact.
 *
 * `tag` is the reader's language, from the translator; left out, the browser
 * formats in its own default.
 */
export function formatDateTime(value: string, tag?: string): string {
  const date = new Date(value);
  const sameYear = date.getFullYear() === new Date().getFullYear();

  return date.toLocaleString(tag, {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Today at a given hour, in the viewer's timezone, as an ISO instant. */
export function atHourToday(hour: number, daysAhead = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

/** Start of the coming Monday at the given hour. */
export function nextMonday(hour = 9): string {
  const date = new Date();
  const daysUntilMonday = (8 - date.getDay()) % 7 || 7;
  date.setDate(date.getDate() + daysUntilMonday);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

/**
 * Quick reschedule choices, in the order people reach for them.
 * 17:00 is the default hour — end of the working day, not midnight, so
 * "tomorrow" means tomorrow evening rather than the instant it begins.
 */
export function quickDateOptions() {
  return [
    { label: "Later today", value: () => atHourToday(17) },
    { label: "Tomorrow", value: () => atHourToday(17, 1) },
    { label: "In 3 days", value: () => atHourToday(17, 3) },
    { label: "Next Monday", value: () => nextMonday(9) },
    { label: "In a week", value: () => atHourToday(17, 7) },
  ];
}

/**
 * An <input type="datetime-local"> value turned into an absolute instant.
 *
 * This has to run in the browser. The input carries wall-clock time with no
 * offset — "2026-09-15T17:30" — so only the viewer's machine knows which
 * instant that is. Parsing it on the server reads it in the *server's*
 * timezone, which on Vercel is UTC, and silently shifted every due date by the
 * viewer's offset: 17:30 entered in Dubai came back as 21:30.
 *
 * Returns null for an empty or unparseable value.
 */
export function isoFromLocalInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Value for an <input type="datetime-local">, in local time. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Short, human relative phrasing: "in 2 days", "3 days ago", "today". */
export function relativeDay(iso: string): string {
  const then = new Date(iso);
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round(
    (startOfDay(then) - startOfDay(new Date())) / 86_400_000,
  );

  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
}

/**
 * How long ago, in one or two characters: "4m", "3h", "2d", "5w".
 *
 * The board shows this instead of a live hh:mm:ss counter. Twenty cards each
 * ticking a nine-character number every second was a lot of noise — and a
 * task open three days reading "72:07:04" is precise without being useful.
 * The exact figure is still a hover away.
 */
export function compactAge(fromIso: string, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - new Date(fromIso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

/**
 * Elapsed time as hours:minutes:seconds, counting from an instant to now.
 *
 * Hours are not wrapped into days on purpose — a task open for three days
 * reads as "73:04:11", which is what was asked for and keeps the field a
 * single, comparable number.
 */
export function formatElapsed(fromIso: string, nowMs: number): string {
  const seconds = Math.max(
    0,
    Math.floor((nowMs - new Date(fromIso).getTime()) / 1000),
  );
  const pad = (n: number) => `${n}`.padStart(2, "0");
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}:${pad(minutes)}:${pad(seconds % 60)}`;
}

/**
 * Whole calendar days from one date to another. Negative for the past.
 *
 * Counted from the local calendar date, not from elapsed milliseconds: two
 * dates 23 hours apart can still be "tomorrow", and a clock that goes back an
 * hour must not turn a 7-day gap into 6.99 and round it down. Projecting the
 * local Y/M/D onto UTC removes the offset from the arithmetic entirely, so
 * this is exact across every daylight-saving boundary.
 */
export function daysBetween(from: Date, to: Date): number {
  const asUtcDay = (d: Date) =>
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((asUtcDay(to) - asUtcDay(from)) / 86_400_000);
}

/**
 * A day gap in words: "Today", "In 12 days", "9 days ago".
 *
 * Singular and plural are both spelled out rather than assembled, because
 * "1 days ago" is the kind of thing nobody notices until a customer does.
 */
export function describeDayGap(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return days > 0 ? `In ${days} days` : `${Math.abs(days)} days ago`;
}

/** "1 week, 5 days" — the same gap broken up, for anything over a fortnight. */
export function describeDayGapDetail(days: number): string | null {
  const total = Math.abs(days);
  if (total < 14) return null;

  const weeks = Math.floor(total / 7);
  const rest = total % 7;
  const weekPart = `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  if (rest === 0) return weekPart;
  return `${weekPart}, ${rest} ${rest === 1 ? "day" : "days"}`;
}
