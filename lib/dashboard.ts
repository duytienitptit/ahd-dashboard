import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { ALL_TIME_FROM, addDaysToDateString, daysBetweenDateStrings, nowVnDateString, vnMidnightIso } from "@/lib/time";

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

/** Fraction of the comparison period's measured days the current period must also have measured
 *  before a period-over-period view % is worth showing. */
const VIEWS_DELTA_MIN_COVERAGE_RATIO = 0.7;

/**
 * Whether a "so với kỳ trước" view % is trustworthy, given how many COMPLETE measured view-days
 * each side actually has (`isComplete` rows only — a truncated/rate-limited read is excluded from
 * the view sums too, same rule lib/kpi.ts applies: "không dùng snapshot đó tính KPI").
 *
 * A today-anchored window structurally trails its comparison window by a day or two — today isn't
 * synced until ~23:30 and Studio reconciliation runs 2+ days behind (CLAUDE.md) — so a small
 * shortfall is normal and still comparable. This only rejects the case where the current period is
 * so sparse next to the one it's compared against that a raw sum-vs-sum % is really just measuring
 * the missing days (the "−95% vì kỳ này mới có 1/7 ngày có số" bug, 27/08/2026). When it returns
 * false, callers null out `viewsDeltaPct` and set `viewsDeltaInsufficientData` so the UI shows "—"
 * with a "chưa đủ dữ liệu trong kỳ" note instead of a scary bogus drop.
 *
 * Only meaningful when the comparison period itself has data (`previousMeasuredDays >= 1`); callers
 * already keep `viewsDeltaPct = null` (the plain "no prior data" case) when it doesn't.
 */
export function viewsDeltaComparable(currentMeasuredDays: number, previousMeasuredDays: number): boolean {
  if (previousMeasuredDays <= 0) return false;
  return currentMeasuredDays >= Math.ceil(previousMeasuredDays * VIEWS_DELTA_MIN_COVERAGE_RATIO);
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

/** `null` when not one row in `rows` has a known `videoViews` — an honest "chưa có số đo", not a
 *  bogus 0 (same principle CLAUDE.md applies to CSV `"undefined"`: never silently become 0). A
 *  period where SOME days are known still sums those and ignores the unknown ones. */
export function sumViews(rows: DailyRow[]): number | null {
  const known = rows.filter((r) => r.videoViews !== null);
  if (known.length === 0) return null;
  return known.reduce((sum, r) => sum + r.videoViews!, 0);
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
  if (views === null || views <= 0) return null;
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

/** Priority order a single day's `source` is picked by when multiple channels disagree — same order
 *  as `v_channel_daily`'s `source_rank()` (docs/DATABASE_ERD.md) and CLAUDE.md's
 *  "studio_import > business_api > display_api > vendor_scraping > manual_entry". Index = strength,
 *  lower is stronger. An unrecognized value sorts as weakest rather than throwing — defensive only,
 *  every real row's `source` is one of these five. */
const SOURCE_PRIORITY = ["studio_import", "business_api", "display_api", "vendor_scraping", "manual_entry"];
function sourceRank(source: string): number {
  const rank = SOURCE_PRIORITY.indexOf(source);
  return rank === -1 ? SOURCE_PRIORITY.length : rank;
}

/**
 * Merges one or more channels' `DailyRow`s into a single row per date — the Nhân sự detail page's
 * `DailyTable` shows one Creator's whole channel set as one timeline, not N side-by-side tables.
 * `channelCount` is the number of channels the caller expects a complete day to have data from (not
 * derived from `rows` itself — a day where every channel is silently missing wouldn't appear in
 * `rows` at all, so counting distinct channelIds present per day would never catch that case).
 *
 * Sums follow the same null-vs-0 rule as `sumViews`: a metric is `null` for a date only when NOT ONE
 * of that day's channel rows has a known value for it — never a bogus 0 standing in for "chưa có số
 *  đo". `source` takes the WEAKEST source among that day's rows (CLAUDE.md priority order) — a merged
 * day is only as trustworthy as its worst-covered channel. `isComplete` requires both every
 * contributing row to itself be complete AND every expected channel to have contributed a row that
 * day (a channel silently absent — e.g. rate-limited out of the sync — must not read as "đầy đủ").
 */
export function mergeDailyRowsByDate(rows: DailyRow[], channelCount: number): DailyRow[] {
  type Acc = {
    date: string;
    channelsPresent: number;
    videoViews: number | null;
    videoCount: number | null;
    followers: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    totalViewers: number | null;
    newViewers: number | null;
    weakestSource: string;
    isComplete: boolean;
  };

  const byDate = new Map<string, Acc>();
  const addNullable = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));

  for (const row of rows) {
    const existing = byDate.get(row.date);
    const acc: Acc = existing ?? {
      date: row.date,
      channelsPresent: 0,
      videoViews: null,
      videoCount: null,
      followers: null,
      likes: null,
      comments: null,
      shares: null,
      totalViewers: null,
      newViewers: null,
      weakestSource: row.source,
      isComplete: true,
    };

    acc.channelsPresent += 1;
    acc.videoViews = addNullable(acc.videoViews, row.videoViews);
    acc.videoCount = addNullable(acc.videoCount, row.videoCount);
    acc.followers = addNullable(acc.followers, row.followers);
    acc.likes = addNullable(acc.likes, row.likes);
    acc.comments = addNullable(acc.comments, row.comments);
    acc.shares = addNullable(acc.shares, row.shares);
    acc.totalViewers = addNullable(acc.totalViewers, row.totalViewers);
    acc.newViewers = addNullable(acc.newViewers, row.newViewers);
    if (sourceRank(row.source) > sourceRank(acc.weakestSource)) acc.weakestSource = row.source;
    acc.isComplete = acc.isComplete && row.isComplete;

    byDate.set(row.date, acc);
  }

  return [...byDate.values()]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((acc) => ({
      channelId: "merged",
      date: acc.date,
      videoViews: acc.videoViews,
      videoCount: acc.videoCount,
      followers: acc.followers,
      likes: acc.likes,
      comments: acc.comments,
      shares: acc.shares,
      totalViewers: acc.totalViewers,
      newViewers: acc.newViewers,
      source: acc.weakestSource,
      isComplete: acc.isComplete && acc.channelsPresent === channelCount,
    }));
}

