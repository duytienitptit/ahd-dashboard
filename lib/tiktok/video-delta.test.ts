import { describe, expect, it } from "vitest";

import { computeViewsDelta } from "./video-delta";
import type { TikTokVideo } from "./provider";

const PERIOD = "2026-08-24";
// 2026-08-24T05:00:00Z = 2026-08-24 12:00 VN — safely inside PERIOD's VN calendar day either side.
const POSTED_ON_PERIOD = Math.floor(Date.parse("2026-08-24T05:00:00Z") / 1000);
// A week earlier — unambiguously a different VN calendar day from PERIOD.
const POSTED_BEFORE_PERIOD = Math.floor(Date.parse("2026-08-17T05:00:00Z") / 1000);

function video(id: string, viewCount: number, createTime = POSTED_ON_PERIOD): TikTokVideo {
  return { id, createTime, title: null, videoLink: null, viewCount, likeCount: 0, commentCount: 0, shareCount: 0 };
}

describe("computeViewsDelta", () => {
  it("sums the per-video delta, not the difference of totals", () => {
    const previous = [
      { tiktokVideoId: "1", viewCount: 100 },
      { tiktokVideoId: "2", viewCount: 50 },
    ];
    const current = [video("1", 130), video("2", 55)];

    const result = computeViewsDelta(previous, current, PERIOD);
    expect(result.viewsInPeriod).toBe(30 + 5);
  });

  it("counts a new video's full view count when it was posted ON the period date", () => {
    const result = computeViewsDelta([], [video("new", 500, POSTED_ON_PERIOD)], PERIOD);
    expect(result.viewsInPeriod).toBe(500);
    expect(result.newVideoIds).toEqual(["new"]);
    expect(result.lateDiscoveredVideoIds).toEqual([]);
  });

  it("excludes a no-baseline video posted BEFORE the period date, instead of counting its lifetime total (bẫy #10)", () => {
    // e.g. a channel just reconnected after a gap — this video existed all along, it's only NEW TO
    // US today, not newly posted. Counting its full (possibly huge) lifetime view count would wildly
    // overstate one day's growth.
    const result = computeViewsDelta([], [video("old-but-first-seen-today", 999_999, POSTED_BEFORE_PERIOD)], PERIOD);
    expect(result.viewsInPeriod).toBe(0);
    expect(result.newVideoIds).toEqual([]);
    expect(result.lateDiscoveredVideoIds).toEqual(["old-but-first-seen-today"]);
  });

  it("skips a disappeared video instead of subtracting its last known views", () => {
    const previous = [
      { tiktokVideoId: "1", viewCount: 100 },
      { tiktokVideoId: "gone", viewCount: 9999 },
    ];
    const current = [video("1", 110)];

    const result = computeViewsDelta(previous, current, PERIOD);
    expect(result.viewsInPeriod).toBe(10);
    expect(result.disappearedVideoIds).toEqual(["gone"]);
  });

  it("floors a negative delta at 0 and flags it, instead of subtracting from the total", () => {
    const previous = [{ tiktokVideoId: "1", viewCount: 1000 }];
    // Simulates a truncated/cached response reporting fewer views than last time.
    const current = [video("1", 800)];

    const result = computeViewsDelta(previous, current, PERIOD);
    expect(result.viewsInPeriod).toBe(0);
    expect(result.negativeCount).toBe(1);
  });

  it("returns zero for a channel with no videos on either side", () => {
    const result = computeViewsDelta([], [], PERIOD);
    expect(result.viewsInPeriod).toBe(0);
    expect(result.newVideoIds).toEqual([]);
    expect(result.lateDiscoveredVideoIds).toEqual([]);
    expect(result.disappearedVideoIds).toEqual([]);
    expect(result.negativeCount).toBe(0);
  });

  it("handles a mix of continuing, newly-posted, late-discovered, and disappeared videos in one pass", () => {
    const previous = [
      { tiktokVideoId: "continuing", viewCount: 200 },
      { tiktokVideoId: "gone", viewCount: 50 },
    ];
    const current = [
      video("continuing", 250),
      video("brand-new", 10, POSTED_ON_PERIOD),
      video("resurfaced", 777_777, POSTED_BEFORE_PERIOD),
    ];

    const result = computeViewsDelta(previous, current, PERIOD);
    expect(result.viewsInPeriod).toBe(50 + 10); // resurfaced's 777,777 must NOT be in here
    expect(result.newVideoIds).toEqual(["brand-new"]);
    expect(result.lateDiscoveredVideoIds).toEqual(["resurfaced"]);
    expect(result.disappearedVideoIds).toEqual(["gone"]);
    expect(result.negativeCount).toBe(0);
  });
});
