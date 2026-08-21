import { describe, expect, it } from "vitest";

import {
  aggregateHashtagStats,
  bucketWeeklyLastFollowers,
  bucketWeeklyVideoCounts,
  bucketWeeklyViews,
  buildActivityHeatmap,
  type DailyRow,
  engagementRate,
  groupByChannel,
  isoWeekLabel,
  isoWeekStart,
  latestFollowers,
  latestViewerRatio,
  pctChange,
  previousPeriod,
  rankCreatorPerformance,
  sumEngagementParts,
  sumViews,
} from "./dashboard";

function row(partial: Partial<DailyRow> & { channelId: string; date: string }): DailyRow {
  return {
    videoViews: null,
    videoCount: null,
    followers: null,
    likes: null,
    comments: null,
    shares: null,
    totalViewers: null,
    newViewers: null,
    source: "studio_import",
    isComplete: true,
    ...partial,
  };
}

describe("pctChange", () => {
  it("computes a normal percentage change", () => {
    expect(pctChange(120, 100)).toBe(20);
    expect(pctChange(80, 100)).toBe(-20);
  });

  it("returns null when there is nothing to compare against", () => {
    expect(pctChange(50, 0)).toBeNull();
  });

  it("returns 0 when both periods are genuinely zero, not null", () => {
    expect(pctChange(0, 0)).toBe(0);
  });
});

describe("previousPeriod", () => {
  it("matches the period length for a 7-day window", () => {
    expect(previousPeriod("2026-08-15", "2026-08-21")).toEqual({
      comparedFrom: "2026-08-08",
      comparedTo: "2026-08-14",
    });
  });

  it("matches the period length for a custom-length window", () => {
    expect(previousPeriod("2026-08-01", "2026-08-10")).toEqual({
      comparedFrom: "2026-07-22",
      comparedTo: "2026-07-31",
    });
  });

  it("handles a single-day period", () => {
    expect(previousPeriod("2026-08-15", "2026-08-15")).toEqual({
      comparedFrom: "2026-08-14",
      comparedTo: "2026-08-14",
    });
  });
});

describe("isoWeekStart / isoWeekLabel", () => {
  it("maps a Monday to itself", () => {
    expect(isoWeekStart("2026-08-17")).toBe("2026-08-17");
  });

  it("maps every day in the same Mon–Sun span to the same bucket", () => {
    const monday = isoWeekStart("2026-08-17");
    for (const d of ["2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23"]) {
      expect(isoWeekStart(d)).toBe(monday);
    }
    expect(isoWeekStart("2026-08-16")).not.toBe(monday); // Sunday — the week before
  });

  it("increments the week label by one across a week boundary", () => {
    const week = Number(isoWeekLabel("2026-08-17").slice(1));
    const nextWeek = Number(isoWeekLabel("2026-08-24").slice(1));
    expect(nextWeek).toBe(week + 1);
  });
});

describe("sumViews / sumEngagementParts / engagementRate", () => {
  const rows = [
    row({ channelId: "a", date: "2026-08-15", videoViews: 100, likes: 10, comments: 2, shares: 1 }),
    row({ channelId: "a", date: "2026-08-16", videoViews: 200, likes: 20, comments: 4, shares: 2 }),
    row({ channelId: "a", date: "2026-08-17", videoViews: null }), // gap day — must not count as 0-and-included wrongly
  ];

  it("sums views, treating null as no contribution", () => {
    expect(sumViews(rows)).toBe(300);
  });

  it("sums likes/comments/shares independently", () => {
    expect(sumEngagementParts(rows)).toEqual({ likes: 30, comments: 6, shares: 3 });
  });

  it("computes engagement rate as (likes+comments+shares)/views", () => {
    expect(engagementRate(rows)).toBeCloseTo(39 / 300);
  });

  it("returns null engagement rate when there are no views", () => {
    expect(engagementRate([row({ channelId: "a", date: "2026-08-15" })])).toBeNull();
  });
});

