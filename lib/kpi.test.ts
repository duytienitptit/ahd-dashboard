import { describe, expect, it } from "vitest";

import {
  assertEditable,
  computeDataGaps,
  computeProgress,
  elapsedPct,
  forecastOverallPct,
  remainingPerDay,
  resolveStatus,
  type KpiActuals,
  type KpiTargets,
} from "./kpi";

const NO_TARGETS: KpiTargets = { views: null, videos: null, followers: null };
const NO_ACTUALS: KpiActuals = { views: null, videos: 0, followersNow: null };

describe("computeProgress", () => {
  it("computes all 3 pct when all 3 targets are set", () => {
    const progress = computeProgress(
      { views: 500000, videos: 20, followers: 9000 },
      { views: 226000, videos: 12, followersNow: 8200 },
      7800,
    );
    // views: 226000/500000*100 = 45.2, videos: 12/20*100 = 60, followers: (8200-7800)/(9000-7800)*100 = 33.33...
    expect(progress.viewsPct).toBe(45.2);
    expect(progress.videosPct).toBe(60);
    expect(progress.followersPct).toBe(33.3);
    expect(progress.targetCount).toBe(3);
    expect(progress.overallPct).toBe(round1((45.2 + 60 + 33.3) / 3));
  });

  it("averages over only the targets actually set — 1 of 3 (25/08/2026, theo yêu cầu)", () => {
    const progress = computeProgress({ ...NO_TARGETS, views: 100000 }, { ...NO_ACTUALS, views: 50000 }, 1000);
    expect(progress.targetCount).toBe(1);
    expect(progress.viewsPct).toBe(50);
    expect(progress.videosPct).toBeNull();
    expect(progress.followersPct).toBeNull();
    expect(progress.overallPct).toBe(50);
  });

  it("averages over 2 of 3 when 2 targets are set", () => {
    const progress = computeProgress(
      { views: 100000, videos: 10, followers: null },
      { views: 50000, videos: 5, followersNow: null },
      1000,
    );
    expect(progress.targetCount).toBe(2);
    expect(progress.overallPct).toBe(50); // both at exactly 50%
  });

  it("no targets set at all → overallPct null, targetCount 0", () => {
    const progress = computeProgress(NO_TARGETS, NO_ACTUALS, 1000);
    expect(progress.targetCount).toBe(0);
    expect(progress.overallPct).toBeNull();
  });

  it("views target set but no measured day yet → viewsPct null, not 0 (chưa có số đo, không phải 0%)", () => {
    const progress = computeProgress({ ...NO_TARGETS, views: 100000 }, NO_ACTUALS, 1000);
    expect(progress.viewsPct).toBeNull();
    expect(progress.overallPct).toBeNull();
  });

  it("followers: absolute milestone, not a gain — (now - atStart) / (target - atStart)", () => {
    const progress = computeProgress(
      { ...NO_TARGETS, followers: 9000 },
      { ...NO_ACTUALS, followersNow: 8200 },
      7800,
    );
    expect(progress.followersPct).toBe(round1(((8200 - 7800) / (9000 - 7800)) * 100));
  });

  it("followers target === followersAtStart → divide by zero guarded to null, not Infinity/NaN", () => {
    const progress = computeProgress({ ...NO_TARGETS, followers: 5000 }, { ...NO_ACTUALS, followersNow: 5200 }, 5000);
    expect(progress.followersPct).toBeNull();
    expect(Number.isFinite(progress.followersPct as unknown as number)).toBe(false); // stays null, never leaks NaN/Infinity into JSON as a number
  });

  it("followers dropped below start (now < atStart) → genuine negative pct, not clamped", () => {
    const progress = computeProgress({ ...NO_TARGETS, followers: 9000 }, { ...NO_ACTUALS, followersNow: 7000 }, 7800);
    expect(progress.followersPct).toBeLessThan(0);
    expect(progress.overallPct).toBeLessThan(0);
  });

  it("videos target === 0 → guarded to null (can't divide), not Infinity", () => {
    const progress = computeProgress({ ...NO_TARGETS, videos: 0 }, { ...NO_ACTUALS, videos: 3 }, 1000);
    expect(progress.videosPct).toBeNull();
    // targetCount still counts it — a target WAS set, just a degenerate one
    expect(progress.targetCount).toBe(1);
  });
});

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

