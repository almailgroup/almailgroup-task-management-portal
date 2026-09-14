/**
 * Calendar arithmetic, in the viewer's own timezone.
 *
 * Everything here works on local calendar days, not instants: a task due at
 * 01:00 on Tuesday belongs on Tuesday's square whatever the offset is, and
 * ISO strings would put it on Monday for anyone east of Greenwich.
 */

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** A stable per-day key: ISO would shift with the timezone at the boundary. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

/** Monday-first weekday index, 0–6. `getDay()` is Sunday-first. */
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/**
 * The six-week grid for a month, Monday-first, padded with the adjacent
 * months' days so every row is full and the grid never changes height.
 */
export function monthGrid(month: Date): Date[] {
  const first = startOfMonth(month);
  const start = new Date(first);
  start.setDate(first.getDate() - weekdayIndex(first));

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

/** `2026-09` → the first of that month; anything else → null. */
export function parseMonthParam(value: string | null): Date | null {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (month < 0 || month > 11) return null;
  return new Date(year, month, 1);
}

export function monthParam(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