describe("latestFollowers", () => {
  it("returns the last non-null value in date-ascending input", () => {
    const rows = [
      row({ channelId: "a", date: "2026-08-15", followers: 100 }),
      row({ channelId: "a", date: "2026-08-16", followers: null }), // sync gap, not a drop to zero
      row({ channelId: "a", date: "2026-08-17", followers: 120 }),
    ];
    expect(latestFollowers(rows)).toBe(120);
  });

  it("skips trailing null rows to find the last known value", () => {
    const rows = [
      row({ channelId: "a", date: "2026-08-15", followers: 100 }),
      row({ channelId: "a", date: "2026-08-16", followers: null }),
    ];
    expect(latestFollowers(rows)).toBe(100);
  });

  it("returns null when nothing is known", () => {
    expect(latestFollowers([row({ channelId: "a", date: "2026-08-15" })])).toBeNull();
  });
});

describe("latestViewerRatio", () => {
  it("picks the most recent row with both totalViewers and newViewers", () => {
    const rows = [
      row({ channelId: "a", date: "2026-08-14", totalViewers: 1000, newViewers: 400 }),
      row({ channelId: "a", date: "2026-08-15", totalViewers: null, newViewers: null }), // display_api gap
    ];
    const result = latestViewerRatio(rows);
    expect(result).toEqual({ date: "2026-08-14", totalViewers: 1000, newViewers: 400, ratio: 0.4 });
  });

  it("returns null when nothing has viewer data", () => {
    expect(latestViewerRatio([row({ channelId: "a", date: "2026-08-15" })])).toBeNull();
  });
});

describe("groupByChannel", () => {
  it("splits a mixed-channel row list into per-channel buckets", () => {
    const rows = [
      row({ channelId: "a", date: "2026-08-15" }),
      row({ channelId: "b", date: "2026-08-15" }),
      row({ channelId: "a", date: "2026-08-16" }),
    ];
    const grouped = groupByChannel(rows);
    expect(grouped.get("a")).toHaveLength(2);
    expect(grouped.get("b")).toHaveLength(1);
  });
});

describe("bucketWeeklyViews", () => {
  it("sums views within a week and sorts buckets chronologically", () => {
    const rows = [
      row({ channelId: "a", date: "2026-08-19", videoViews: 100 }), // week of 08-17
      row({ channelId: "a", date: "2026-08-20", videoViews: 50 }), // same week
      row({ channelId: "a", date: "2026-08-24", videoViews: 30 }), // next week
    ];
    const buckets = bucketWeeklyViews(rows);
    expect(buckets).toHaveLength(2);
    expect(buckets[0].value).toBe(150);
    expect(buckets[1].value).toBe(30);
  });
});

describe("bucketWeeklyLastFollowers", () => {
  it("takes the last known value in the week, not a sum, for a single channel", () => {
    const rows = [
      row({ channelId: "a", date: "2026-08-17", followers: 100 }),
      row({ channelId: "a", date: "2026-08-19", followers: 110 }),
      row({ channelId: "a", date: "2026-08-20", followers: null }), // gap — must not overwrite 110
    ];
    const buckets = bucketWeeklyLastFollowers(rows);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].value).toBe(110);
  });

  it("sums each channel's own last-known value, not the last row across channels", () => {
    // Row order interleaves channels — a naive "last row wins" would pick whichever channel's row
    // happens to sort last (here, "b"'s 08-19 row) instead of summing both channels' own latest.
    const rows = [
      row({ channelId: "a", date: "2026-08-17", followers: 1000 }),
      row({ channelId: "b", date: "2026-08-18", followers: 50 }),
      row({ channelId: "a", date: "2026-08-19", followers: 1100 }),
      row({ channelId: "b", date: "2026-08-19", followers: 55 }),
    ];
    const buckets = bucketWeeklyLastFollowers(rows);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].value).toBe(1155); // 1100 (a's latest) + 55 (b's latest)
  });
});

