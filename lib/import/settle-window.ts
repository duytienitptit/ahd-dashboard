import { addDaysToDateString } from "@/lib/time";

/**
 * The settle window (docs/DATA_SOURCES.md) — Studio lags 2 real days behind the export date, +1 day
 * of safety margin. Only `date < settledBefore` may be overwritten by a Studio import; anything from
 * `settledBefore` onward keeps whatever `display_api` already has.
 *
 * Applies to `data_snapshot` only — see the M3a plan note on why FollowerActivity/audience/content
 * are imported in full regardless of this window.
 */
export function settledBeforeDate(exportDate: string): string {
  return addDaysToDateString(exportDate, -3);
}
