import { parseCsv, parseNullableInt } from "./csv";
import { resolveStudioDate } from "./date";

export type ViewersRow = {
  date: string;
  totalViewers: number | null;
  newViewers: number | null;
  returningViewers: number | null;
};

/** `Viewers.csv` — docs/CSV_FORMAT.md. Columns: Date, Total Viewers, New Viewers, Returning Viewers. */
export function parseViewersCsv(text: string, referenceDate: string): ViewersRow[] {
  return parseCsv(text).map((row) => ({
    date: resolveStudioDate(row["Date"], referenceDate),
    totalViewers: parseNullableInt(row["Total Viewers"]),
    newViewers: parseNullableInt(row["New Viewers"]),
    returningViewers: parseNullableInt(row["Returning Viewers"]),
  }));
}
