import { parseCsv, parseNullableInt } from "./csv";
import { resolveStudioDate } from "./date";

export type ViewersRow = {
  date: string;
  totalViewers: number | null;
  newViewers: number | null;
  returningViewers: number | null;
};

/** `Viewers.csv` — docs/CSV_FORMAT.md. Columns: Date, Total Viewers, New Viewers, Returning Viewers.
 *
 * A day TikTok hasn't finished processing comes back as `Total Viewers: undefined` with a literal
 * `0` in New/Returning (verified on the real 18/08 export, row 2026-08-17). Those zeros are not
 * data — new + returning cannot be known while the total isn't — but they were enough to make
 * plan-import's `hasAnyValue` write the row, and a `studio_import` row outranks `display_api` in
 * `v_channel_daily`, so a half-filled day would hide real numbers. Drop the whole triple instead. */
export function parseViewersCsv(text: string, referenceDate: string): ViewersRow[] {
  return parseCsv(text).map((row) => {
    const totalViewers = parseNullableInt(row["Total Viewers"]);
    return {
      date: resolveStudioDate(row["Date"], referenceDate),
      totalViewers,
      newViewers: totalViewers === null ? null : parseNullableInt(row["New Viewers"]),
      returningViewers: totalViewers === null ? null : parseNullableInt(row["Returning Viewers"]),
    };
  });
}