/** `value: null` = not one day this week has a known videoViews — the chart must render this as a
 *  gap, never as a plotted 0 (a flat "0 views for 5 weeks" line reads as a real crash, not as
 *  "chưa có số đo"). */
export type TrendPoint = { label: string; value: number | null };

/** `YYYY-MM` of a VN calendar-date string — the month bucket key. Pure string slicing, same "no
 *  timezone conversion" rule as `isoWeekStart` (the input is already a VN date string). */
function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** "Th7", "Th8" — month label for the trend chart's tuần/tháng toggle (docs/TASKS.md Đợt 2 #2). */
function monthLabel(dateStr: string): string {
  return `Th${Number(dateStr.slice(5, 7))}`;
}

/** Shared core of `bucketWeeklyViews`/`bucketMonthlyViews` — the only difference between "theo
 *  tuần" and "theo tháng" is which (key, label) function buckets a date into, so this is
 *  parameterized rather than duplicated. */
function bucketViewsBy(rows: DailyRow[], keyOf: (date: string) => string, labelOf: (date: string) => string): TrendPoint[] {
  const byBucket = new Map<string, { label: string; value: number; hasData: boolean }>();
  for (const row of rows) {
    const key = keyOf(row.date);
    const entry = byBucket.get(key) ?? { label: labelOf(row.date), value: 0, hasData: false };
    if (row.videoViews !== null) {
      entry.value += row.videoViews;
      entry.hasData = true;
    }
    byBucket.set(key, entry);
  }
  return [...byBucket.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, e]) => ({ label: e.label, value: e.hasData ? e.value : null }));
}

/** Buckets rows (any number of channels, already date-filtered by the caller) into ISO-week sums
 *  of `videoViews` — the "Xu hướng toàn team" / "Diễn biến của kênh" chart series. */
export function bucketWeeklyViews(rows: DailyRow[]): TrendPoint[] {
  return bucketViewsBy(rows, isoWeekStart, isoWeekLabel);
}

/** Same as `bucketWeeklyViews`, bucketed by calendar month instead — so sánh tháng 7 với tháng 8. */
export function bucketMonthlyViews(rows: DailyRow[]): TrendPoint[] {
  return bucketViewsBy(rows, monthKey, monthLabel);
}

/** Shared core of `bucketWeeklyLastFollowers`/`bucketMonthlyLastFollowers`. Followers is a stock,
 *  not a flow — each bucket's point is the SUM, across channels, of each channel's own last known
 *  value in that bucket. Must resolve "last known" per channel before summing: taking the last row
 *  in date order across the whole (possibly multi-channel) input would just pick whichever channel's
 *  row happens to sort last, not the team total. Buckets where a channel has no synced row
 *  contribute nothing for that channel, not a zero. */
function bucketLastFollowersBy(rows: DailyRow[], keyOf: (date: string) => string, labelOf: (date: string) => string): TrendPoint[] {
  const sumByBucket = new Map<string, number>();

  for (const channelRows of groupByChannel(rows).values()) {
    const lastByBucket = new Map<string, { asOfDate: string; followers: number }>();
    for (const row of channelRows) {
      if (row.followers === null) continue;
      const key = keyOf(row.date);
      const existing = lastByBucket.get(key);
      if (!existing || row.date >= existing.asOfDate) {
        lastByBucket.set(key, { asOfDate: row.date, followers: row.followers });
      }
    }
    for (const [bucket, { followers }] of lastByBucket) {
      sumByBucket.set(bucket, (sumByBucket.get(bucket) ?? 0) + followers);
    }
  }

  return [...sumByBucket.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([bucket, value]) => ({ label: labelOf(bucket), value }));
}

export function bucketWeeklyLastFollowers(rows: DailyRow[]): TrendPoint[] {
  return bucketLastFollowersBy(rows, isoWeekStart, isoWeekLabel);
}

/** `labelOf` receives the bucket KEY here (already `YYYY-MM` for months, or a week's Monday date for
 *  weeks) — `monthLabel`/`isoWeekLabel` both accept any date string within the bucket, so passing the
 *  key itself (not an original row date) still resolves to the right label either way. */
export function bucketMonthlyLastFollowers(rows: DailyRow[]): TrendPoint[] {
  return bucketLastFollowersBy(rows, monthKey, monthLabel);
}

/** Shared core of `bucketWeeklyVideoCounts`/`bucketMonthlyVideoCounts`. A post either happened in a
 *  bucket or didn't — always a fully-known count, never "no measurement" — so this accumulator
 *  (unlike the views one) stays plain `number`, not tracking a `hasData` flag. */
function bucketVideoCountsBy(postedDates: string[], keyOf: (date: string) => string, labelOf: (date: string) => string): TrendPoint[] {
  const byBucket = new Map<string, { label: string; value: number }>();
  for (const date of postedDates) {
    const key = keyOf(date);
    const entry = byBucket.get(key) ?? { label: labelOf(date), value: 0 };
    entry.value += 1;
    byBucket.set(key, entry);
  }
  return [...byBucket.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, point]) => point);
}

