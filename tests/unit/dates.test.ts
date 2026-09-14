import { describe, expect, it } from "vitest";

import {
  compactAge,
  formatElapsed,
  isoFromLocalInput,
  relativeDay,
  toLocalInput,
} from "@/lib/dates";

describe("isoFromLocalInput", () => {
  /**
   * The bug this exists to prevent: the value from <input type="datetime-local">
   * carries no offset, so parsing it anywhere but the viewer's machine reads it
   * in the wrong zone. It was being parsed server-side, where local is UTC, and
   * every due date entered in Dubai came back four hours late.
   *
   * The suite runs in UTC, so this asserts the conversion is anchored to the
   * running process's zone rather than assuming one.
   */
  it("resolves wall-clock input against the local zone", () => {
    expect(isoFromLocalInput("2026-09-15T17:30")).toBe("2026-09-15T17:30:00.000Z");
  });

  it("round-trips through toLocalInput without drift", () => {
    const typed = "2026-09-15T17:30";
    const iso = isoFromLocalInput(typed);
    expect(iso).not.toBeNull();
    expect(toLocalInput(iso)).toBe(typed);
  });

  it("returns null for empty and unparseable values", () => {
    expect(isoFromLocalInput("")).toBeNull();
    expect(isoFromLocalInput("   ")).toBeNull();
    expect(isoFromLocalInput("not a date")).toBeNull();
  });
});

describe("compactAge", () => {
  const base = Date.parse("2026-09-15T12:00:00.000Z");
  const ago = (ms: number) => new Date(base - ms).toISOString();

  it("steps through seconds, minutes, hours, days and weeks", () => {
    expect(compactAge(ago(5_000), base)).toBe("5s");
    expect(compactAge(ago(90_000), base)).toBe("1m");
    expect(compactAge(ago(3 * 3600_000), base)).toBe("3h");
    expect(compactAge(ago(3 * 86400_000), base)).toBe("3d");
    expect(compactAge(ago(14 * 86400_000), base)).toBe("2w");
  });

  it("never goes negative for a clock that is behind", () => {
    expect(compactAge(new Date(base + 60_000).toISOString(), base)).toBe("0s");
  });
});

describe("formatElapsed", () => {
  it("does not wrap hours into days", () => {
    const base = Date.parse("2026-09-15T12:00:00.000Z");
    const from = new Date(base - (72 * 3600_000 + 7 * 60_000 + 4_000)).toISOString();
    expect(formatElapsed(from, base)).toBe("72:07:04");
  });
});

describe("relativeDay", () => {
  it("names today, tomorrow and yesterday", () => {
    const now = new Date();
    const day = (offset: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() + offset);
      return d.toISOString();
    };
    expect(relativeDay(day(0))).toBe("today");
    expect(relativeDay(day(1))).toBe("tomorrow");
    expect(relativeDay(day(-1))).toBe("yesterday");
  });
});
