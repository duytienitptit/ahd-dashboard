import { parseCsv, parseNullableInt } from "./csv";
import { resolveStudioDate } from "./date";

export type FollowerActivityRow = {
  date: string;
  hour: number;
  activeFollowers: number | null;
};

/**
 * `FollowerActivity.csv` — docs/CSV_FORMAT.md. One row per hour (24/day), only the 7 most recent
 * days per export. Not subject to the settle-window filter that Overview/Followers/Viewers use —
 * see the M3a plan note: the 7-day window doesn't overlap week to week, so skipping recent days
 * here would lose them permanently instead of catching up next import.
 */
export function parseFollowerActivityCsv(text: string, referenceDate: string): FollowerActivityRow[] {
  return parseCsv(text).map((row) => ({
    date: resolveStudioDate(row["Date"], referenceDate),
    hour: Number.parseInt(row["Hour"], 10),
    activeFollowers: parseNullableInt(row["Active followers"]),
  }));
}