describe("bucketWeeklyVideoCounts", () => {
  it("counts posted-video dates per ISO week", () => {
    const buckets = bucketWeeklyVideoCounts(["2026-08-17", "2026-08-19", "2026-08-24"]);
    expect(buckets).toEqual([
      { label: isoWeekLabel("2026-08-17"), value: 2 },
      { label: isoWeekLabel("2026-08-24"), value: 1 },
    ]);
  });
});

describe("aggregateHashtagStats", () => {
  it("averages views per hashtag across videos that carry it", () => {
    const stats = aggregateHashtagStats([
      { hashtags: ["a", "b"], views: 100 },
      { hashtags: ["a"], views: 300 },
    ]);
    const a = stats.find((s) => s.hashtag === "a")!;
    const b = stats.find((s) => s.hashtag === "b")!;
    expect(a).toEqual({ hashtag: "a", videos: 2, totalViews: 400, avgViews: 200 });
    expect(b).toEqual({ hashtag: "b", videos: 1, totalViews: 100, avgViews: 100 });
  });

  it("excludes videos with no view data yet instead of treating them as 0", () => {
    const stats = aggregateHashtagStats([
      { hashtags: ["a"], views: 100 },
      { hashtags: ["a"], views: null },
    ]);
    expect(stats).toEqual([{ hashtag: "a", videos: 1, totalViews: 100, avgViews: 100 }]);
  });

  it("sorts descending by average views", () => {
    const stats = aggregateHashtagStats([
      { hashtags: ["low"], views: 10 },
      { hashtags: ["high"], views: 1000 },
    ]);
    expect(stats.map((s) => s.hashtag)).toEqual(["high", "low"]);
  });
});

describe("rankCreatorPerformance", () => {
  it("gives the single highest-view creator the leader badge", () => {
    const ranks = rankCreatorPerformance([
      { creatorId: "a", totalViews: 1000, avgViewsDeltaPct: 0, channelCount: 2 },
      { creatorId: "b", totalViews: 500, avgViewsDeltaPct: 0, channelCount: 1 },
    ]);
    expect(ranks.get("a")).toBe("leader");
    expect(ranks.get("b")).toBe("stable");
  });

  it("flags a non-leader with a strong upward trend as growth", () => {
    const ranks = rankCreatorPerformance([
      { creatorId: "a", totalViews: 1000, avgViewsDeltaPct: 0, channelCount: 2 },
      { creatorId: "b", totalViews: 500, avgViewsDeltaPct: 15, channelCount: 1 },
    ]);
    expect(ranks.get("b")).toBe("growth");
  });

  it("flags a non-leader with a strong downward trend as attention", () => {
    const ranks = rankCreatorPerformance([
      { creatorId: "a", totalViews: 1000, avgViewsDeltaPct: 0, channelCount: 2 },
      { creatorId: "b", totalViews: 500, avgViewsDeltaPct: -20, channelCount: 1 },
    ]);
    expect(ranks.get("b")).toBe("attention");
  });

  it("excludes creators with zero channels instead of ranking them", () => {
    const ranks = rankCreatorPerformance([{ creatorId: "a", totalViews: 0, avgViewsDeltaPct: null, channelCount: 0 }]);
    expect(ranks.has("a")).toBe(false);
  });
});

describe("buildActivityHeatmap", () => {
  it("pivots flat (date, hour, activeFollowers) rows into an hour x date grid", () => {
    const heatmap = buildActivityHeatmap([
      { date: "2026-08-15", hour: 20, activeFollowers: 300 },
      { date: "2026-08-16", hour: 3, activeFollowers: 10 },
    ]);
    expect(heatmap.dates).toEqual(["2026-08-15", "2026-08-16"]);
    expect(heatmap.hours).toHaveLength(24);
    expect(heatmap.grid[20][0]).toBe(300);
    expect(heatmap.grid[3][1]).toBe(10);
    expect(heatmap.grid[0][0]).toBeNull();
    expect(heatmap.max).toBe(300);
  });
});