describe("elapsedPct", () => {
  it("day 4 of a 7-day cycle ≈ 57% (docs/API_SPEC.md's worked example: elapsedPct 57, overallPct 52)", () => {
    expect(elapsedPct("2026-08-17", "2026-08-23", "2026-08-20")).toBe(57);
  });

  it("first day of the cycle is > 0%, not 0", () => {
    expect(elapsedPct("2026-08-17", "2026-08-23", "2026-08-17")).toBe(14);
  });

  it("last day of the cycle is 100%", () => {
    expect(elapsedPct("2026-08-17", "2026-08-23", "2026-08-23")).toBe(100);
  });

  it("clamps to 100 once the cycle has ended", () => {
    expect(elapsedPct("2026-08-17", "2026-08-23", "2026-09-01")).toBe(100);
  });

  it("clamps to 0 before the cycle starts", () => {
    expect(elapsedPct("2026-08-17", "2026-08-23", "2026-08-10")).toBe(0);
  });

  it("a 1-day cycle (periodStart === periodEnd) doesn't divide by zero", () => {
    expect(elapsedPct("2026-08-20", "2026-08-20", "2026-08-20")).toBe(100);
    expect(elapsedPct("2026-08-20", "2026-08-20", "2026-08-19")).toBe(0);
  });
});

describe("resolveStatus", () => {
  it("green when overallPct is at least elapsedPct + 10 (boundary inclusive)", () => {
    expect(resolveStatus(67, 57).value).toBe("green");
  });

  it("red when overallPct is at most elapsedPct - 10 (boundary inclusive)", () => {
    expect(resolveStatus(47, 57).value).toBe("red");
  });

  it("yellow strictly inside the ±10 band", () => {
    expect(resolveStatus(52, 57).value).toBe("yellow");
  });

  it("just inside the green boundary (elapsedPct + 9.9) is still yellow", () => {
    expect(resolveStatus(66.9, 57).value).toBe("yellow");
  });

  it("overallPct null (no data yet) reads yellow with its own explanation, never green/red", () => {
    const status = resolveStatus(null, 20);
    expect(status.value).toBe("yellow");
    expect(status.overallPct).toBeNull();
    expect(status.explanation).toContain("chưa có đủ dữ liệu");
  });

  it("explanation matches docs/API_SPEC.md's worked example text shape", () => {
    const status = resolveStatus(52, 57);
    expect(status.explanation).toBe("Đã qua 57% chu kỳ, hoàn thành 52% chỉ tiêu.");
  });
});

describe("remainingPerDay", () => {
  it("matches docs/API_SPEC.md's worked example: 90000 remaining / 2 days = 45000/ngày", () => {
    const remaining = remainingPerDay(
      { ...NO_TARGETS, views: 500000 },
      { ...NO_ACTUALS, views: 410000 },
      "2026-08-23",
      "2026-08-22", // 2 days left: 22nd (today) + 23rd
    );
    expect(remaining.daysLeft).toBe(2);
    expect(remaining.views).toEqual({ remaining: 90000, perDay: 45000 });
    expect(remaining.text).toContain("2 ngày còn lại");
  });

  it("daysLeft === 0 on the last day still counts today (inclusive)", () => {
    const remaining = remainingPerDay({ ...NO_TARGETS, views: 1000 }, { ...NO_ACTUALS, views: 0 }, "2026-08-23", "2026-08-23");
    expect(remaining.daysLeft).toBe(1);
  });

  it("after the cycle has ended, daysLeft is 0 — no division by zero, distinct text", () => {
    const remaining = remainingPerDay({ ...NO_TARGETS, views: 1000 }, { ...NO_ACTUALS, views: 400 }, "2026-08-23", "2026-08-25");
    expect(remaining.daysLeft).toBe(0);
    expect(remaining.views?.perDay).toBeNull();
    expect(remaining.views?.remaining).toBe(600);
    expect(remaining.text).toContain("Đã hết chu kỳ");
  });

  it("already met or exceeded the target → remaining clamped to 0, not negative", () => {
    const remaining = remainingPerDay({ ...NO_TARGETS, views: 1000 }, { ...NO_ACTUALS, views: 5000 }, "2026-08-23", "2026-08-20");
    expect(remaining.views?.remaining).toBe(0);
    expect(remaining.text).toBe("Đã đạt chỉ tiêu.");
  });

  it("no target set at all → distinct text, not a crash", () => {
    const remaining = remainingPerDay(NO_TARGETS, NO_ACTUALS, "2026-08-23", "2026-08-20");
    expect(remaining.text).toContain("Chưa đặt chỉ tiêu");
  });

  it("prefers views as the primary metric when set, over videos/followers", () => {
    const remaining = remainingPerDay(
      { views: 1000, videos: 10, followers: 9000 },
      { views: 0, videos: 0, followersNow: 7800 },
      "2026-08-23",
      "2026-08-20",
    );
    expect(remaining.text).toContain("view/ngày");
  });

  it("falls back to videos, then followers, when views isn't set", () => {
    const videosOnly = remainingPerDay({ ...NO_TARGETS, videos: 10 }, { ...NO_ACTUALS, videos: 0 }, "2026-08-23", "2026-08-20");
    expect(videosOnly.text).toContain("video/ngày");

    const followersOnly = remainingPerDay({ ...NO_TARGETS, followers: 9000 }, { ...NO_ACTUALS, followersNow: 7000 }, "2026-08-23", "2026-08-20");
    expect(followersOnly.text).toContain("follower/ngày");
  });
});

