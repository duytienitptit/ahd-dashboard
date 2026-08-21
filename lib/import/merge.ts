import type { OverviewRow } from "./overview";
import type { FollowerHistoryRow } from "./follower-history";
import type { ViewersRow } from "./viewers";

export type MergedDailyMetrics = {
  videoViews: number | null;
  profileViews: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  followers: number | null;
  totalViewers: number | null;
  newViewers: number | null;
  returningViewers: number | null;
};

const EMPTY: MergedDailyMetrics = {
  videoViews: null,
  profileViews: null,
  likes: null,
  comments: null,
  shares: null,
  followers: null,
  totalViewers: null,
  newViewers: null,
  returningViewers: null,
};

/**
 * Combines Overview/FollowerHistory/Viewers rows into one row per date. The three files don't
 * necessarily cover the same date range or have data on the same days (verified on real data — a
 * date can be genuinely "0" in one file and `undefined`→null in another for the same channel), so
 * this is a union over dates, not an intersection: a date present in only one file still produces a
 * row, with the other file's columns left `null`.
 */
export function mergeDailyMetrics(
  overviewRows: OverviewRow[],
  followerRows: FollowerHistoryRow[],
  viewerRows: ViewersRow[],
): Map<string, MergedDailyMetrics> {
  const byDate = new Map<string, MergedDailyMetrics>();

  const get = (date: string): MergedDailyMetrics => {
    let row = byDate.get(date);
    if (!row) {
      row = { ...EMPTY };
      byDate.set(date, row);
    }
    return row;
  };

  for (const r of overviewRows) {
    const row = get(r.date);
    row.videoViews = r.videoViews;
    row.profileViews = r.profileViews;
    row.likes = r.likes;
    row.comments = r.comments;
    row.shares = r.shares;
  }

  for (const r of followerRows) {
    get(r.date).followers = r.followers;
  }

  for (const r of viewerRows) {
    const row = get(r.date);
    row.totalViewers = r.totalViewers;
    row.newViewers = r.newViewers;
    row.returningViewers = r.returningViewers;
  }

  return byDate;
}
