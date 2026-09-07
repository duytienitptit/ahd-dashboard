import { describe, expect, it } from "vitest";

import {
  aggregateChannelStats,
  aggregateHashtagStats,
  aggregateSourceCoverage,
  computeSourceBreakdown,
  bucketMonthlyViews,
  bucketWeeklyLastFollowers,
  bucketWeeklyVideoCounts,
  bucketWeeklyViews,
  buildActivityHeatmap,
  buildCreatorPerformance,
  type ChannelPeriodStat,
  type DailyRow,
  engagementRate,
  groupByChannel,
  weekStartLabel,
  isoWeekStart,
  latestFollowers,
  latestViewerRatio,
  mergeDailyRowsByDate,
  pctChange,
  previousPeriod,
  rankCreatorPerformance,
  sumEngagementParts,
  sumViews,
  sumViewsOrNull,
  viewsDeltaComparable,
  withUnfinishedMarks,
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

describe("viewsDeltaComparable", () => {
  it("accepts a small shortfall — a today-anchored window normally trails its comparison by a day or two", () => {
    expect(viewsDeltaComparable(6, 7)).toBe(true); // missing today only
    expect(viewsDeltaComparable(5, 7)).toBe(true); // missing today + Studio's 2-day lag
    expect(viewsDeltaComparable(7, 7)).toBe(true);
  });

  it("rejects the case the −95% bug came from — current period far thinner than the comparison", () => {
    expect(viewsDeltaComparable(1, 7)).toBe(false); // only 21/08 had data vs a full previous week
    expect(viewsDeltaComparable(2, 7)).toBe(false);
    expect(viewsDeltaComparable(4, 7)).toBe(false); // ceil(7 * 0.7) = 5 needed
  });

  it("scales with the comparison period's own coverage, not a fixed day count", () => {
    expect(viewsDeltaComparable(10, 14)).toBe(true); // ceil(14 * 0.7) = 10
    expect(viewsDeltaComparable(9, 14)).toBe(false);
    expect(viewsDeltaComparable(3, 3)).toBe(true); // small windows: ceil(3 * 0.7) = 3, all-or-nothing
    expect(viewsDeltaComparable(2, 3)).toBe(false);
  });

  it("returns false when the comparison period has no measured days (nothing to compare against)", () => {
    expect(viewsDeltaComparable(5, 0)).toBe(false);
    expect(viewsDeltaComparable(0, 0)).toBe(false);
  });
});

describe("sumViewsOrNull", () => {
  it("sums the measured channels, ignoring unmeasured ones — unchanged rollup semantics", () => {
    expect(sumViewsOrNull([100, null, 50])).toBe(150);
    expect(sumViewsOrNull([100, 50])).toBe(150);
  });

  it("returns null when nothing was measured — the case that used to render a lying '0 view'", () => {
    expect(sumViewsOrNull([null, null])).toBeNull();
    expect(sumViewsOrNull([])).toBeNull();
  });

  it("keeps a genuinely measured 0 as 0, not null — known-zero is not unknown", () => {
    expect(sumViewsOrNull([0])).toBe(0);
    expect(sumViewsOrNull([0, null])).toBe(0);
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

describe("isoWeekStart / weekStartLabel", () => {
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

  it("labels a week by its Monday in d/M — no year, no leading zero (07/09/2026, theo yêu cầu: 'T35' bắt người đọc tự tra tuần đó rơi vào ngày nào)", () => {
    expect(weekStartLabel("2026-08-17")).toBe("17/8");
    expect(weekStartLabel("2026-08-24")).toBe("24/8");
  });

  it("labels every day of a week with that week's Monday, not the day passed in", () => {
    for (const d of ["2026-08-17", "2026-08-19", "2026-08-23"]) {
      expect(weekStartLabel(d)).toBe("17/8");
    }
  });

  it("crosses a month boundary using the Monday's month, not the queried day's", () => {
    expect(weekStartLabel("2026-09-02")).toBe("31/8"); // thứ Tư 2/9 thuộc tuần bắt đầu thứ Hai 31/8
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

  it("returns null (not 0) when there are no rows at all", () => {
    expect(sumViews([])).toBeNull();
  });

  it("returns null (not 0) when every row's videoViews is null — the bootstrap-sync case: the row exists but there's no baseline to diff against yet (docs/DISPLAY_API.md)", () => {
    const bootstrapRows = [
      row({ channelId: "a", date: "2026-08-15", videoViews: null }),
      row({ channelId: "a", date: "2026-08-16", videoViews: null }),
    ];
    expect(sumViews(bootstrapRows)).toBeNull();
  });
});

function channelStat(partial: Partial<ChannelPeriodStat> & { channelId: string }): ChannelPeriodStat {
  return {
    views: 0,
    previousViews: 0,
    viewsDeltaPct: null,
    viewsDeltaInsufficientData: false,
    viewsMeasuredDays: 0,
    previousViewsMeasuredDays: 0,
    videos: 0,
    previousVideos: 0,
    viewsPerVideo: null,
    totalLikes: 0,
    followersNow: null,
    followersBefore: null,
    followersGain: null,
    followersRatePct: null,
    spark: [],
    sourceBreakdown: { reconciledDays: 0, estimatedDays: 0, otherDays: 0 },
    ...partial,
  };
}

describe("aggregateChannelStats", () => {
  it("sums views/followerGain/totalLikes across the given channels — same math for a Creator's channels or a Team's channels", () => {
    const days = { viewsMeasuredDays: 7, previousViewsMeasuredDays: 7 };
    const statsByChannel = new Map([
      ["a", channelStat({ channelId: "a", views: 100000, previousViews: 80000, followersNow: 5000, followersGain: 500, totalLikes: 1300, ...days })],
      ["b", channelStat({ channelId: "b", views: 50000, previousViews: 50000, followersNow: 3000, followersGain: 200, totalLikes: 600, ...days })],
    ]);

    const rollup = aggregateChannelStats(["a", "b"], statsByChannel);
    expect(rollup.totalViews).toBe(150000);
    expect(rollup.followersNow).toBe(8000);
    expect(rollup.followerGain).toBe(700);
    expect(rollup.totalLikes).toBe(1900);
    expect(rollup.viewsDeltaPct).toBe(15); // (150000-130000)/130000
    expect(rollup.viewsDeltaInsufficientData).toBe(false);
  });

  it("suppresses the rollup view % (and flags it) when the current period's measured days are far thinner than the comparison period's", () => {
    const statsByChannel = new Map([
      ["a", channelStat({ channelId: "a", views: 20000, previousViews: 500000, viewsMeasuredDays: 1, previousViewsMeasuredDays: 7 })],
    ]);
    const rollup = aggregateChannelStats(["a"], statsByChannel);
    expect(rollup.totalViews).toBe(20000);
    expect(rollup.viewsDeltaPct).toBeNull(); // not −96% — the current period only has 1/7 days measured
    expect(rollup.viewsDeltaInsufficientData).toBe(true);
  });

  it("ignores a channel id with no entry in the map instead of crashing or counting it as 0 wrongly", () => {
    const statsByChannel = new Map([["a", channelStat({ channelId: "a", views: 100, previousViews: 100 })]]);
    const rollup = aggregateChannelStats(["a", "missing-channel"], statsByChannel);
    expect(rollup.totalViews).toBe(100);
  });

  it("returns totalViews: null (not 0) for an empty channel list — a team with no channels has nothing to report, not a measured zero", () => {
    const rollup = aggregateChannelStats([], new Map());
    expect(rollup.totalViews).toBeNull();
    expect(rollup.totalLikes).toBe(0);
  });

  it("returns totalViews: null when EVERY channel is unmeasured — the '0 view' this used to render read as a real zero (28/08/2026)", () => {
    const statsByChannel = new Map([
      ["a", channelStat({ channelId: "a", views: null, previousViews: null })],
      ["b", channelStat({ channelId: "b", views: null, previousViews: null })],
    ]);
    const rollup = aggregateChannelStats(["a", "b"], statsByChannel);
    expect(rollup.totalViews).toBeNull();
    expect(rollup.viewsDeltaPct).toBeNull();
  });

  it("keeps the existing 'an unmeasured channel contributes nothing' rule when at least one channel HAS a number", () => {
    const statsByChannel = new Map([
      ["a", channelStat({ channelId: "a", views: 5000, previousViews: 4000, viewsMeasuredDays: 7, previousViewsMeasuredDays: 7 })],
      ["b", channelStat({ channelId: "b", views: null, previousViews: null })],
    ]);
    const rollup = aggregateChannelStats(["a", "b"], statsByChannel);
    expect(rollup.totalViews).toBe(5000);
  });

  it("distinguishes a genuinely measured 0 from unmeasured — a channel that really got 0 views still totals 0, not null", () => {
    const statsByChannel = new Map([["a", channelStat({ channelId: "a", views: 0, previousViews: 0 })]]);
    const rollup = aggregateChannelStats(["a"], statsByChannel);
    expect(rollup.totalViews).toBe(0);
  });

  it("sums videos across channels alongside the other rollup fields", () => {
    const statsByChannel = new Map([
      ["a", channelStat({ channelId: "a", views: 1000, previousViews: 1000, videos: 5, previousVideos: 3, totalLikes: 100 })],
    ]);
    const rollup = aggregateChannelStats(["a"], statsByChannel);
    expect(rollup.videos).toBe(5);
    expect(rollup.previousVideos).toBe(3);
    expect(rollup.totalLikes).toBe(100);
  });
});

describe("buildCreatorPerformance", () => {
  it("builds one rollup + channel breakdown per creator, keyed by creator id", () => {
    const statsByChannel = new Map([
      ["ch1", channelStat({ channelId: "ch1", views: 1000, previousViews: 800, viewsDeltaPct: 25, followersNow: 100, followersGain: 10, videos: 2, totalLikes: 40 })],
      ["ch2", channelStat({ channelId: "ch2", views: 500, previousViews: 500, followersNow: 50, followersGain: 5, videos: 1 })],
    ]);
    const creators = [
      { id: "c1", channels: [{ id: "ch1", name: "Kênh 1", tiktokHandle: "@k1" }] },
      { id: "c2", channels: [{ id: "ch2", name: "Kênh 2", tiktokHandle: "@k2" }] },
    ];

    const result = buildCreatorPerformance(creators, statsByChannel);
    expect(result.get("c1")?.totalViews).toBe(1000);
    expect(result.get("c1")?.channels).toEqual([
      {
        id: "ch1",
        name: "Kênh 1",
        tiktokHandle: "@k1",
        views: 1000,
        viewsDeltaPct: 25,
        viewsDeltaInsufficientData: false,
        followersNow: 100,
        followersGain: 10,
        videos: 2,
        totalLikes: 40,
      },
    ]);
    expect(result.get("c2")?.totalViews).toBe(500);
  });

  it("falls back to null per channel when a channel has no entry in statsByChannel (e.g. brand new) — views null, not 0", () => {
    const creators = [{ id: "c1", channels: [{ id: "ch-unsynced", name: "Kênh mới", tiktokHandle: "@moi" }] }];
    const result = buildCreatorPerformance(creators, new Map());
    expect(result.get("c1")?.channels[0]).toMatchObject({ views: null, viewsDeltaPct: null, followersNow: null, videos: 0 });
  });
});

describe("mergeDailyRowsByDate", () => {
  it("sums same-date rows across channels, keeping the weakest source of the day", () => {
    const rows = [
      row({ channelId: "a", date: "2026-08-15", videoViews: 100, followers: 1000, source: "studio_import" }),
      row({ channelId: "b", date: "2026-08-15", videoViews: 200, followers: 500, source: "display_api" }),
    ];
    const merged = mergeDailyRowsByDate(rows, 2);
    expect(merged).toHaveLength(1);
    expect(merged[0].videoViews).toBe(300);
    expect(merged[0].followers).toBe(1500);
    expect(merged[0].source).toBe("display_api"); // weaker than studio_import
    expect(merged[0].isComplete).toBe(true);
  });

  it("keeps a metric null when NOT ONE contributing channel has a known value that day — never a bogus 0", () => {
    const rows = [row({ channelId: "a", date: "2026-08-15", videoViews: null, followers: null })];
    const merged = mergeDailyRowsByDate(rows, 1);
    expect(merged[0].videoViews).toBeNull();
    expect(merged[0].followers).toBeNull();
  });

  it("sums a metric across channels even when one of them is null that day (treats the null as not contributing, not as 0 for everyone)", () => {
    const rows = [
      row({ channelId: "a", date: "2026-08-15", videoViews: 100 }),
      row({ channelId: "b", date: "2026-08-15", videoViews: null }),
    ];
    const merged = mergeDailyRowsByDate(rows, 2);
    expect(merged[0].videoViews).toBe(100);
  });

  it("marks a date incomplete when fewer channels contributed than expected (one silently missing that day)", () => {
    const rows = [row({ channelId: "a", date: "2026-08-15", videoViews: 100 })];
    const merged = mergeDailyRowsByDate(rows, 2); // caller expects 2 channels, only 1 showed up
    expect(merged[0].isComplete).toBe(false);
  });

  it("marks a date incomplete when any contributing row itself is incomplete, even if every channel showed up", () => {
    const rows = [
      row({ channelId: "a", date: "2026-08-15", videoViews: 100, isComplete: true }),
      row({ channelId: "b", date: "2026-08-15", videoViews: 100, isComplete: false }),
    ];
    const merged = mergeDailyRowsByDate(rows, 2);
    expect(merged[0].isComplete).toBe(false);
  });

  it("sorts merged rows ascending by date regardless of input order", () => {
    const rows = [
      row({ channelId: "a", date: "2026-08-16", videoViews: 1 }),
      row({ channelId: "a", date: "2026-08-15", videoViews: 1 }),
    ];
    const merged = mergeDailyRowsByDate(rows, 1);
    expect(merged.map((r) => r.date)).toEqual(["2026-08-15", "2026-08-16"]);
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

  it("emits null (a chart gap), not a plotted 0, for a week where every row's videoViews is null", () => {
    const rows = [
      row({ channelId: "a", date: "2026-08-19", videoViews: null }), // week of 08-17 — no measurement
      row({ channelId: "a", date: "2026-08-24", videoViews: 30 }), // next week — real data
    ];
    const buckets = bucketWeeklyViews(rows);
    expect(buckets[0].value).toBeNull();
    expect(buckets[1].value).toBe(30);
  });

  it("still sums a week's known rows even when that same week also has a null row", () => {
    const rows = [
      row({ channelId: "a", date: "2026-08-17", videoViews: 100 }),
      row({ channelId: "a", date: "2026-08-18", videoViews: null }), // partial gap, same week
    ];
    expect(bucketWeeklyViews(rows)[0].value).toBe(100);
  });
});

describe("bucketMonthlyViews", () => {
  it("sums views within a calendar month and sorts chronologically, so tháng 7 với tháng 8", () => {
    const rows = [
      row({ channelId: "a", date: "2026-07-15", videoViews: 100 }),
      row({ channelId: "a", date: "2026-07-28", videoViews: 50 }), // same month
      row({ channelId: "a", date: "2026-08-03", videoViews: 30 }), // next month
    ];
    const buckets = bucketMonthlyViews(rows);
    expect(buckets).toEqual([
      { label: "Th7", value: 150 },
      { label: "Th8", value: 30 },
    ]);
  });

  it("emits null for a month where every row's videoViews is null", () => {
    const rows = [row({ channelId: "a", date: "2026-07-15", videoViews: null })];
    expect(bucketMonthlyViews(rows)[0].value).toBeNull();
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
      { label: weekStartLabel("2026-08-17"), value: 2 },
      { label: weekStartLabel("2026-08-24"), value: 1 },
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

  it("does NOT badge a lone active creator as leader — nothing to be ahead of", () => {
    const ranks = rankCreatorPerformance([{ creatorId: "a", totalViews: 500000, avgViewsDeltaPct: 0, channelCount: 2 }]);
    expect(ranks.get("a")).toBe("stable");
  });

  it("a lone creator can still be flagged growth/attention off their own trend", () => {
    const ranks = rankCreatorPerformance([{ creatorId: "a", totalViews: 500000, avgViewsDeltaPct: 15, channelCount: 2 }]);
    expect(ranks.get("a")).toBe("growth");
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

describe("computeSourceBreakdown", () => {
  it("counts each resolved day into exactly one tier — the three counts always sum to the row count", () => {
    const rows = [
      row({ channelId: "a", date: "2026-09-01", source: "studio_import" }),
      row({ channelId: "a", date: "2026-09-02", source: "studio_import" }),
      row({ channelId: "a", date: "2026-09-03", source: "display_api" }),
      row({ channelId: "a", date: "2026-09-04", source: "manual_entry" }),
    ];
    expect(computeSourceBreakdown(rows)).toEqual({ reconciledDays: 2, estimatedDays: 1, otherDays: 1 });
  });

  it("counts an is_complete=false day as a source day — the badge answers 'số này lấy từ đâu', not 'ngày này có được cộng vào tổng không'", () => {
    const rows = [row({ channelId: "a", date: "2026-08-28", source: "display_api", isComplete: false })];
    expect(computeSourceBreakdown(rows)).toEqual({ reconciledDays: 0, estimatedDays: 1, otherDays: 0 });
  });

  it("returns all zeros for a period with no rows at all", () => {
    expect(computeSourceBreakdown([])).toEqual({ reconciledDays: 0, estimatedDays: 0, otherDays: 0 });
  });
});

describe("aggregateSourceCoverage", () => {
  const channels = [
    { id: "a", name: "Kênh A" },
    { id: "b", name: "Kênh B" },
  ];

  it("sums cells across channels and counts a channel as fully reconciled only when EVERY measured day is studio_import", () => {
    const stats = new Map([
      ["a", channelStat({ channelId: "a", sourceBreakdown: { reconciledDays: 7, estimatedDays: 0, otherDays: 0 } })],
      ["b", channelStat({ channelId: "b", sourceBreakdown: { reconciledDays: 2, estimatedDays: 5, otherDays: 0 } })],
    ]);
    const coverage = aggregateSourceCoverage(channels, stats);

    expect(coverage.measuredCells).toBe(14);
    expect(coverage.reconciledCells).toBe(9);
    expect(coverage.fullyReconciledChannels).toBe(1);
    expect(coverage.unreconciledChannels).toBe(0);
    expect(coverage.totalChannels).toBe(2);
  });

  it("counts a channel with NO stats entry as unreconciled — a channel that never imported must not be silently dropped, which would flatter the badge exactly when the data is worst (4/9 kênh chưa từng import, 05/09/2026)", () => {
    const stats = new Map([
      ["a", channelStat({ channelId: "a", sourceBreakdown: { reconciledDays: 7, estimatedDays: 0, otherDays: 0 } })],
    ]);
    const coverage = aggregateSourceCoverage(channels, stats);

    expect(coverage.unreconciledChannels).toBe(1);
    expect(coverage.totalChannels).toBe(2);
    expect(coverage.perChannel).toHaveLength(2);
    expect(coverage.perChannel.find((c) => c.channelId === "b")).toEqual({
      channelId: "b",
      channelName: "Kênh B",
      reconciledDays: 0,
      estimatedDays: 0,
      otherDays: 0,
    });
  });

  it("does not count an empty channel as fully reconciled — 0 measured days is 'chưa có gì', not 'sạch'", () => {
    const coverage = aggregateSourceCoverage(channels, new Map());
    expect(coverage.fullyReconciledChannels).toBe(0);
    expect(coverage.unreconciledChannels).toBe(2);
    expect(coverage.measuredCells).toBe(0);
  });

  it("sorts the least-reconciled channel first, so the popover opens on the work that needs doing", () => {
    const stats = new Map([
      ["a", channelStat({ channelId: "a", sourceBreakdown: { reconciledDays: 7, estimatedDays: 0, otherDays: 0 } })],
      ["b", channelStat({ channelId: "b", sourceBreakdown: { reconciledDays: 0, estimatedDays: 7, otherDays: 0 } })],
    ]);
    expect(aggregateSourceCoverage(channels, stats).perChannel.map((c) => c.channelId)).toEqual(["b", "a"]);
  });
});

describe("withUnfinishedMarks", () => {
  const week = (labels: string[]) => labels.map((label) => ({ label, value: 100 }));
  /** `through` mặc định = `now` (dữ liệu đã kịp tới mốc phải) trừ khi test cần khoảng lệch. */
  const at = (now: string, through: string | null = now) => ({ now, through });

  it("leaves a finished week alone — now = Chủ nhật là ngày chót của tuần đó", () => {
    // 31/8/2026 là thứ Hai, nên tuần đó chạy 31/8 → 6/9.
    const out = withUnfinishedMarks({ week: week(["24/8", "31/8"]), month: [] }, at("2026-09-06"));
    expect(out.week).toHaveLength(2);
    expect(out.week[1].coverage).toBeUndefined();
  });

  it("marks the running week with days covered so far — ca sẽ xuất hiện từ sáng thứ Ba", () => {
    // 8/9/2026 là thứ Ba: tuần 7/9 → 13/9 mới đi được 2 ngày.
    const out = withUnfinishedMarks({ week: week(["31/8", "7/9"]), month: [] }, at("2026-09-08"));
    expect(out.week[1].coverage).toEqual({ days: 2, totalDays: 7 });
  });

  it("marks only the LAST point — các kỳ trước nó đều đã trôi qua", () => {
    const out = withUnfinishedMarks({ week: week(["24/8", "31/8", "7/9"]), month: [] }, at("2026-09-08"));
    expect(out.week[0].coverage).toBeUndefined();
    expect(out.week[1].coverage).toBeUndefined();
    expect(out.week[2].coverage).toEqual({ days: 2, totalDays: 7 });
  });

  it("thêm cột tuần hiện tại khi dữ liệu còn trễ — value null, không chấm, không tô nền", () => {
    // Thứ Tư 9/9, dữ liệu mới tới hết tuần trước (7/9) → tuần 7/9→13/9 chưa có bucket.
    const out = withUnfinishedMarks(
      { week: week(["24/8", "31/8"]), month: [] },
      { now: "2026-09-09", through: "2026-09-07" },
    );
    expect(out.week.map((p) => p.label)).toEqual(["24/8", "31/8", "7/9"]);
    expect(out.week[2].value).toBeNull();
    expect(out.week[2].coverage).toEqual({ days: 1, totalDays: 7 }); // chỉ ngày 7/9 đã có thể có số
  });

  it("cột tuần hiện tại khi kỳ chưa chạm ngày nào có dữ liệu → days = 0", () => {
    // Thứ Hai 7/9 (đầu tuần), dữ liệu mới tới 6/9 (Chủ nhật tuần trước).
    const out = withUnfinishedMarks(
      { week: week(["24/8", "31/8"]), month: [] },
      { now: "2026-09-07", through: "2026-09-06" },
    );
    expect(out.week[2].label).toBe("7/9");
    expect(out.week[2].coverage).toEqual({ days: 0, totalDays: 7 });
  });

  it("through = null (chưa đo được ngày nào) — vẫn kéo cột kỳ hiện tại, days = 0", () => {
    const out = withUnfinishedMarks({ week: week(["31/8"]), month: [] }, { now: "2026-09-08", through: null });
    expect(out.week[1].label).toBe("7/9");
    expect(out.week[1].coverage).toEqual({ days: 0, totalDays: 7 });
  });

  it("cắt còn 8 tuần gần nhất sau khi đệm", () => {
    const labels = ["1/6", "8/6", "15/6", "22/6", "29/6", "6/7", "13/7", "20/7", "27/7", "3/8"];
    const out = withUnfinishedMarks({ week: week(labels), month: [] }, at("2026-08-05")); // trong tuần 3/8
    expect(out.week.map((p) => p.label)).toEqual(["15/6", "22/6", "29/6", "6/7", "13/7", "20/7", "27/7", "3/8"]);
  });

  it("counts a partial month against that month's real length, not a fixed 30", () => {
    const feb = withUnfinishedMarks({ week: [], month: week(["Th1", "Th2"]) }, at("2026-02-10"));
    expect(feb.month[1].coverage).toEqual({ days: 10, totalDays: 28 }); // 2026 không nhuận
    const sep = withUnfinishedMarks({ week: [], month: week(["Th8", "Th9"]) }, at("2026-09-06"));
    expect(sep.month[1].coverage).toEqual({ days: 6, totalDays: 30 });
  });

  it("leaves a finished month alone", () => {
    const out = withUnfinishedMarks({ week: [], month: week(["Th7", "Th8"]) }, at("2026-08-31"));
    expect(out.month[1].coverage).toBeUndefined();
  });

  it("handles an empty series without inventing a point", () => {
    expect(withUnfinishedMarks({ week: [], month: [] }, at("2026-09-08"))).toEqual({ week: [], month: [] });
  });
});
