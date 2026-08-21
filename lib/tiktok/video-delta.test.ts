import { describe, expect, it } from "vitest";

import { computeViewsDelta } from "./video-delta";
import type { TikTokVideo } from "./provider";

function video(id: string, viewCount: number): TikTokVideo {
  return { id, createTime: 0, title: null, videoLink: null, viewCount, likeCount: 0, commentCount: 0, shareCount: 0 };
}

describe("computeViewsDelta", () => {
  it("sums the per-video delta, not the difference of totals", () => {
    const previous = [
      { tiktokVideoId: "1", viewCount: 100 },
      { tiktokVideoId: "2", viewCount: 50 },
    ];
    const current = [video("1", 130), video("2", 55)];

    const result = computeViewsDelta(previous, current);
    expect(result.viewsInPeriod).toBe(30 + 5);
  });

  it("counts a new video's full view count, not a delta from zero-that-happens-to-match", () => {
    const result = computeViewsDelta([], [video("new", 500)]);
    expect(result.viewsInPeriod).toBe(500);
    expect(result.newVideoIds).toEqual(["new"]);
  });

  it("skips a disappeared video instead of subtracting its last known views", () => {
    const previous = [
      { tiktokVideoId: "1", viewCount: 100 },
      { tiktokVideoId: "gone", viewCount: 9999 },
    ];
    const current = [video("1", 110)];

    const result = computeViewsDelta(previous, current);
    expect(result.viewsInPeriod).toBe(10);
    expect(result.disappearedVideoIds).toEqual(["gone"]);
  });

  it("floors a negative delta at 0 and flags it, instead of subtracting from the total", () => {
    const previous = [{ tiktokVideoId: "1", viewCount: 1000 }];
    // Simulates a truncated/cached response reporting fewer views than last time.
    const current = [video("1", 800)];

    const result = computeViewsDelta(previous, current);
    expect(result.viewsInPeriod).toBe(0);
    expect(result.negativeCount).toBe(1);
  });

  it("returns zero for a channel with no videos on either side", () => {
    const result = computeViewsDelta([], []);
    expect(result.viewsInPeriod).toBe(0);
    expect(result.newVideoIds).toEqual([]);
    expect(result.disappearedVideoIds).toEqual([]);
    expect(result.negativeCount).toBe(0);
  });

  it("handles a mix of new, continuing, and disappeared videos in one pass", () => {
    const previous = [
      { tiktokVideoId: "continuing", viewCount: 200 },
      { tiktokVideoId: "gone", viewCount: 50 },
    ];
    const current = [video("continuing", 250), video("brand-new", 10)];

    const result = computeViewsDelta(previous, current);
    expect(result.viewsInPeriod).toBe(50 + 10);
    expect(result.newVideoIds).toEqual(["brand-new"]);
    expect(result.disappearedVideoIds).toEqual(["gone"]);
    expect(result.negativeCount).toBe(0);
  });
});
