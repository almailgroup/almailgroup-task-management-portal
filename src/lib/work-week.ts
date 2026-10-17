/**
 * The company's working week, and the days off within it.
 *
 * Almailgroup works Sunday to Thursday, as Kuwait does; Friday and Saturday
 * are the weekend. Everything that reasons about "a working day" — the date
 * shortcuts, the calendar's shading, whether a reminder goes out — asks here,
 * so they cannot disagree about which days count.
 *
 * Dates here are floating local dates (midnight on a wall calendar, as in
 * lib/calendar), and holidays are matched on their ISO day, "2026-03-20".
 */

/** The day a week starts on, in `Date.getDay()` numbering: Sunday. */
export const FIRST_DAY_OF_WEEK = 0;

/** Friday and Saturday, in `Date.getDay()` numbering. */
export const WEEKEND_DAYS: readonly number[] = [5, 6];

/** Company holidays as ISO days, "2026-03-20". */
export type HolidaySet = ReadonlySet<string>;

const NO_HOLIDAYS: HolidaySet = new Set();

/** A local date as "2026-03-20" — the key holidays are stored and matched by. */
export function isoDay(date: Date): string {
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isWeekend(date: Date): boolean {
  return WEEKEND_DAYS.includes(date.getDay());
}

export function isHoliday(date: Date, holidays: HolidaySet = NO_HOLIDAYS): boolean {
  return holidays.has(isoDay(date));
}

export function isWorkingDay(date: Date, holidays: HolidaySet = NO_HOLIDAYS): boolean {
  return !isWeekend(date) && !isHoliday(date, holidays);
}

/** The same calendar date `days` later, keeping the time of day. */
function plusDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * The date itself if it is a working day, otherwise the next one that is.
 *
 * Bounded: a year of days off in a row is a data error, not a calendar, and
 * a loop that never ends would hang the page rather than say so.
 */
export function onOrAfterWorkingDay(date: Date, holidays: HolidaySet = NO_HOLIDAYS): Date {
  let day = new Date(date);
  for (let i = 0; i < 366 && !isWorkingDay(day, holidays); i++) day = plusDays(day, 1);
  return day;
}

/** The first working day strictly after `from`. */
export function nextWorkingDay(from: Date, holidays: HolidaySet = NO_HOLIDAYS): Date {
  return onOrAfterWorkingDay(plusDays(from, 1), holidays);
}

/** `count` working days after `from`, not counting `from` itself. */
export function addWorkingDays(
  from: Date,
  count: number,
  holidays: HolidaySet = NO_HOLIDAYS,
): Date {
  let day = new Date(from);
  for (let i = 0; i < count; i++) day = nextWorkingDay(day, holidays);
  return day;
}

/**
 * The first working day of next week: Sunday, unless Sunday is a holiday.
 * From a Friday or Saturday that is the day after the weekend — the week that
 * is about to start, not the one after it.
 */
export function startOfNextWeek(from: Date, holidays: HolidaySet = NO_HOLIDAYS): Date {
  const daysUntil = (FIRST_DAY_OF_WEEK - from.getDay() + 7) % 7 || 7;
  return onOrAfterWorkingDay(plusDays(from, daysUntil), holidays);
}
