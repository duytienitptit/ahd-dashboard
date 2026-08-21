import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { addDaysToDateString, daysBetweenDateStrings, nowVnDateString, vnMidnightIso } from "@/lib/time";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// ---------------------------------------------------------------------------
// Pure helpers — no Supabase, all unit-tested in dashboard.test.ts. Every screen that shows a
// period-over-period number (Tổng quan, Kênh, Chi tiết kênh, Creator) goes through these so the
// math can't drift between screens (CLAUDE.md: "tính progress ở server-side").
// ---------------------------------------------------------------------------

/** `null` when there's nothing to compare against — an honest "no prior data" instead of a bogus
 *  +Infinity% or a silently-wrong 0%. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

/** The immediately-preceding period of the SAME length as `[from, to]` — "so với kỳ trước" has to
 *  mean "the same number of days, right before this one" once the period is a user-picked range
 *  instead of always 7 days (M4 date-range picker). */
export function previousPeriod(from: string, to: string): { comparedFrom: string; comparedTo: string } {
  const lengthDays = daysBetweenDateStrings(from, to) + 1;
  const comparedTo = addDaysToDateString(from, -1);
  const comparedFrom = addDaysToDateString(comparedTo, -(lengthDays - 1));
  return { comparedFrom, comparedTo };
}

/** Monday of `dateStr`'s ISO week, as the bucket's sort key. Pure calendar-date arithmetic on an
 *  already-VN date string — no timezone conversion (matches lib/time.ts's addDaysToDateString). */
export function isoWeekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum);
  return date.toISOString().slice(0, 10);
}

/** ISO week-number label ("T34"), matching design/Main.dc.html's trend-chart x-axis. */
export function isoWeekLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday decides the ISO week/year
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `T${week}`;
}

export type DailyRow = {
  channelId: string;
  date: string;
  videoViews: number | null;
  videoCount: number | null;
  followers: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  totalViewers: number | null;
  newViewers: number | null;
  source: string;
  isComplete: boolean;
};

export function sumViews(rows: DailyRow[]): number {
  return rows.reduce((sum, r) => sum + (r.videoViews ?? 0), 0);
}

export function sumEngagementParts(rows: DailyRow[]): { likes: number; comments: number; shares: number } {
  return rows.reduce(
    (acc, r) => ({
      likes: acc.likes + (r.likes ?? 0),
      comments: acc.comments + (r.comments ?? 0),
      shares: acc.shares + (r.shares ?? 0),
    }),
    { likes: 0, comments: 0, shares: 0 },
  );
}

export function engagementRate(rows: DailyRow[]): number | null {
  const views = sumViews(rows);
  if (views <= 0) return null;
  const { likes, comments, shares } = sumEngagementParts(rows);
  return (likes + comments + shares) / views;
}

/** Last known followers value in `rows` (expects ascending-by-date input), skipping null rows. */
export function latestFollowers(rows: DailyRow[]): number | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].followers !== null) return rows[i].followers;
  }
  return null;
}

export type ViewerRatio = { date: string; totalViewers: number; newViewers: number; ratio: number };

/** `newViewers/totalViewers` — Viewers.csv-only fields, so only `studio_import` rows ever carry
 *  them. Picks the most recent row (expects ascending-by-date input) that actually has both. */
export function latestViewerRatio(rows: DailyRow[]): ViewerRatio | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row.totalViewers !== null && row.totalViewers > 0 && row.newViewers !== null) {
      return { date: row.date, totalViewers: row.totalViewers, newViewers: row.newViewers, ratio: row.newViewers / row.totalViewers };
    }
  }
  return null;
}

/** Groups already-fetched rows by channel — one Supabase round trip serves every per-channel card
 *  (growth / viewShare / efficiency / Channels table / Creator cards). */
export function groupByChannel(rows: DailyRow[]): Map<string, DailyRow[]> {
  const map = new Map<string, DailyRow[]>();
  for (const row of rows) {
    const list = map.get(row.channelId);
    if (list) list.push(row);
    else map.set(row.channelId, [row]);
  }
  return map;
}

export type TrendPoint = { label: string; value: number };

/** Buckets rows (any number of channels, already date-filtered by the caller) into ISO-week sums
 *  of `videoViews` — the "Xu hướng toàn team" / "Diễn biến của kênh" chart series. */
