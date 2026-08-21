import { parseCsv } from "./csv";
import { resolveStudioDate } from "./date";
import { vnMidnightIso } from "@/lib/time";

export type ContentRow = {
  tiktokVideoId: string;
  videoLink: string;
  title: string | null;
  hashtags: string[];
  /** timestamptz — Content.csv only gives a date, not a time, so this is midnight VN of that day. */
  postedAt: string | null;
};

const VIDEO_ID_RE = /\/video\/(\d+)/;
const HASHTAG_RE = /#(\w+)/g;

function extractHashtags(title: string): string[] {
  return [...title.matchAll(HASHTAG_RE)].map((m) => m[1]);
}

/**
 * `Content.csv` — docs/CSV_FORMAT.md. Capped at ~15 rows, unpredictable ordering, NOT the full video
 * list (see the doc's warning) — only used for the top-video library (P1), never for counting videos
 * in a period. Dedup key is `Video link`, matching `content_video.video_link`'s unique constraint.
 */
export function parseContentCsv(text: string, referenceDate: string): ContentRow[] {
  return parseCsv(text)
    .map((row): ContentRow | null => {
      const videoLink = row["Video link"]?.trim();
      const idMatch = videoLink?.match(VIDEO_ID_RE);
      if (!videoLink || !idMatch) return null;

      const title = row["Video title"]?.trim() || null;
      const postTime = row["Post time"]?.trim();

      return {
        tiktokVideoId: idMatch[1],
        videoLink,
        title,
        hashtags: title ? extractHashtags(title) : [],
        postedAt: postTime ? vnMidnightIso(resolveStudioDate(postTime, referenceDate)) : null,
      };
    })
    .filter((row): row is ContentRow => row !== null);
}
