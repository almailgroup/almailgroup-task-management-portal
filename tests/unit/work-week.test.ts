import { describe, expect, it } from "vitest";

import {
  addWorkingDays,
  isWeekend,
  isWorkingDay,
  isoDay,
  nextWorkingDay,
  onOrAfterWorkingDay,
  startOfNextWeek,
} from "@/lib/work-week";

/**
 * Kuwait's working week: Sunday to Thursday, Friday and Saturday off.
 * October 2026: Thu 15, Fri 16, Sat 17, Sun 18, Mon 19.
 */
const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 9, 30);
};
const key = (date: Date) => isoDay(date);

describe("the working week", () => {
  it("has Friday and Saturday as its weekend", () => {
    expect(isWeekend(day("2026-10-16"))).toBe(true); // Friday
    expect(isWeekend(day("2026-10-17"))).toBe(true); // Saturday
    expect(isWeekend(day("2026-10-18"))).toBe(false); // Sunday
    expect(isWeekend(day("2026-10-15"))).toBe(false); // Thursday
  });

  it("does not count a company holiday as a working day", () => {
    const eid = new Set(["2026-10-19"]);
    expect(isWorkingDay(day("2026-10-19"))).toBe(true);
    expect(isWorkingDay(day("2026-10-19"), eid)).toBe(false);
  });
});

describe("next working day", () => {
  it("from Thursday is Sunday, over the weekend", () => {
    expect(key(nextWorkingDay(day("2026-10-15")))).toBe("2026-10-18");
  });

  it("from Sunday is Monday", () => {
    expect(key(nextWorkingDay(day("2026-10-18")))).toBe("2026-10-19");
  });

  it("steps over a holiday too", () => {
    const holidays = new Set(["2026-10-18", "2026-10-19"]);
    expect(key(nextWorkingDay(day("2026-10-15"), holidays))).toBe("2026-10-20");
  });

  it("keeps the time of day", () => {
    const next = nextWorkingDay(day("2026-10-15"));
    expect([next.getHours(), next.getMinutes()]).toEqual([9, 30]);
  });
});

describe("working days ahead", () => {
  it("counts three working days from Wednesday as Sunday", () => {
    // Wed 14 → Thu 15, Sun 18, Mon 19
    expect(key(addWorkingDays(day("2026-10-14"), 3))).toBe("2026-10-19");
  });

  it("skips a holiday inside the span", () => {
    const holidays = new Set(["2026-10-18"]);
    // Wed 14 → Thu 15, Mon 19, Tue 20
    expect(key(addWorkingDays(day("2026-10-14"), 3, holidays))).toBe("2026-10-20");
  });
});

describe("start of next week", () => {
  it("is the coming Sunday from any weekday", () => {
    expect(key(startOfNextWeek(day("2026-10-15")))).toBe("2026-10-18"); // Thu
    expect(key(startOfNextWeek(day("2026-10-19")))).toBe("2026-10-25"); // Mon
  });

  it("from a weekend is the Sunday about to start, not the one after", () => {
    expect(key(startOfNextWeek(day("2026-10-16")))).toBe("2026-10-18"); // Fri
    expect(key(startOfNextWeek(day("2026-10-17")))).toBe("2026-10-18"); // Sat
  });

  it("from a Sunday is a week on", () => {
    expect(key(startOfNextWeek(day("2026-10-18")))).toBe("2026-10-25");
  });

  it("moves to Monday when that Sunday is a holiday", () => {
    expect(key(startOfNextWeek(day("2026-10-15"), new Set(["2026-10-18"])))).toBe("2026-10-19");
  });
});

describe("on or after a working day", () => {
  it("leaves a working day alone and moves a weekend day forward", () => {
    expect(key(onOrAfterWorkingDay(day("2026-10-15")))).toBe("2026-10-15");
    expect(key(onOrAfterWorkingDay(day("2026-10-16")))).toBe("2026-10-18");
  });

  it("gives up rather than loop forever on a year of days off", () => {
    const everyDay = new Set(
      Array.from({ length: 400 }, (_, i) => key(new Date(2026, 9, 15 + i))),
    );
    expect(() => onOrAfterWorkingDay(day("2026-10-15"), everyDay)).not.toThrow();
  });
});
