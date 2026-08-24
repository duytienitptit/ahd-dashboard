import { nowVnDateString } from "@/lib/time";

import type { TikTokVideo } from "./provider";

export type PreviousVideoSnapshot = { tiktokVideoId: string; viewCount: number };

export type VideoDeltaResult = {
  /** Σ per-video delta — this is "view trong ngày", never (Σ today − Σ yesterday). */
  viewsInPeriod: number;
  /** No baseline, but posted ON `periodDate` — a genuinely new video, counted in full. */
  newVideoIds: string[];
  /** No baseline AND posted BEFORE `periodDate` — the video only now became visible to us (rate
   *  limit recovery on a prior run, or the channel just (re)connected), it was not actually
   *  posted today. EXCLUDED from `viewsInPeriod` entirely — counting its full lifetime view count
   *  would wildly overstate one day's growth (docs/DISPLAY_API.md bẫy #10). Caller must treat this
   *  as an incompleteness signal (`is_complete = false`), not a silent skip: this video's true
   *  contribution to `periodDate` is unknown, not zero. */
  lateDiscoveredVideoIds: string[];
  /** Present in `previous` but missing from `current` — deleted, made private, or a truncated
   *  response. Deliberately excluded from the sum, never subtracted (docs/DATA_SOURCES.md). */
  disappearedVideoIds: string[];
  /** A video whose view count went DOWN since the last snapshot — should not happen for a real
   *  video and signals a bad read (truncated/cached response), not an actual view loss. */
  negativeCount: number;
};

/**
 * Pure port of `diffSnapshots()` from tools/m0-display-api-probe/probe.mjs, extended 24/08/2026
 * (docs/DISPLAY_API.md bẫy #10, #12, #13 — "B1" in PROGRESS.md) to fix a real rò: the original
 * rule assumed "no prior snapshot" only ever meant "genuinely new video" — true right after a
 * video's own first post, but false the moment ANY video goes a day without a snapshot for reasons
 * that have nothing to do with when it was posted (a sync gap, a reconnect, a rate-limited prior
 * run). In that case the old code counted the video's full LIFETIME view count as "today's views",
 * sometimes 10x the real daily number.
 *
 * Rules (docs/DATA_SOURCES.md "Vấn đề chưa nguồn nào giải quyết trọn vẹn: view trong kỳ", extended):
 *   - sum the per-video delta, never (today's total − yesterday's total)
 *   - a video with no prior snapshot counts its full view count ONLY if `createTime` falls on
 *     `periodDate` itself — otherwise it's excluded, not guessed (see `lateDiscoveredVideoIds`)
 *   - a video missing from `current` is skipped, never subtracted
 *
 * `periodDate` is the VN calendar date (`lib/time.ts` "YYYY-MM-DD") this delta is being computed
 * for — normally `sampleDateForRun()`'s result, passed through by lib/tiktok/sync.ts.
 */
export function computeViewsDelta(previous: PreviousVideoSnapshot[], current: TikTokVideo[], periodDate: string): VideoDeltaResult {
  const prevViewsById = new Map(previous.map((p) => [p.tiktokVideoId, p.viewCount]));
  const currentIds = new Set(current.map((v) => v.id));

  let viewsInPeriod = 0;
  let negativeCount = 0;
  const newVideoIds: string[] = [];
  const lateDiscoveredVideoIds: string[] = [];

  for (const video of current) {
    const prevViews = prevViewsById.get(video.id);

    if (prevViews === undefined) {
      const postedDate = nowVnDateString(new Date(video.createTime * 1000));
      if (postedDate === periodDate) {
        newVideoIds.push(video.id);
        viewsInPeriod += video.viewCount;
      } else {
        lateDiscoveredVideoIds.push(video.id);
      }
      continue;
    }

    const delta = video.viewCount - prevViews;
    if (delta < 0) negativeCount += 1;
    viewsInPeriod += Math.max(0, delta);
  }

  const disappearedVideoIds = previous
    .map((p) => p.tiktokVideoId)
    .filter((id) => !currentIds.has(id));

  return { viewsInPeriod, newVideoIds, lateDiscoveredVideoIds, disappearedVideoIds, negativeCount };
}
