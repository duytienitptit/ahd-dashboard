import { addDaysToDateString } from "@/lib/time";

/**
 * The settle window (docs/DATA_SOURCES.md) — Studio lags exactly 2 days behind the day the import
 * runs: an export pulled on 25/08 has complete numbers through 23/08 and nothing usable for 24-25
 * (verified 25/08/2026 across Overview/FollowerHistory/Viewers). Only `date < settledBefore` may be
 * overwritten by a Studio import, so the newest day written is `importDate − 2`; the 2 lagging days
 * keep whatever `display_api` already has.
 *
 * Was `−3` until 25/08/2026: that skipped 2 days the export already had complete numbers for, and
 * left the documented Wednesday cadence one day short of the previous Sunday, so a weekly cycle
 * could never satisfy the finalize condition. There is no calendar safety margin left — the guard is
 * that a lagging day arrives with every column null and is dropped by `hasAnyValue` in plan-import.
 *
 * Applies to `data_snapshot` only — see the M3a plan note on why FollowerActivity/audience/content
 * are imported in full regardless of this window.
 */
export function settledBeforeDate(exportDate: string): string {
  return addDaysToDateString(exportDate, -1);
}