export function bucketWeeklyViews(rows: DailyRow[]): TrendPoint[] {
  const byWeek = new Map<string, TrendPoint>();
  for (const row of rows) {
    const key = isoWeekStart(row.date);
    const entry = byWeek.get(key) ?? { label: isoWeekLabel(row.date), value: 0 };
    entry.value += row.videoViews ?? 0;
    byWeek.set(key, entry);
  }
  return [...byWeek.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, point]) => point);
}

/** Followers is a stock, not a flow — each week's point is the SUM, across channels, of each
 *  channel's own last known value that week. Must resolve "last known" per channel before summing:
 *  taking the last row in date order across the whole (possibly multi-channel) input would just
 *  pick whichever channel's row happens to sort last, not the team total. Weeks where a channel has
 *  no synced row contribute nothing for that channel, not a zero. */
export function bucketWeeklyLastFollowers(rows: DailyRow[]): TrendPoint[] {
  const sumByWeek = new Map<string, number>();

  for (const channelRows of groupByChannel(rows).values()) {
    const lastByWeek = new Map<string, { asOfDate: string; followers: number }>();
    for (const row of channelRows) {
      if (row.followers === null) continue;
      const key = isoWeekStart(row.date);
      const existing = lastByWeek.get(key);
      if (!existing || row.date >= existing.asOfDate) {
        lastByWeek.set(key, { asOfDate: row.date, followers: row.followers });
      }
    }
    for (const [week, { followers }] of lastByWeek) {
      sumByWeek.set(week, (sumByWeek.get(week) ?? 0) + followers);
    }
  }

  return [...sumByWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([week, value]) => ({ label: isoWeekLabel(week), value }));
}

/** One point per posted video, already resolved to a VN calendar-date string
 *  (`nowVnDateString(new Date(video.posted_at))` at the call site) — counts videos per ISO week. */
export function bucketWeeklyVideoCounts(postedDates: string[]): TrendPoint[] {
  const byWeek = new Map<string, TrendPoint>();
  for (const date of postedDates) {
    const key = isoWeekStart(date);
    const entry = byWeek.get(key) ?? { label: isoWeekLabel(date), value: 0 };
    entry.value += 1;
    byWeek.set(key, entry);
  }
  return [...byWeek.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, point]) => point);
}

export type CreatorRank = "leader" | "growth" | "attention" | "stable";

/** Data-driven Creator-card badge — CLAUDE.md: "đừng lấy % KPI làm trục sắp xếp mặc định", so this
 *  ranks by view share and trend instead of a KPI cycle nothing has created yet.
 *  "leader": the single highest total-views creator (ties keep the first by input order).
 *  "growth" / "attention": ±10-point average view-trend threshold, same as the health-color rule in
 *  docs/DESIGN_SYSTEM.md (`pct >= 70 cyan / >= 45 amber / < 45 red`) adapted to a delta instead of a
 *  percent-of-target. "stable" (no badge) otherwise, including creators with zero channels. */
export function rankCreatorPerformance(
  creators: { creatorId: string; totalViews: number; avgViewsDeltaPct: number | null; channelCount: number }[],
): Map<string, CreatorRank> {
  const ranked = new Map<string, CreatorRank>();
  const withChannels = creators.filter((c) => c.channelCount > 0);
  if (withChannels.length === 0) return ranked;

  const leader = withChannels.reduce((best, c) => (c.totalViews > best.totalViews ? c : best));

  for (const c of withChannels) {
    if (c.creatorId === leader.creatorId && leader.totalViews > 0) {
      ranked.set(c.creatorId, "leader");
    } else if (c.avgViewsDeltaPct !== null && c.avgViewsDeltaPct >= 10) {
      ranked.set(c.creatorId, "growth");
    } else if (c.avgViewsDeltaPct !== null && c.avgViewsDeltaPct <= -10) {
      ranked.set(c.creatorId, "attention");
    } else {
      ranked.set(c.creatorId, "stable");
    }
  }
  return ranked;
}

export type HashtagStat = { hashtag: string; videos: number; totalViews: number; avgViews: number };

/** Groups videos by hashtag and averages their latest known view count. A video with no view data
 *  yet (never synced) is excluded rather than silently counted as a 0-view video, which would drag
 *  every hashtag's average down for a reason that has nothing to do with content performance. */
