/** Date helpers shared by the reschedule and follow-up controls. */

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
