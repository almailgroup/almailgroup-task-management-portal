import { describe, expect, it } from "vitest";

import {
  addMonths,
  dayKey,
  monthGrid,
  monthParam,
  parseMonthParam,
  weekdayIndex,
} from "@/lib/calendar";

describe("monthGrid", () => {
  it("is always six full weeks, Monday first", () => {
    for (const month of [new Date(2026, 1, 1), new Date(2026, 8, 1), new Date(2024, 1, 1)]) {
      const grid = monthGrid(month);
      expect(grid).toHaveLength(42);
      expect(weekdayIndex(grid[0])).toBe(0);
      expect(weekdayIndex(grid[41])).toBe(6);
    }
  });

  it("contains every day of the month it is for", () => {
    const grid = monthGrid(new Date(2026, 8, 1)); // September 2026
    const inMonth = grid.filter((d) => d.getMonth() === 8).map((d) => d.getDate());
    expect(inMonth).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it("starts on the Monday on or before the first", () => {
    // 1 September 2026 is a Tuesday, so the grid opens on Monday 31 August.
    const [first] = monthGrid(new Date(2026, 8, 1));
    expect([first.getMonth(), first.getDate()]).toEqual([7, 31]);
  });
});

describe("dayKey", () => {
  it("is the same for any two instants on one local day", () => {
    expect(dayKey(new Date(2026, 8, 14, 0, 5))).toBe(dayKey(new Date(2026, 8, 14, 23, 55)));
    expect(dayKey(new Date(2026, 8, 14))).not.toBe(dayKey(new Date(2026, 8, 15)));
  });
});

describe("month parameter", () => {
  it("round-trips and rejects nonsense", () => {
    const april = new Date(2027, 3, 1);
    expect(monthParam(april)).toBe("2027-04");
    expect(parseMonthParam("2027-04")?.getTime()).toBe(april.getTime());
    expect(parseMonthParam("2027-13")).toBeNull();
    expect(parseMonthParam("april")).toBeNull();
    expect(parseMonthParam(null)).toBeNull();
  });

  it("steps across a year boundary", () => {
    expect(monthParam(addMonths(new Date(2026, 11, 1), 1))).toBe("2027-01");
    expect(monthParam(addMonths(new Date(2026, 0, 1), -1))).toBe("2025-12");
  });
});
