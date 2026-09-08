import { describe, expect, it } from "vitest";

import {
  addDaysToDateString,
  dateRangeInclusive,
  daysBetweenDateStrings,
  nowVnDateString,
  resolvePeriodParams,
  sampleDateForRun,
} from "./time";

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

describe("dateRangeInclusive", () => {
  it("lists every day from and to inclusive, ascending", () => {
    expect(dateRangeInclusive("2026-09-01", "2026-09-04")).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
  });

  it("returns a single day when from === to", () => {
    expect(dateRangeInclusive("2026-09-08", "2026-09-08")).toEqual(["2026-09-08"]);
  });

  it("returns [] when to is before from", () => {
    expect(dateRangeInclusive("2026-09-08", "2026-09-01")).toEqual([]);
  });

  it("crosses a month boundary", () => {
    expect(dateRangeInclusive("2026-08-30", "2026-09-02")).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
    ]);
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

describe("sampleDateForRun", () => {
  // All instants below expressed in UTC; VN wall-clock time (UTC+7) noted in each comment —
  // cross-checked against Intl output directly, not hand math (the +7h wrap across midnight is
  // exactly the kind of off-by-one this function exists to get right).
  it("is today VN for the normal 23:30 cron run", () => {
    expect(sampleDateForRun(new Date("2026-08-24T16:30:00Z"))).toBe("2026-08-24"); // 2026-08-24 23:30 VN
  });

  it("is still YESTERDAY when a delayed run slips just past midnight VN", () => {
    expect(sampleDateForRun(new Date("2026-08-23T17:15:00Z"))).toBe("2026-08-23"); // 2026-08-24 00:15 VN
  });

  it("rolls forward to today VN once the 02:00 grace window ends (boundary itself counts as today)", () => {
    expect(sampleDateForRun(new Date("2026-08-23T19:00:00Z"))).toBe("2026-08-24"); // 2026-08-24 02:00 VN
  });

  it("is today VN for an ordinary daytime manual sync", () => {
    expect(sampleDateForRun(new Date("2026-08-24T07:00:00Z"))).toBe("2026-08-24"); // 2026-08-24 14:00 VN
  });
});