export function aggregateHashtagStats(videos: { hashtags: string[]; views: number | null }[]): HashtagStat[] {
  const byTag = new Map<string, { videos: number; totalViews: number }>();
  for (const video of videos) {
    if (video.views === null) continue;
    for (const tag of video.hashtags) {
      const entry = byTag.get(tag) ?? { videos: 0, totalViews: 0 };
      entry.videos += 1;
      entry.totalViews += video.views;
      byTag.set(tag, entry);
    }
  }
  return [...byTag.entries()]
    .map(([hashtag, { videos: count, totalViews }]) => ({
      hashtag,
      videos: count,
      totalViews,
      avgViews: Math.round(totalViews / count),
    }))
    .sort((a, b) => b.avgViews - a.avgViews);
}

export type ActivityHeatmap = {
  dates: string[]; // ascending, oldest..newest
  hours: number[]; // 0..23
  grid: (number | null)[][]; // grid[hourIndex][dateIndex]
  max: number;
};

/** Pivots flat (date, hour, activeFollowers) rows from `follower_activity` into an hour × date grid
 *  for the "giờ vàng đăng bài" heatmap. `max` drives cell-color intensity in the UI. */
export function buildActivityHeatmap(
  cells: { date: string; hour: number; activeFollowers: number | null }[],
): ActivityHeatmap {
  const dates = [...new Set(cells.map((c) => c.date))].sort();
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const dateIndex = new Map(dates.map((d, i) => [d, i]));

  const grid: (number | null)[][] = hours.map(() => dates.map(() => null));
  let max = 0;
  for (const cell of cells) {
    const di = dateIndex.get(cell.date);
    if (di === undefined) continue;
    grid[cell.hour][di] = cell.activeFollowers;
    if (cell.activeFollowers !== null && cell.activeFollowers > max) max = cell.activeFollowers;
  }
  return { dates, hours, grid, max };
}

// ---------------------------------------------------------------------------
// Supabase-touching layer — thin wrappers that fetch rows and hand them to the pure helpers above.
// ---------------------------------------------------------------------------

const DAILY_SELECT =
  "channel_id, date, video_views, video_count, followers, likes, comments, shares, total_viewers, new_viewers, source, is_complete";

function toDailyRow(row: {
  channel_id: string;
  date: string;
  video_views: number | string | null;
  video_count: number | string | null;
  followers: number | string | null;
  likes: number | string | null;
  comments: number | string | null;
  shares: number | string | null;
  total_viewers: number | string | null;
  new_viewers: number | string | null;
  source: string;
  is_complete: boolean;
}): DailyRow {
  const num = (v: number | string | null) => (v === null ? null : Number(v));
  return {
    channelId: row.channel_id,
    date: row.date,
    videoViews: num(row.video_views),
    videoCount: num(row.video_count),
    followers: num(row.followers),
    likes: num(row.likes),
    comments: num(row.comments),
    shares: num(row.shares),
    totalViewers: num(row.total_viewers),
    newViewers: num(row.new_viewers),
    source: row.source,
    isComplete: row.is_complete,
  };
}

/** Every screen's numbers come from this one query shape — `v_channel_daily`, never `data_snapshot`
 *  directly (docs/DATABASE_ERD.md "Chọn nguồn"). */
export async function fetchDailyRows(
  supabase: SupabaseServerClient,
  channelIds: string[],
  from: string,
  to: string,
): Promise<DailyRow[]> {
  if (channelIds.length === 0) return [];
  const { data, error } = await supabase
    .from("v_channel_daily")
    .select(DAILY_SELECT)
    .in("channel_id", channelIds)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toDailyRow);
}

/** `videosTrongKỳ` per CLAUDE.md: COUNT(content_video.posted_at in period), never a `video_count`
 *  difference (a deleted video would skew that). Bounds are VN calendar days converted to the
 *  timestamptz range Postgres compares against, matching lib/time.ts's `vnMidnightIso`. */
