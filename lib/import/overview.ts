import { parseCsv, parseNullableInt } from "./csv";
import { resolveStudioDate } from "./date";

export type OverviewRow = {
  date: string;
  videoViews: number | null;
  profileViews: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
};

/** `Overview.csv` — docs/CSV_FORMAT.md. Columns: Date, Video Views, Profile Views, Likes, Comments, Shares. */
export function parseOverviewCsv(text: string, referenceDate: string): OverviewRow[] {
  return parseCsv(text).map((row) => ({
    date: resolveStudioDate(row["Date"], referenceDate),
    videoViews: parseNullableInt(row["Video Views"]),
    profileViews: parseNullableInt(row["Profile Views"]),
    likes: parseNullableInt(row["Likes"]),
    comments: parseNullableInt(row["Comments"]),
    shares: parseNullableInt(row["Shares"]),
  }));
}
