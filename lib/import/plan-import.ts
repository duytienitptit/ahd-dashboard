import type { OverviewRow } from "./overview";
import type { FollowerHistoryRow } from "./follower-history";
import type { ViewersRow } from "./viewers";
import { mergeDailyMetrics, type MergedDailyMetrics } from "./merge";
import { settledBeforeDate } from "./settle-window";

const METRIC_COLUMNS = [
  "videoViews",
  "profileViews",
  "likes",
  "comments",
  "shares",
  "followers",
  "totalViewers",
  "newViewers",
  "returningViewers",
] as const satisfies readonly (keyof MergedDailyMetrics)[];

export type Discrepancy = { date: string; displayApi: number; studio: number; diffPct: number };

export type ImportPlan = {
  /** Rows the caller should upsert into `data_snapshot` (only when not dryRun) — already merged
   *  with whatever `studio_import` previously had, so a null here really means "no data anywhere". */
  dailyWrites: Map<string, MergedDailyMetrics>;
  importedDates: string[];
  skippedRecentDates: string[];
  discrepancies: Discrepancy[];
  /** Total distinct dates seen across Overview/FollowerHistory/Viewers, before any filtering. */
  readDates: number;
};

const DISCREPANCY_THRESHOLD_PCT = 10;

function hasAnyValue(row: MergedDailyMetrics): boolean {
  return METRIC_COLUMNS.some((col) => row[col] !== null);
}

/** Prefers `fresh`'s value; falls back to `existing` when fresh is null — never lets a fresh null
 *  erase a real number already on file (docs/DATA_SOURCES.md "không bao giờ ghi đè... bằng undefined"). */
function mergeWithExisting(
  fresh: MergedDailyMetrics,
  existing: Partial<MergedDailyMetrics> | undefined,
): MergedDailyMetrics {
  const merged = { ...fresh };
  for (const col of METRIC_COLUMNS) {
    if (merged[col] === null && existing?.[col] != null) merged[col] = existing[col];
  }
  return merged;
}

/**
 * Pure planning step for the Studio import — no Supabase calls, so it can be unit-tested directly
 * against the real zip fixtures in `data/` (see lib/import/plan-import.test.ts). The caller
 * (lib/import/run-import.ts) is responsible for fetching `existingDisplayApi`/`existingStudioImport`
 * and for actually executing `dailyWrites`.
 */
export function planStudioImport(input: {
  overviewRows: OverviewRow[];
  followerRows: FollowerHistoryRow[];
  viewerRows: ViewersRow[];
  exportDate: string;
  /** Existing `data_snapshot` rows, source = display_api, keyed by date. */
  existingDisplayApi: Record<string, { videoViews: number | null }>;
  /** Existing `data_snapshot` rows, source = studio_import, keyed by date. */
  existingStudioImport: Record<string, Partial<MergedDailyMetrics>>;
}): ImportPlan {
  const merged = mergeDailyMetrics(input.overviewRows, input.followerRows, input.viewerRows);
  const settledBefore = settledBeforeDate(input.exportDate);

  const dailyWrites = new Map<string, MergedDailyMetrics>();
  const importedDates: string[] = [];
  const skippedRecentDates: string[] = [];
  const discrepancies: Discrepancy[] = [];

  for (const date of [...merged.keys()].sort()) {
    if (date >= settledBefore) {
      skippedRecentDates.push(date);
      continue;
    }

    const row = merged.get(date)!;
    if (!hasAnyValue(row)) continue; // genuinely no data this day (channel didn't exist yet)

    const finalRow = mergeWithExisting(row, input.existingStudioImport[date]);
    dailyWrites.set(date, finalRow);
    importedDates.push(date);

    const displayApiViews = input.existingDisplayApi[date]?.videoViews;
    if (displayApiViews != null && displayApiViews > 0 && finalRow.videoViews != null) {
      const diffPct = (Math.abs(finalRow.videoViews - displayApiViews) / displayApiViews) * 100;
      if (diffPct > DISCREPANCY_THRESHOLD_PCT) {
        discrepancies.push({
          date,
          displayApi: displayApiViews,
          studio: finalRow.videoViews,
          diffPct: Math.round(diffPct * 10) / 10,
        });
      }
    }
  }

  return { dailyWrites, importedDates, skippedRecentDates, discrepancies, readDates: merged.size };
}