export async function countVideosPosted(
  supabase: SupabaseServerClient,
  channelIds: string[],
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (channelIds.length === 0) return counts;

  const { data, error } = await supabase
    .from("content_video")
    .select("channel_id, posted_at")
    .in("channel_id", channelIds)
    .not("posted_at", "is", null)
    .gte("posted_at", vnMidnightIso(from))
    .lt("posted_at", vnMidnightIso(addDaysToDateString(to, 1)));
  if (error) throw error;

  for (const row of data ?? []) {
    counts.set(row.channel_id, (counts.get(row.channel_id) ?? 0) + 1);
  }
  return counts;
}

/** Same rows as `countVideosPosted`, resolved to VN calendar-date strings instead of counted — feeds
 *  `bucketWeeklyVideoCounts` for the trend chart's "Video" series. */
export async function fetchPostedVnDates(
  supabase: SupabaseServerClient,
  channelIds: string[],
  from: string,
  to: string,
): Promise<string[]> {
  if (channelIds.length === 0) return [];

  const { data, error } = await supabase
    .from("content_video")
    .select("posted_at")
    .in("channel_id", channelIds)
    .not("posted_at", "is", null)
    .gte("posted_at", vnMidnightIso(from))
    .lt("posted_at", vnMidnightIso(addDaysToDateString(to, 1)));
  if (error) throw error;

  return (data ?? []).map((row) => nowVnDateString(new Date(row.posted_at as string)));
}

export type DataFreshness = {
  latestDate: string | null;
  source: string | null;
  label: "tạm tính" | "đã đối chiếu" | null;
  reconciledThrough: string | null;
};

/** The single most recent (date, source) among the given channels, plus the most recent date any
 *  of them was reconciled by Studio — "17-19/08 tạm tính · đã đối chiếu tới 16/08" in the mockups. */
