import { parseCsv, parseNullableInt } from "./csv";
import { resolveStudioDate } from "./date";

export type FollowerHistoryRow = {
  date: string;
  followers: number | null;
};

/**
 * `FollowerHistory.csv` — docs/CSV_FORMAT.md point 5. Deliberately drops the "Difference in
 * followers from previous day" column: it is off by one day (verified against real data — it is
 * actually the delta to the day AFTER, not before). `followersDiff` is computed from the
 * `followers` series instead (CLAUDE.md), never read from this column.
 */
export function parseFollowerHistoryCsv(text: string, referenceDate: string): FollowerHistoryRow[] {
  return parseCsv(text).map((row) => ({
    date: resolveStudioDate(row["Date"], referenceDate),
    followers: parseNullableInt(row["Followers"]),
  }));
}
