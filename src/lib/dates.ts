import { createTranslator, type Translator } from "@/lib/i18n";
import type { TaskStatus } from "@/lib/supabase/database.types";

/** Date helpers shared by the task views, the reschedule and follow-up controls. */

/**
 * Whoever renders one of these passes their translator; the pure callers —
 * tests, the CSV writer — get English by leaving it out.
 *
 * `tag` and `timeZone` come with it, so a date is written the same way on the
 * server as in the browser. Both sides read them from the same translator,
 * which is the whole point: asking each runtime for its own answer is what
 * made the two renders disagree.
 */
export type Speaker = Pick<Translator, "t" | "tn" | "tag" | "timeZone">;
const english: Speaker = createTranslator("en");

/**
 * The calendar day an instant falls on, in a given zone, as "2026-09-16".
 *
 * en-CA is the shortest way to ask Intl for ISO order, and the result compares
 * as a plain string. Every "is this today", "how many days away" and "do we
 * need to print the year" question goes through here, so they all answer in
 * the reader's own zone instead of the machine's.
 */
function dayIn(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** That same day as a count of days, so two of them can be subtracted. */
function dayNumber(date: Date, timeZone?: string): number {
  const [year, month, day] = dayIn(date, timeZone).split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

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

/**
 * True when the due instant falls on the viewer's calendar today.
 *
 * `timeZone` is the viewer's, from the translator. Left out it falls back to
 * the runtime's own zone, which is right for the server-side aggregates that
 * never reach a browser — but never for anything that is rendered twice.
 */
export function isDueToday(dueAt: string | null, timeZone?: string): boolean {
  if (!dueAt) return false;
  return dayIn(new Date(dueAt), timeZone) === dayIn(new Date(), timeZone);
}

/**
 * Date and time in the viewer's own timezone. The year is shown only when it
 * differs from the current one, to keep the board compact.
 *
 * `tag` and `timeZone` both come from the translator rather than from the
 * runtime. Ask the runtime and the server answers UTC in en-US while the
 * browser answers Dubai in en-GB, the two strings differ, and React throws
 * the server's markup away (hydration error #418).
 */
export function formatDateTime(
  value: string,
  tag?: string,
  timeZone?: string,
): string {
  const date = new Date(value);
  const sameYear =
    dayIn(date, timeZone).slice(0, 4) === dayIn(new Date(), timeZone).slice(0, 4);

  return date.toLocaleString(tag, {
    timeZone,
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
export function quickDateOptions({ t }: Speaker = english) {
  return [
    { key: "laterToday", label: t("quick.laterToday"), value: () => atHourToday(17) },
    { key: "tomorrow", label: t("quick.tomorrow"), value: () => atHourToday(17, 1) },
    { key: "in3Days", label: t("quick.in3Days"), value: () => atHourToday(17, 3) },
    { key: "nextMonday", label: t("quick.nextMonday"), value: () => nextMonday(9) },
    { key: "inAWeek", label: t("quick.inAWeek"), value: () => atHourToday(17, 7) },
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

/** Whole calendar days from an instant to now, in the viewer's zone. */
export function daysAgo(iso: string, timeZone?: string): number {
  return dayNumber(new Date(), timeZone) - dayNumber(new Date(iso), timeZone);
}

/** Short, human relative phrasing: "in 2 days", "3 days ago", "today". */
export function relativeDay(
  iso: string,
  { t, tn, timeZone }: Speaker = english,
): string {
  const days = dayNumber(new Date(iso), timeZone) - dayNumber(new Date(), timeZone);

  if (days === 0) return t("rel.today");
  if (days === 1) return t("rel.tomorrow");
  if (days === -1) return t("rel.yesterday");
  if (days > 0) return tn("rel.inDays", days);
  return tn("rel.daysAgo", Math.abs(days));
}

/**
 * How long ago, in one or two characters: "4m", "3h", "2d", "5w".
 *
 * The board shows this instead of a live hh:mm:ss counter. Twenty cards each
 * ticking a nine-character number every second was a lot of noise — and a
 * task open three days reading "72:07:04" is precise without being useful.
 * The exact figure is still a hover away.
 */
export function compactAge(
  fromIso: string,
  nowMs: number,
  { t }: Speaker = english,
): string {
  const seconds = Math.max(0, Math.floor((nowMs - new Date(fromIso).getTime()) / 1000));
  if (seconds < 60) return t("compact.seconds", { n: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("compact.minutes", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("compact.hours", { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("compact.days", { n: days });
  return t("compact.weeks", { n: Math.floor(days / 7) });
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
export function describeDayGap(days: number, { t, tn }: Speaker = english): string {
  if (days === 0) return t("gap.today");
  if (days === 1) return t("gap.tomorrow");
  if (days === -1) return t("gap.yesterday");
  return days > 0 ? tn("gap.inDays", days) : tn("gap.daysAgo", Math.abs(days));
}

/** "1 week, 5 days" — the same gap broken up, for anything over a fortnight. */
export function describeDayGapDetail(
  days: number,
  { t, tn }: Speaker = english,
): string | null {
  const total = Math.abs(days);
  if (total < 14) return null;

  const weeks = Math.floor(total / 7);
  const rest = total % 7;
  const weekPart = tn("gap.weeks", weeks);
  if (rest === 0) return weekPart;
  return `${weekPart}${t("gap.join")}${tn("gap.days", rest)}`;
}
