import { describe, expect, it } from "vitest";

import { addDaysToDateString, daysBetweenDateStrings, nowVnDateString, resolvePeriodParams } from "./time";

describe("addDaysToDateString", () => {
  it("shifts forward and backward across a month boundary", () => {
    expect(addDaysToDateString("2026-08-30", 3)).toBe("2026-09-02");
    expect(addDaysToDateString("2026-08-02", -5)).toBe("2026-07-28");
  });
});

describe("daysBetweenDateStrings", () => {
  it("counts whole days, positive when b is later", () => {
    expect(daysBetweenDateStrings("2026-08-15", "2026-08-21")).toBe(6);
    expect(daysBetweenDateStrings("2026-08-21", "2026-08-15")).toBe(-6);
    expect(daysBetweenDateStrings("2026-08-15", "2026-08-15")).toBe(0);
  });
});

describe("resolvePeriodParams", () => {
  const now = new Date("2026-08-21T10:00:00+07:00");

  it("defaults to a defaultDays-long window ending today when nothing is given", () => {
    expect(resolvePeriodParams({}, 7, now)).toEqual({ from: "2026-08-15", to: "2026-08-21" });
  });

  it("accepts a valid explicit range", () => {
    expect(resolvePeriodParams({ from: "2026-08-01", to: "2026-08-10" }, 7, now)).toEqual({
      from: "2026-08-01",
      to: "2026-08-10",
    });
  });

  it("falls back to default on malformed input instead of throwing", () => {
    expect(resolvePeriodParams({ from: "not-a-date", to: "2026-08-21" }, 7, now)).toEqual({
      from: "2026-08-15",
      to: "2026-08-21",
    });
  });

  it("falls back when from is after to", () => {
    expect(resolvePeriodParams({ from: "2026-08-20", to: "2026-08-10" }, 7, now)).toEqual({
      from: "2026-08-04",
      to: "2026-08-10",
    });
  });

  it("clamps a to in the future back to today", () => {
    expect(resolvePeriodParams({ to: "2099-01-01" }, 7, now)).toEqual({ from: "2026-08-15", to: "2026-08-21" });
  });
});

describe("nowVnDateString", () => {
  it("formats a given Date as YYYY-MM-DD in Asia/Ho_Chi_Minh", () => {
    // 2026-08-21T18:30:00Z is 2026-08-22 01:30 in UTC+7 — crosses midnight, a real regression risk.
    expect(nowVnDateString(new Date("2026-08-21T18:30:00Z"))).toBe("2026-08-22");
  });
});