export async function fetchDataFreshness(
  supabase: SupabaseServerClient,
  channelIds: string[],
): Promise<DataFreshness> {
  const empty: DataFreshness = { latestDate: null, source: null, label: null, reconciledThrough: null };
  if (channelIds.length === 0) return empty;

  const [latestResult, reconciledResult] = await Promise.all([
    supabase
      .from("v_channel_daily")
      .select("date, source")
      .in("channel_id", channelIds)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("data_snapshot")
      .select("date")
      .in("channel_id", channelIds)
      .eq("source", "studio_import")
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (latestResult.error) throw latestResult.error;
  if (reconciledResult.error) throw reconciledResult.error;

  const latest = latestResult.data;
  if (!latest) return empty;

  const reconciledThrough = reconciledResult.data?.date ?? null;
  const isReconciled = latest.source === "studio_import";
  return {
    latestDate: latest.date,
    source: latest.source,
    label: isReconciled ? "đã đối chiếu" : "tạm tính",
    reconciledThrough,
  };
}

export type ChannelVideo = {
  id: string;
  videoLink: string;
  title: string | null;
  hashtags: string[];
  postedAt: string | null;
  /** Latest known cumulative view count (from the most recent `video_snapshot` row), or `null` if
   *  this video has never been synced by either M3a's Content.csv import or M3b's Display API. */
  latestViews: number | null;
};

/** One channel's known videos + their latest view count — the shared source for both "Video gần
 *  đây" (Chi tiết kênh) and the hashtag-effectiveness table (`aggregateHashtagStats` on the result),
 *  so they can never disagree about what a video's current view count is. */
export async function fetchChannelVideos(
  supabase: SupabaseServerClient,
  channelId: string,
): Promise<ChannelVideo[]> {
  const { data: videos, error } = await supabase
    .from("content_video")
    .select("id, video_link, title, hashtags, posted_at")
    .eq("channel_id", channelId)
    .order("posted_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  if (!videos || videos.length === 0) return [];

  const videoIds = videos.map((v) => v.id as string);
  const { data: snapshots, error: snapshotError } = await supabase
    .from("video_snapshot")
    .select("content_video_id, date, view_count")
    .in("content_video_id", videoIds)
    .order("date", { ascending: false });
  if (snapshotError) throw snapshotError;

  const latestViewByVideo = new Map<string, number>();
  for (const row of snapshots ?? []) {
    const id = row.content_video_id as string;
    if (latestViewByVideo.has(id)) continue; // sorted desc — first hit per video is the latest
    latestViewByVideo.set(id, row.view_count !== null ? Number(row.view_count) : 0);
  }

  return videos.map((v) => ({
    id: v.id as string,
    videoLink: v.video_link as string,
    title: v.title as string | null,
    hashtags: (v.hashtags as string[]) ?? [],
    postedAt: v.posted_at as string | null,
    latestViews: latestViewByVideo.get(v.id as string) ?? null,
  }));
}

export async function fetchActivityHeatmap(
  supabase: SupabaseServerClient,
  channelId: string,
): Promise<ActivityHeatmap> {
  const { data, error } = await supabase
    .from("follower_activity")
    .select("date, hour, active_followers")
    .eq("channel_id", channelId);
  if (error) throw error;

  return buildActivityHeatmap(
    (data ?? []).map((r) => ({ date: r.date, hour: r.hour, activeFollowers: r.active_followers })),
  );
}

// ---------------------------------------------------------------------------
// Per-channel period stats — the one query shared by Tổng quan (team rollup), Kênh (table rows +
// sparkline), Chi tiết kênh (single channel), and Creator (grouped by creator). Carries both the raw
// current/previous sums (so a caller can re-aggregate across channels for a team total) and the
// derived per-channel numbers (so a caller showing one row doesn't have to redo that math).
// ---------------------------------------------------------------------------

export type ChannelPeriodStat = {
  channelId: string;
  views: number;
  previousViews: number;
  viewsDeltaPct: number | null;
  videos: number;
  previousVideos: number;
  viewsPerVideo: number | null;
  likes: number;
  comments: number;
  shares: number;
  previousLikes: number;
  previousComments: number;
  previousShares: number;
  engagementRate: number | null;
  engagementRateDeltaPct: number | null;
  followersNow: number | null;
  followersBefore: number | null;
  followersGain: number | null;
  followersRatePct: number | null;
  /** Daily views within the current period, ascending — sparkline / per-channel trend input. */
  spark: { date: string; views: number }[];
};

export async function getChannelPeriodStats(
  supabase: SupabaseServerClient,
  params: { channelIds: string[]; from: string; to: string; comparedFrom: string; comparedTo: string },
): Promise<Map<string, ChannelPeriodStat>> {
  const { channelIds, from, to, comparedFrom, comparedTo } = params;
  const result = new Map<string, ChannelPeriodStat>();
  if (channelIds.length === 0) return result;

  const [allRows, videosCurrent, videosPrevious] = await Promise.all([
    fetchDailyRows(supabase, channelIds, comparedFrom, to),
    countVideosPosted(supabase, channelIds, from, to),
    countVideosPosted(supabase, channelIds, comparedFrom, comparedTo),
  ]);

  const byChannel = groupByChannel(allRows);

  for (const channelId of channelIds) {
    const rows = byChannel.get(channelId) ?? [];
    const currentRows = rows.filter((r) => r.date >= from && r.date <= to);
    const previousRows = rows.filter((r) => r.date >= comparedFrom && r.date <= comparedTo);

    const views = sumViews(currentRows);
    const previousViews = sumViews(previousRows);
    const videos = videosCurrent.get(channelId) ?? 0;
    const previousVideos = videosPrevious.get(channelId) ?? 0;
    const { likes, comments, shares } = sumEngagementParts(currentRows);
    const { likes: previousLikes, comments: previousComments, shares: previousShares } =
      sumEngagementParts(previousRows);

    const currentEngagement = engagementRate(currentRows);
    const previousEngagement = engagementRate(previousRows);

    // A gap day (no row synced) must not read as "dropped to zero" — fall back to the previous
    // period's last known value so a currently-empty tail (today-anchored windows, M4 decision
    // 2026-08-21) doesn't make a channel with real history look like it has none.
    const followersNow = latestFollowers(currentRows) ?? latestFollowers(previousRows);
    const followersBefore = latestFollowers(previousRows);
    const followersGain =
      followersNow !== null && followersBefore !== null ? followersNow - followersBefore : null;

    result.set(channelId, {
      channelId,
      views,
      previousViews,
      viewsDeltaPct: pctChange(views, previousViews),
      videos,
      previousVideos,
      viewsPerVideo: videos > 0 ? Math.round(views / videos) : null,
      likes,
      comments,
      shares,
      previousLikes,
      previousComments,
      previousShares,
      engagementRate: currentEngagement,
      engagementRateDeltaPct:
        currentEngagement !== null && previousEngagement !== null
          ? pctChange(currentEngagement, previousEngagement)
          : null,
      followersNow,
      followersBefore,
      followersGain,
      followersRatePct:
        followersGain !== null && followersBefore ? Math.round((followersGain / followersBefore) * 1000) / 10 : null,
      spark: currentRows.map((r) => ({ date: r.date, views: r.videoViews ?? 0 })),
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// GET /api/dashboard — docs/API_SPEC.md. Same shape for both roles; `myChannels` is the only
// role-branch (creator-only), per docs/USER_FLOW.md "teamStats/trend/growth/viewShare/efficiency:
// Có (giống hệt)".
// ---------------------------------------------------------------------------

export type DashboardRole = "manager" | "creator";

export type DashboardResponse = {
  role: DashboardRole;
  /** Active channels included in every number below — not in docs/API_SPEC.md's original example,
   *  added so the UI's "N kênh" header doesn't have to infer a count from a slice like `growth`
   *  (top 5) or `viewShare` (top 6). */
  channelCount: number;
  period: { from: string; to: string; comparedTo: string };
  teamStats: {
    views: { value: number; deltaPct: number | null };
    followers: { value: number; deltaAbs: number };
    videos: { value: number; deltaPct: number | null };
    viewsPerVideo: { value: number; deltaPct: number | null };
    engagementRate: { value: number | null; deltaPct: number | null };
  };
  dataFreshness: DataFreshness;
  /** Deviates from docs/API_SPEC.md's original `{ metric, series }` (one series at a time) — the
   *  mockups' trend chart has a Lượt xem/Follower/Video tab-switcher, so all three are computed
   *  server-side instead of adding a `?metric=` param the client would have to refetch on every
   *  tab click. docs/API_SPEC.md updated to match (M4). */
  trend: { granularity: "week"; views: TrendPoint[]; followers: TrendPoint[]; videos: TrendPoint[] };
  growth: { channelId: string; channelName: string; followers: number; gain: number; ratePct: number | null }[];
  viewShare: { channelId: string; channelName: string; views: number; sharePct: number }[];
  efficiency: { channelId: string; channelName: string; videos: number; viewsPerVideo: number }[];
  /** Always zero right now — M5 hasn't created any `kpi_cycle` row yet (docs/TASKS.md). The health
   *  math (progress vs. elapsedPct → green/yellow/red) is itself M5 scope; wiring it up here too
   *  would be building against a table nothing has written to. */
  kpiSummary: {
    onTrack: number;
    atRisk: number;
    behind: number;
    attention: { channelId: string; channelName: string; reason: string }[];
  };
  /** Non-null only for `role: "creator"`. `hasActiveKpi` is a documented M4 addition (see
   *  docs/API_SPEC.md) — the original shape assumed a cycle always exists; today none do. */
  myChannels:
    | {
        channelId: string;
        channelName: string;
        handle: string;
        followers: number | null;
        overallStatus: "green" | "yellow" | "red" | null;
        metrics: { name: string; pct: number; text: string; hint: string }[];
        hasActiveKpi: boolean;
      }[]
    | null;
};

export async function getDashboard(
  supabase: SupabaseServerClient,
  params: { role: DashboardRole; userId: string; from: string; to: string; creatorId?: string | null },
): Promise<DashboardResponse> {
  const { role, userId, from, to, creatorId } = params;
  const { comparedFrom, comparedTo } = previousPeriod(from, to);
  const trendFrom = isoWeekStart(addDaysToDateString(to, -55)); // ~8 full ISO weeks, snapped to Monday

  let channelsQuery = supabase
    .from("channel")
    .select("id, name, tiktok_handle, current_creator_id")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (creatorId) channelsQuery = channelsQuery.eq("current_creator_id", creatorId);
  const { data: channels, error: channelsError } = await channelsQuery;
  if (channelsError) throw channelsError;

  const activeChannels = channels ?? [];
  const channelIds = activeChannels.map((c) => c.id);
  const nameById = new Map(activeChannels.map((c) => [c.id, c.name]));

  const [periodStats, trendRows, trendPostedDates, freshness] = await Promise.all([
    getChannelPeriodStats(supabase, { channelIds, from, to, comparedFrom, comparedTo }),
    fetchDailyRows(supabase, channelIds, trendFrom, to),
    fetchPostedVnDates(supabase, channelIds, trendFrom, to),
    fetchDataFreshness(supabase, channelIds),
  ]);

  const stats = [...periodStats.values()];
  const sum = (pick: (s: ChannelPeriodStat) => number) => stats.reduce((acc, s) => acc + pick(s), 0);

  const teamViews = sum((s) => s.views);
  const teamPreviousViews = sum((s) => s.previousViews);
  const teamVideos = sum((s) => s.videos);
  const teamPreviousVideos = sum((s) => s.previousVideos);
  // Engagement rate is (likes+comments+shares)/views over the SUMMED period, not an average of
  // each channel's own rate — a big channel's rate must outweigh a small channel's the same way it
  // does in lib/channels.ts's toChannelStats for a single day.
  const teamEngagementNumerator = sum((s) => s.likes) + sum((s) => s.comments) + sum((s) => s.shares);
  const teamPreviousEngagementNumerator =
    sum((s) => s.previousLikes) + sum((s) => s.previousComments) + sum((s) => s.previousShares);
  const teamViewsPerVideo = teamVideos > 0 ? Math.round(teamViews / teamVideos) : 0;
  const teamPreviousViewsPerVideo = teamPreviousVideos > 0 ? teamPreviousViews / teamPreviousVideos : 0;
  const teamEngagement = teamViews > 0 ? teamEngagementNumerator / teamViews : null;
  const teamPreviousEngagement = teamPreviousViews > 0 ? teamPreviousEngagementNumerator / teamPreviousViews : null;
  const teamFollowersNow = sum((s) => s.followersNow ?? 0);
  const teamFollowersGain = sum((s) => s.followersGain ?? 0);

  const growth = stats
    .filter((s) => s.followersNow !== null)
    .map((s) => ({
      channelId: s.channelId,
      channelName: nameById.get(s.channelId) ?? "",
      followers: s.followersNow ?? 0,
      gain: s.followersGain ?? 0,
      ratePct: s.followersRatePct,
    }))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 5);

  const viewShare = stats
    .map((s) => ({
      channelId: s.channelId,
      channelName: nameById.get(s.channelId) ?? "",
      views: s.views,
      sharePct: teamViews > 0 ? Math.round((s.views / teamViews) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 6);

  const efficiency = stats
    .filter((s) => s.videos > 0)
    .map((s) => ({
      channelId: s.channelId,
      channelName: nameById.get(s.channelId) ?? "",
      videos: s.videos,
      viewsPerVideo: s.viewsPerVideo ?? 0,
    }))
    .sort((a, b) => b.viewsPerVideo - a.viewsPerVideo)
    .slice(0, 5);

  const myChannels =
    role === "creator"
      ? activeChannels
          .filter((c) => c.current_creator_id === userId)
          .map((c) => ({
            channelId: c.id,
            channelName: c.name,
            handle: c.tiktok_handle,
            followers: periodStats.get(c.id)?.followersNow ?? null,
            overallStatus: null,
            metrics: [],
            hasActiveKpi: false,
          }))
      : null;

  return {
    role,
    channelCount: activeChannels.length,
    period: { from, to, comparedTo: `${comparedFrom}/${comparedTo}` },
    teamStats: {
      views: { value: teamViews, deltaPct: pctChange(teamViews, teamPreviousViews) },
      followers: { value: teamFollowersNow, deltaAbs: teamFollowersGain },
      videos: { value: teamVideos, deltaPct: pctChange(teamVideos, teamPreviousVideos) },
      viewsPerVideo: { value: teamViewsPerVideo, deltaPct: pctChange(teamViewsPerVideo, teamPreviousViewsPerVideo) },
      engagementRate: {
        value: teamEngagement,
        deltaPct:
          teamEngagement !== null && teamPreviousEngagement !== null
            ? pctChange(teamEngagement, teamPreviousEngagement)
            : null,
      },
    },
    dataFreshness: freshness,
    trend: {
      granularity: "week",
      views: bucketWeeklyViews(trendRows).slice(-8),
      followers: bucketWeeklyLastFollowers(trendRows).slice(-8),
      videos: bucketWeeklyVideoCounts(trendPostedDates).slice(-8),
    },
    growth,
    viewShare,
    efficiency,
    kpiSummary: { onTrack: 0, atRisk: 0, behind: 0, attention: [] },
    myChannels,
  };
}
