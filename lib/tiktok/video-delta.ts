import type { TikTokVideo } from "./provider";

export type PreviousVideoSnapshot = { tiktokVideoId: string; viewCount: number };

export type VideoDeltaResult = {
  /** Σ per-video delta — this is "view trong ngày", never (Σ today − Σ yesterday). */
  viewsInPeriod: number;
  newVideoIds: string[];
  /** Present in `previous` but missing from `current` — deleted, made private, or a truncated
   *  response. Deliberately excluded from the sum, never subtracted (docs/DATA_SOURCES.md). */
  disappearedVideoIds: string[];
  /** A video whose view count went DOWN since the last snapshot — should not happen for a real
   *  video and signals a bad read (truncated/cached response), not an actual view loss. */
  negativeCount: number;
};

/**
 * Pure port of `diffSnapshots()` from tools/m0-display-api-probe/probe.mjs — the same algorithm,
 * already run against real TikTok data. Rules (docs/DATA_SOURCES.md "Vấn đề chưa nguồn nào giải
 * quyết trọn vẹn: view trong kỳ"):
 *   - sum the per-video delta, never (today's total − yesterday's total)
 *   - a video with no prior snapshot counts its full view count (it's new to us, not to TikTok)
 *   - a video missing from `current` is skipped, never subtracted
 */
export function computeViewsDelta(previous: PreviousVideoSnapshot[], current: TikTokVideo[]): VideoDeltaResult {
  const prevViewsById = new Map(previous.map((p) => [p.tiktokVideoId, p.viewCount]));
  const currentIds = new Set(current.map((v) => v.id));

  let viewsInPeriod = 0;
  let negativeCount = 0;
  const newVideoIds: string[] = [];

  for (const video of current) {
    const prevViews = prevViewsById.get(video.id);

    if (prevViews === undefined) {
      newVideoIds.push(video.id);
      viewsInPeriod += video.viewCount;
      continue;
    }

    const delta = video.viewCount - prevViews;
    if (delta < 0) negativeCount += 1;
    viewsInPeriod += Math.max(0, delta);
  }

  const disappearedVideoIds = previous
    .map((p) => p.tiktokVideoId)
    .filter((id) => !currentIds.has(id));

  return { viewsInPeriod, newVideoIds, disappearedVideoIds, negativeCount };
}