describe("forecastOverallPct", () => {
  it("null before the halfway point of the cycle (elapsedPct < 50) — view bursts make early forecasts dangerous", () => {
    expect(forecastOverallPct(60, 49)).toBeNull();
  });

  it("computed once elapsedPct >= 50 (boundary inclusive)", () => {
    expect(forecastOverallPct(50, 50)).not.toBeNull();
  });

  it("null when overallPct itself is null (no data), regardless of elapsedPct", () => {
    expect(forecastOverallPct(null, 80)).toBeNull();
  });

  it("projects linearly from the cycle's own pace so far", () => {
    const forecast = forecastOverallPct(52, 57);
    expect(forecast?.overallPct).toBe(Math.round((52 / 57) * 100));
    expect(forecast?.confidence).toBe("low"); // elapsedPct 57 < 70
  });

  it("medium confidence once elapsedPct is comfortably late in the cycle", () => {
    expect(forecastOverallPct(80, 75)?.confidence).toBe("medium");
  });
});

describe("computeDataGaps", () => {
  const complete = (date: string, source = "display_api") => ({ date, source, isComplete: true });

  it("no row for a past date → missing", () => {
    const gaps = computeDataGaps([complete("2026-08-17")], "2026-08-17", "2026-08-19", "2026-08-19");
    expect(gaps.missingDates).toEqual(["2026-08-18", "2026-08-19"]);
  });

  it("isComplete=false row → treated as missing (CLAUDE.md: không dùng snapshot đó tính KPI)", () => {
    const gaps = computeDataGaps(
      [complete("2026-08-17"), { date: "2026-08-18", source: "display_api", isComplete: false }],
      "2026-08-17",
      "2026-08-18",
      "2026-08-18",
    );
    expect(gaps.missingDates).toEqual(["2026-08-18"]);
  });

  it("manual_entry resolved row → flagged separately, not counted as missing", () => {
    const gaps = computeDataGaps([complete("2026-08-17", "manual_entry")], "2026-08-17", "2026-08-17", "2026-08-17");
    expect(gaps.missingDates).toEqual([]);
    expect(gaps.manualOnlyDates).toEqual(["2026-08-17"]);
  });

  it("never flags dates after today — cycle still in progress, nothing expected there yet", () => {
    const gaps = computeDataGaps([complete("2026-08-17")], "2026-08-17", "2026-08-25", "2026-08-17");
    expect(gaps.missingDates).toEqual([]);
  });

  it("cycle hasn't started yet (periodStart > today) → no gaps at all", () => {
    const gaps = computeDataGaps([], "2026-08-25", "2026-08-30", "2026-08-17");
    expect(gaps.missingDates).toEqual([]);
    expect(gaps.manualOnlyDates).toEqual([]);
  });
});

describe("assertEditable", () => {
  it("draft cycles pass silently", () => {
    expect(() => assertEditable({ status: "draft" })).not.toThrow();
  });

  it("final cycles throw a 403 AuthorizationError", async () => {
    const { AuthorizationError } = await import("./auth");
    try {
      assertEditable({ status: "final" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      expect((error as InstanceType<typeof AuthorizationError>).status).toBe(403);
    }
  });
});