/** One point per posted video, already resolved to a VN calendar-date string
 *  (`nowVnDateString(new Date(video.posted_at))` at the call site) — counts videos per ISO week. */
export function bucketWeeklyVideoCounts(postedDates: string[]): TrendPoint[] {
  return bucketVideoCountsBy(postedDates, isoWeekStart, isoWeekLabel);
}

export function bucketMonthlyVideoCounts(postedDates: string[]): TrendPoint[] {
  return bucketVideoCountsBy(postedDates, monthKey, monthLabel);
}

export type CreatorRank = "leader" | "growth" | "attention" | "stable";

/** Data-driven Creator-card badge — CLAUDE.md: "đừng lấy % KPI làm trục sắp xếp mặc định", so this
 *  ranks by view share and trend instead of a KPI cycle nothing has created yet.
 *  "leader": the single highest total-views creator, only when there's at least one OTHER creator
 *  with channels to actually be ahead of — "dẫn đầu" among a field of one is a badge with nothing
 *  behind it (bug caught 21/08/2026 dùng thử: a lone active Creator always got "Dẫn đầu view").
 *  "growth" / "attention": ±10-point average view-trend threshold, same as the health-color rule in
 *  docs/DESIGN_SYSTEM.md (`pct >= 70 cyan / >= 45 amber / < 45 red`) adapted to a delta instead of a
 *  percent-of-target. "stable" (no badge) otherwise, including creators with zero channels. */
export function rankCreatorPerformance(
  creators: { creatorId: string; totalViews: number; avgViewsDeltaPct: number | null; channelCount: number }[],
): Map<string, CreatorRank> {
  const ranked = new Map<string, CreatorRank>();
  const withChannels = creators.filter((c) => c.channelCount > 0);
  if (withChannels.length === 0) return ranked;

  const leader = withChannels.length >= 2 ? withChannels.reduce((best, c) => (c.totalViews > best.totalViews ? c : best)) : null;

  for (const c of withChannels) {
    if (leader && c.creatorId === leader.creatorId && leader.totalViews > 0) {
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

/** One query, shared by `countVideosPosted` (per-channel count) and `fetchPostedVnDates` (flat VN
 *  date list) below, and reused directly by M5's `lib/kpi.ts` (`attachProgress`) — 3 separate copies
 *  of the same `content_video` query would otherwise exist. Bounds are VN calendar days converted to
 *  the timestamptz range Postgres compares against, matching lib/time.ts's `vnMidnightIso`. */
export async function fetchPostedVnDatesByChannel(
  supabase: SupabaseServerClient,
  channelIds: string[],
  from: string,
  to: string,
): Promise<Map<string, string[]>> {
  const byChannel = new Map<string, string[]>();
  if (channelIds.length === 0) return byChannel;

  const { data, error } = await supabase
    .from("content_video")
    .select("channel_id, posted_at")
    .in("channel_id", channelIds)
    .not("posted_at", "is", null)
    .gte("posted_at", vnMidnightIso(from))
    .lt("posted_at", vnMidnightIso(addDaysToDateString(to, 1)));
  if (error) throw error;

  for (const row of data ?? []) {
    const date = nowVnDateString(new Date(row.posted_at as string));
    const list = byChannel.get(row.channel_id);
    if (list) list.push(date);
    else byChannel.set(row.channel_id, [date]);
  }
  return byChannel;
}

/** `videosTrongKỳ` per CLAUDE.md: COUNT(content_video.posted_at in period), never a `video_count`
 *  difference (a deleted video would skew that). */
export async function countVideosPosted(
  supabase: SupabaseServerClient,
  channelIds: string[],
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const byChannel = await fetchPostedVnDatesByChannel(supabase, channelIds, from, to);
  const counts = new Map<string, number>();
  for (const [channelId, dates] of byChannel) counts.set(channelId, dates.length);
  return counts;
}

/** Same rows as `countVideosPosted`, flattened across channels instead of counted per-channel —
 *  feeds `bucketWeeklyVideoCounts` for the trend chart's "Video" series. */
export async function fetchPostedVnDates(
  supabase: SupabaseServerClient,
  channelIds: string[],
  from: string,
  to: string,
): Promise<string[]> {
  const byChannel = await fetchPostedVnDatesByChannel(supabase, channelIds, from, to);
  return [...byChannel.values()].flat();
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

/**
 * PostgREST/undici cap total request headers around 16KB — a `.in("content_video_id", videoIds)`
 * built from hundreds of UUIDs (each ~37 chars once comma-joined) can exceed that on a channel set
 * with many videos, failing the whole request with a hard-to-diagnose `HeadersOverflowError`
 * (discovered 25/08/2026 loading `/channels` against real production data, once video counts grew
 * past the threshold — this query predates M5, not something introduced by it). Splits the id list
 * into chunks and runs the same query per chunk in parallel instead of one unbounded IN clause.
 */
function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

const VIDEO_SNAPSHOT_IN_BATCH_SIZE = 150;

export type LatestVideoMetrics = { views: number; likes: number };

/** Every channel's total of its videos' most recently known view/like count — a current snapshot
 *  total like `followersNow`, not a period sum (per-video `view_count`/`like_count` are both
 *  cumulative-lifetime — docs/DATABASE_ERD.md). Same latest-per-video dedup as `fetchChannelVideos`,
 *  just grouped by channel and done for every channel in one pass instead of listed for one.
 *
 *  Two unrelated-looking callers share this because they're the same query shape:
 *  - `likes`: "Tổng số like" at every granularity in the app — one channel, one Creator's channels,
 *    one Team's channels, or the whole company (22/08/2026: replaced engagement rate everywhere,
 *    theo yêu cầu).
 *  - `views`: fallback for `getChannelPeriodStats`'s `views` field specifically when the period is
 *    "Toàn bộ thời gian" (`ALL_TIME_FROM`) — at that one period, "view trong kỳ" and "tổng view luỹ
 *    kế" are the same number by definition, and this is more robust than summing
 *    `data_snapshot.video_views` deltas day-by-day: it doesn't depend on every day since
 *    `ALL_TIME_FROM` having an unbroken `data_snapshot` row (which isn't true right now — a channel's
 *    older rows were deleted alongside other cleanup, 22/08/2026). CLAUDE.md's "view trong kỳ phải
 *    suy ra bằng chênh lệch theo từng video" rule is about SHORTER periods (7/14/30 ngày, tuỳ chỉnh)
 *    — summing raw cumulative `view_count` there would massively overcount (docs/DISPLAY_API.md bẫy
 *    #10's ~10x real example), so this fallback is deliberately gated to the one period where it's
 *    exact, not a general replacement for the delta computation.
 *
 *  Channels with no videos yet still get a `{views: 0, likes: 0}` entry, never a missing key —
 *  callers can `.get(id)` without a special case. */
export async function fetchLatestVideoMetricsByChannel(
  supabase: SupabaseServerClient,
  channelIds: string[],
): Promise<Map<string, LatestVideoMetrics>> {
  const totals = new Map<string, LatestVideoMetrics>(channelIds.map((id) => [id, { views: 0, likes: 0 }]));
  if (channelIds.length === 0) return totals;

  const { data: videos, error: videosError } = await supabase
    .from("content_video")
    .select("id, channel_id")
    .in("channel_id", channelIds);
  if (videosError) throw videosError;
  if (!videos || videos.length === 0) return totals;

  const channelByVideo = new Map(videos.map((v) => [v.id as string, v.channel_id as string]));
  const videoIds = [...channelByVideo.keys()];

  const snapshotBatches = await Promise.all(
    chunkArray(videoIds, VIDEO_SNAPSHOT_IN_BATCH_SIZE).map(async (batch) => {
      const { data, error } = await supabase
        .from("video_snapshot")
        .select("content_video_id, date, view_count, like_count")
        .in("content_video_id", batch)
        .order("date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    }),
  );
  const snapshots = snapshotBatches.flat();

  const seen = new Set<string>();
  for (const row of snapshots ?? []) {
    const videoId = row.content_video_id as string;
    if (seen.has(videoId)) continue; // sorted desc — first hit per video is the latest
    seen.add(videoId);
    const channelId = channelByVideo.get(videoId);
    if (!channelId) continue;
    const entry = totals.get(channelId) ?? { views: 0, likes: 0 };
    entry.views += row.view_count !== null ? Number(row.view_count) : 0;
    entry.likes += row.like_count !== null ? Number(row.like_count) : 0;
    totals.set(channelId, entry);
  }
  return totals;
}

export type RecentVideoView = { postedAt: string | null; views: number };

/** Each channel's `limit` most-recently-posted videos, oldest→newest, paired with that video's
 *  latest known cumulative `view_count` — feeds the "Xu hướng" sparkline on `/channels` (24/08/2026,
 *  theo yêu cầu: đổi từ "view theo ngày trong kỳ" — vốn phẳng lì khi kỳ đang chọn ít/không có ngày
 *  đăng video mới — sang view-của-từng-video, luôn có tín hiệu miễn kênh có video). Same
 *  latest-per-video dedup as `fetchLatestVideoMetricsByChannel`. A channel with fewer than `limit`
 *  known videos just gets fewer points; `Sparkline` already renders "—" under 2. */
export async function fetchRecentVideoViewsByChannel(
  supabase: SupabaseServerClient,
  channelIds: string[],
  limit = 5,
): Promise<Map<string, RecentVideoView[]>> {
  const result = new Map<string, RecentVideoView[]>(channelIds.map((id) => [id, []]));
  if (channelIds.length === 0) return result;

  const { data: videos, error: videosError } = await supabase
    .from("content_video")
    .select("id, channel_id, posted_at")
    .in("channel_id", channelIds)
    .order("posted_at", { ascending: false, nullsFirst: false });
  if (videosError) throw videosError;
  if (!videos || videos.length === 0) return result;

  // Query is newest→oldest per channel already — cap each channel's list at `limit` as we walk it.
  const recentByChannel = new Map<string, { id: string; postedAt: string | null }[]>();
  for (const v of videos) {
    const channelId = v.channel_id as string;
    const list = recentByChannel.get(channelId) ?? [];
    if (list.length < limit) list.push({ id: v.id as string, postedAt: v.posted_at as string | null });
    recentByChannel.set(channelId, list);
  }

  const videoIds = [...recentByChannel.values()].flat().map((v) => v.id);
  if (videoIds.length === 0) return result;

  const snapshotBatches = await Promise.all(
    chunkArray(videoIds, VIDEO_SNAPSHOT_IN_BATCH_SIZE).map(async (batch) => {
      const { data, error } = await supabase
        .from("video_snapshot")
        .select("content_video_id, date, view_count")
        .in("content_video_id", batch)
        .order("date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    }),
  );
  const snapshots = snapshotBatches.flat();

  const latestViewByVideo = new Map<string, number>();
  for (const row of snapshots ?? []) {
    const videoId = row.content_video_id as string;
    if (latestViewByVideo.has(videoId)) continue; // sorted desc — first hit per video is the latest
    latestViewByVideo.set(videoId, row.view_count !== null ? Number(row.view_count) : 0);
  }

  for (const [channelId, recent] of recentByChannel) {
    // Reverse to oldest→newest — the sparkline reads left-to-right as "older video" → "newer video".
    const points = [...recent].reverse().map((v) => ({
      postedAt: v.postedAt,
      views: latestViewByVideo.get(v.id) ?? 0,
    }));
    result.set(channelId, points);
  }
  return result;
}

/** Sum of `fetchLatestVideoMetricsByChannel`'s `likes` across a set of channels — the team-wide
 *  "Tổng số like" tile on Tổng quan doesn't need the per-channel breakdown, just the total. */
export async function sumLatestVideoLikes(supabase: SupabaseServerClient, channelIds: string[]): Promise<number> {
  const byChannel = await fetchLatestVideoMetricsByChannel(supabase, channelIds);
  return [...byChannel.values()].reduce((a, m) => a + m.likes, 0);
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
  /** `null` = not one synced day this period has a known, COMPLETE videoViews (a channel that just
   *  connected with only a bootstrap sync, or a period where every day is missing / `isComplete=false`
   *  — CLAUDE.md: an incomplete snapshot isn't used to compute numbers). Render as "—", never "0 view". */
  views: number | null;
  previousViews: number | null;
  viewsDeltaPct: number | null;
  /** `true` when this period AND the comparison period both have some view data, but the current
   *  period covers materially fewer complete measured days (`viewsDeltaComparable` failed) — so
   *  `viewsDeltaPct` is null on purpose and the UI should show a "chưa đủ dữ liệu trong kỳ" note
   *  rather than a bare "—" that reads as "no history at all" (27/08/2026). */
  viewsDeltaInsufficientData: boolean;
  /** Days with a complete, known videoViews in this period / the comparison period — carried so a
   *  rollup (`aggregateChannelStats`) can re-apply `viewsDeltaComparable` across its channel set
   *  without re-fetching daily rows. */
  viewsMeasuredDays: number;
  previousViewsMeasuredDays: number;
  videos: number;
  previousVideos: number;
  viewsPerVideo: number | null;
  /** Current total of this channel's videos' latest known like count — not period-scoped (same shape
   *  as `followersNow`), so no "previous"/delta counterpart. Replaced `engagementRate` here and at
   *  every rollup built from this type (22/08/2026, theo yêu cầu) — CLAUDE.md's "engagement rate
   *  luôn hiển thị ngang hàng view/follower" rule updated to match; the underlying `engagementRate()`
   *  pure function/`data_snapshot.likes` column are untouched, just no longer surfaced by this path. */
  totalLikes: number;
  followersNow: number | null;
  followersBefore: number | null;
  followersGain: number | null;
  followersRatePct: number | null;
  /** This channel's 5 most-recently-posted videos' view counts, oldest→newest — "Xu hướng" sparkline
   *  input on `/channels` (24/08/2026, theo yêu cầu — trước đây là view theo ngày trong kỳ, xem
   *  `fetchRecentVideoViewsByChannel`). Independent of the selected date range/period. */
  spark: RecentVideoView[];
};

export type RollupStat = {
  totalViews: number;
  viewsDeltaPct: number | null;
  /** Same meaning as `ChannelPeriodStat.viewsDeltaInsufficientData`, at rollup level — the channel
   *  set's current-period view coverage is too thin next to the comparison period to trust a %. */
  viewsDeltaInsufficientData: boolean;
  /** Current follower stock summed across the channel set — pairs with `followerGain` the same way
   *  `TeamStatsRow`'s "Follower toàn team" tile shows both (value = stock, delta = gain), just at
   *  Creator/Team rollup level instead of the whole company. */
  followersNow: number;
  followerGain: number;
  /** Current total across the channel set's videos' latest known like count — see
   *  `ChannelPeriodStat.totalLikes`, same "current total, no delta" shape. */
  totalLikes: number;
  /** Added for the Nhân sự detail page's "Video đã đăng" tile — same `countVideosPosted` numbers
   *  already summed per-channel by `getChannelPeriodStats`, just carried through the rollup instead
   *  of being dropped like before. */
  videos: number;
  previousVideos: number;
};

/**
 * Sums a set of channels' `ChannelPeriodStat` rows into one rollup — same math whether the set is
 * "one Creator's channels" or "one Team's channels" (a Team is just every Creator in it, transitively
 * — CLAUDE.md, 21/08/2026), so this is the one place that math lives instead of two copies drifting
 * apart. A channel id with no entry in `statsByChannel` contributes nothing to the total (unmeasured
 * channel doesn't count against it — same rule `getDashboard`'s team-level sum uses).
 */
export function aggregateChannelStats(channelIds: string[], statsByChannel: Map<string, ChannelPeriodStat>): RollupStat {
  const channelStats = channelIds
    .map((id) => statsByChannel.get(id))
    .filter((s): s is ChannelPeriodStat => s !== undefined);
  const sum = (pick: (s: ChannelPeriodStat) => number | null) =>
    channelStats.reduce((acc, s) => acc + (pick(s) ?? 0), 0);

  const totalViews = sum((s) => s.views);
  const previousViews = sum((s) => s.previousViews);
  // Same coverage gate as per-channel (`getChannelPeriodStats`), re-applied on the channel set's
  // summed measured-day counts — a rollup % is only as trustworthy as the days behind it.
  const currentMeasuredDays = sum((s) => s.viewsMeasuredDays);
  const previousMeasuredDays = sum((s) => s.previousViewsMeasuredDays);
  const comparable = viewsDeltaComparable(currentMeasuredDays, previousMeasuredDays);

  return {
    totalViews,
    viewsDeltaPct: comparable ? pctChange(totalViews, previousViews) : null,
    viewsDeltaInsufficientData: previousMeasuredDays > 0 && !comparable,
    followersNow: sum((s) => s.followersNow),
    followerGain: sum((s) => s.followersGain),
    totalLikes: sum((s) => s.totalLikes),
    videos: sum((s) => s.videos),
    previousVideos: sum((s) => s.previousVideos),
  };
}

/** One Creator/Team member's channel, as shown in the Nhân sự detail page's "Kênh phụ trách" table —
 *  the per-channel numbers a `CreatorSummary.channels` entry doesn't carry on its own (that type is
 *  just id/name/handle; the metrics live in `ChannelPeriodStat`, keyed separately). */
export type CreatorPerformanceChannel = {
  id: string;
  name: string;
  tiktokHandle: string;
  /** `null` (render "—", not "0") when the channel has no complete view measurement this period —
   *  same rule as the `/channels` table's `views` column. */
  views: number | null;
  viewsDeltaPct: number | null;
  /** See `ChannelPeriodStat.viewsDeltaInsufficientData` — drives the "chưa đủ dữ liệu" note. */
  viewsDeltaInsufficientData: boolean;
  followersNow: number | null;
  followersGain: number | null;
  videos: number;
  totalLikes: number;
};

export type CreatorPerformance = RollupStat & { channels: CreatorPerformanceChannel[] };

/**
 * Builds each creator's rollup + per-channel breakdown in one pass — the loop `/creators` and (until
 * now) `/creators/team/[id]` each wrote inline, byte-for-byte identical apart from which `creators`
 * array they looped over. Kept here instead of a page component so `/creators` and `/creators/[id]`
 * can't drift on the math (same reasoning as `aggregateChannelStats` itself).
 */
export function buildCreatorPerformance(
  creators: { id: string; channels: { id: string; name: string; tiktokHandle: string }[] }[],
  statsByChannel: Map<string, ChannelPeriodStat>,
): Map<string, CreatorPerformance> {
  const result = new Map<string, CreatorPerformance>();
  for (const creator of creators) {
    const channelIds = creator.channels.map((ch) => ch.id);
    const rollup = aggregateChannelStats(channelIds, statsByChannel);
    result.set(creator.id, {
      ...rollup,
      channels: creator.channels.map((channel) => {
        const stat = statsByChannel.get(channel.id);
        return {
          id: channel.id,
          name: channel.name,
          tiktokHandle: channel.tiktokHandle,
          views: stat?.views ?? null,
          viewsDeltaPct: stat?.viewsDeltaPct ?? null,
          viewsDeltaInsufficientData: stat?.viewsDeltaInsufficientData ?? false,
          followersNow: stat?.followersNow ?? null,
          followersGain: stat?.followersGain ?? null,
          videos: stat?.videos ?? 0,
          totalLikes: stat?.totalLikes ?? 0,
        };
      }),
    });
  }
  return result;
}

export async function getChannelPeriodStats(
  supabase: SupabaseServerClient,
  params: { channelIds: string[]; from: string; to: string; comparedFrom: string; comparedTo: string },
): Promise<Map<string, ChannelPeriodStat>> {
  const { channelIds, from, to, comparedFrom, comparedTo } = params;
  const result = new Map<string, ChannelPeriodStat>();
  if (channelIds.length === 0) return result;

  const [allRows, videosCurrent, videosPrevious, metricsByChannel, recentVideoViews] = await Promise.all([
    fetchDailyRows(supabase, channelIds, comparedFrom, to),
    countVideosPosted(supabase, channelIds, from, to),
    countVideosPosted(supabase, channelIds, comparedFrom, comparedTo),
    fetchLatestVideoMetricsByChannel(supabase, channelIds),
    fetchRecentVideoViewsByChannel(supabase, channelIds),
  ]);

  // "Toàn bộ thời gian" is the one period where "view trong kỳ" and "tổng view luỹ kế" are the same
  // number — fall back to summing each video's current cumulative view_count (fetchLatestVideoMetrics-
  // ByChannel, above), which doesn't depend on an unbroken data_snapshot history the way the delta sum
  // below does. Any other period keeps the delta sum — see that function's doc comment for why summing
  // raw view_count there would badly overcount.
  const isAllTime = from === ALL_TIME_FROM;

  const byChannel = groupByChannel(allRows);

  for (const channelId of channelIds) {
    const rows = byChannel.get(channelId) ?? [];
    const currentRows = rows.filter((r) => r.date >= from && r.date <= to);
    const previousRows = rows.filter((r) => r.date >= comparedFrom && r.date <= comparedTo);

    // View sums count only days with a COMPLETE, known videoViews — a truncated/rate-limited read
    // (`isComplete=false`) is excluded here the same way lib/kpi.ts drops it from KPI actuals
    // (CLAUDE.md: "không dùng snapshot đó tính KPI"). The `.length`s also feed the coverage gate.
    const currentViewDays = currentRows.filter((r) => r.isComplete && r.videoViews !== null);
    const previousViewDays = previousRows.filter((r) => r.isComplete && r.videoViews !== null);

    const views = isAllTime ? (metricsByChannel.get(channelId)?.views ?? 0) : sumViews(currentViewDays);
    const previousViews = sumViews(previousViewDays);
    // "so với kỳ trước" only when both periods have view data AND the current one isn't so much
    // thinner that the % would just be measuring missing days (27/08/2026 — see viewsDeltaComparable).
    const bothMeasured = views !== null && previousViews !== null;
    const coverageComparable = bothMeasured && viewsDeltaComparable(currentViewDays.length, previousViewDays.length);
    const viewsDeltaPct = coverageComparable ? pctChange(views, previousViews) : null;
    const viewsDeltaInsufficientData = bothMeasured && !coverageComparable;
    const videos = videosCurrent.get(channelId) ?? 0;
    const previousVideos = videosPrevious.get(channelId) ?? 0;

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
      viewsDeltaPct,
      viewsDeltaInsufficientData,
      viewsMeasuredDays: currentViewDays.length,
      previousViewsMeasuredDays: previousViewDays.length,
      videos,
      previousVideos,
      viewsPerVideo: views !== null && videos > 0 ? Math.round(views / videos) : null,
      totalLikes: metricsByChannel.get(channelId)?.likes ?? 0,
      followersNow,
      followersBefore,
      followersGain,
      followersRatePct:
        followersGain !== null && followersBefore ? Math.round((followersGain / followersBefore) * 1000) / 10 : null,
      spark: recentVideoViews.get(channelId) ?? [],
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
  /** id+name of every channel counted above — added 25/08/2026 (M5) so `lib/kpi.ts`'s
   *  `buildDashboardKpiSummary()` can scope its own KPI-cycle query to the exact same
   *  role/creatorId/teamId-filtered channel set this function already resolved, without a second
   *  near-duplicate query. `lib/kpi.ts` can't import this function directly (it already imports
   *  FROM this module for `attachProgress`'s query primitives — the reverse import would be
   *  circular), so the two are composed by the caller instead; see app/(app)/page.tsx or
   *  app/api/dashboard/route.ts for the merge. */
  channels: { id: string; name: string }[];
  /** `comparedFrom`/`comparedTo` used to ship as one slash-joined string — no screen ever rendered
   *  it, so "so với kỳ trước" meant something different on every date-range/mode combination with
   *  nothing telling the viewer which days it actually was (CLAUDE.md — vấn đề #1, 21/08/2026). Two
   *  plain date fields so a caller can't forget to show them. */
  period: { from: string; to: string; comparedFrom: string; comparedTo: string };
  teamStats: {
    views: { value: number; deltaPct: number | null };
    followers: { value: number; deltaAbs: number };
    videos: { value: number; deltaPct: number | null };
    viewsPerVideo: { value: number; deltaPct: number | null };
    /** Current total of every video's latest known like count — not period-scoped, same shape as
     *  `followers`. Replaces the old `engagementRate` tile on the Tổng quan overview specifically
     *  (22/08/2026, theo yêu cầu) — engagement rate itself is unchanged everywhere else (kênh/Creator
     *  detail still show it; CLAUDE.md's "chỉ số dẫn báo duy nhất" rule still holds there). */
    totalLikes: { value: number };
  };
  dataFreshness: DataFreshness;
  /** Deviates from docs/API_SPEC.md's original `{ metric, series }` (one series at a time) — the
   *  mockups' trend chart has a Lượt xem/Follower/Video tab-switcher, so all three are computed
   *  server-side instead of adding a `?metric=` param the client would have to refetch on every
   *  tab click. docs/API_SPEC.md updated to match (M4). */
  /** Both granularities computed server-side, same reasoning as bundling all 3 metrics below — the
   *  mockups' tuần/tháng toggle (docs/TASKS.md Đợt 2 #2, "so tháng 7 với tháng 8") switches client-
   *  side with no refetch, exactly like the Lượt xem/Follower/Video metric tabs already do. */
  trend: {
    week: { views: TrendPoint[]; followers: TrendPoint[]; videos: TrendPoint[] };
    month: { views: TrendPoint[]; followers: TrendPoint[]; videos: TrendPoint[] };
  };
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
  params: {
    role: DashboardRole;
    userId: string;
    from: string;
    to: string;
    creatorId?: string | null;
    /** Filters down to channels whose current Creator belongs to this team. Team is purely an
     *  organizational grouping (CLAUDE.md, 21/08/2026) — a channel has no team_id of its own, so
     *  this always resolves through `creator.team_id`, never a stored/cached copy. */
    teamId?: string | null;
  },
): Promise<DashboardResponse> {
  const { role, userId, from, to, creatorId, teamId } = params;
  const { comparedFrom, comparedTo } = previousPeriod(from, to);
  const weekTrendFrom = isoWeekStart(addDaysToDateString(to, -55)); // ~8 full ISO weeks, snapped to Monday
  // ~6 months back — enough to compare "tháng 7 với tháng 8" (docs/TASKS.md Đợt 2 #2), same 180-day
  // window channels/[id]/page.tsx's DailyTable already uses (HISTORY_DAYS), so this superset covers
  // the week window above too — one fetch serves both granularities, not two.
  const monthTrendFrom = addDaysToDateString(to, -179);

  let channelsQuery = supabase
    .from("channel")
    .select("id, name, tiktok_handle, current_creator_id")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (creatorId) channelsQuery = channelsQuery.eq("current_creator_id", creatorId);
  if (teamId) {
    const { data: teamCreators, error: teamCreatorsError } = await supabase
      .from("creator")
      .select("id")
      .eq("team_id", teamId);
    if (teamCreatorsError) throw teamCreatorsError;
    channelsQuery = channelsQuery.in(
      "current_creator_id",
      (teamCreators ?? []).map((c) => c.id as string),
    );
  }
  const { data: channels, error: channelsError } = await channelsQuery;
  if (channelsError) throw channelsError;

  const activeChannels = channels ?? [];
  const channelIds = activeChannels.map((c) => c.id);
  const nameById = new Map(activeChannels.map((c) => [c.id, c.name]));

  const [periodStats, trendRows, trendPostedDates, freshness, totalLikes] = await Promise.all([
    getChannelPeriodStats(supabase, { channelIds, from, to, comparedFrom, comparedTo }),
    fetchDailyRows(supabase, channelIds, monthTrendFrom, to),
    fetchPostedVnDates(supabase, channelIds, monthTrendFrom, to),
    fetchDataFreshness(supabase, channelIds),
    sumLatestVideoLikes(supabase, channelIds),
  ]);
  // Week granularity is a subset of the 180-day fetch above — filtering in memory instead of a
  // second, near-duplicate query.
  const weekTrendRows = trendRows.filter((r) => r.date >= weekTrendFrom);
  const weekTrendPostedDates = trendPostedDates.filter((d) => d >= weekTrendFrom);

  const stats = [...periodStats.values()];
  // A channel with no measurement this period (views: null) contributes nothing to the team total —
  // standard rollup semantics — but stays "—" at its own row (see growth/viewShare/efficiency below,
  // which filter it out of those lists instead of silently showing it at 0%).
  const sum = (pick: (s: ChannelPeriodStat) => number | null) => stats.reduce((acc, s) => acc + (pick(s) ?? 0), 0);

  const teamViews = sum((s) => s.views);
  const teamPreviousViews = sum((s) => s.previousViews);
  const teamVideos = sum((s) => s.videos);
  const teamPreviousVideos = sum((s) => s.previousVideos);
  const teamViewsPerVideo = teamVideos > 0 ? Math.round(teamViews / teamVideos) : 0;
  const teamPreviousViewsPerVideo = teamPreviousVideos > 0 ? teamPreviousViews / teamPreviousVideos : 0;
  const teamFollowersNow = sum((s) => s.followersNow ?? 0);
  const teamFollowersGain = sum((s) => s.followersGain ?? 0);
  // Same coverage gate as per-channel: a view % (and the viewsPerVideo % derived from it) isn't
  // shown when the current period's measured view-days are too thin next to the comparison period.
  const teamViewDeltaComparable = viewsDeltaComparable(
    sum((s) => s.viewsMeasuredDays),
    sum((s) => s.previousViewsMeasuredDays),
  );

  // No `.slice()` here — every channel, not just a top-N (24/08/2026, theo yêu cầu: xem hết mọi
  // kênh, sẽ có nhiều kênh về sau). `ListCard` (dashboard-widgets.tsx) scrolls internally instead of
  // the page growing unbounded.
  const growth = stats
    .filter((s) => s.followersNow !== null)
    .map((s) => ({
      channelId: s.channelId,
      channelName: nameById.get(s.channelId) ?? "",
      followers: s.followersNow ?? 0,
      gain: s.followersGain ?? 0,
      ratePct: s.followersRatePct,
    }))
    .sort((a, b) => b.gain - a.gain);

  // Filtered like `growth` above (which already drops `followersNow === null`) — a channel with no
  // view measurement this period must not appear in a ranking at a misleading "0%"/"0 view".
  const viewShare = stats
    .filter((s) => s.views !== null)
    .map((s) => ({
      channelId: s.channelId,
      channelName: nameById.get(s.channelId) ?? "",
      views: s.views!,
      sharePct: teamViews > 0 ? Math.round((s.views! / teamViews) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.views - a.views);

  const efficiency = stats
    .filter((s) => s.videos > 0 && s.viewsPerVideo !== null)
    .map((s) => ({
      channelId: s.channelId,
      channelName: nameById.get(s.channelId) ?? "",
      videos: s.videos,
      viewsPerVideo: s.viewsPerVideo!,
    }))
    .sort((a, b) => b.viewsPerVideo - a.viewsPerVideo);

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
    channels: activeChannels.map((c) => ({ id: c.id, name: c.name })),
    period: { from, to, comparedFrom, comparedTo },
    teamStats: {
      views: { value: teamViews, deltaPct: teamViewDeltaComparable ? pctChange(teamViews, teamPreviousViews) : null },
      followers: { value: teamFollowersNow, deltaAbs: teamFollowersGain },
      videos: { value: teamVideos, deltaPct: pctChange(teamVideos, teamPreviousVideos) },
      viewsPerVideo: {
        value: teamViewsPerVideo,
        deltaPct: teamViewDeltaComparable ? pctChange(teamViewsPerVideo, teamPreviousViewsPerVideo) : null,
      },
      totalLikes: { value: totalLikes },
    },
    dataFreshness: freshness,
    trend: {
      week: {
        views: bucketWeeklyViews(weekTrendRows).slice(-8),
        followers: bucketWeeklyLastFollowers(weekTrendRows).slice(-8),
        videos: bucketWeeklyVideoCounts(weekTrendPostedDates).slice(-8),
      },
      month: {
        views: bucketMonthlyViews(trendRows).slice(-6),
        followers: bucketMonthlyLastFollowers(trendRows).slice(-6),
        videos: bucketMonthlyVideoCounts(trendPostedDates).slice(-6),
      },
    },
    growth,
    viewShare,
    efficiency,
    kpiSummary: { onTrack: 0, atRisk: 0, behind: 0, attention: [] },
    myChannels,
  };
}
