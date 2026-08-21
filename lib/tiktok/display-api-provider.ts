import type { ListVideosResult, TikTokDataProvider, TikTokUserStats, TikTokVideo } from "./provider";

// Ported from the M0 verification harness (tools/m0-display-api-probe/probe.mjs), which already ran
// these exact calls against real sandbox accounts — not a fresh implementation from docs alone.

const API_BASE = "https://open.tiktokapis.com/v2";

const MAX_PAGES = 60; // same safety net probe.mjs uses: 60 pages x 20 = 1200 videos
const PAGE_SIZE = 20; // hard API maximum

const USER_FIELDS = ["follower_count", "video_count"];
const VIDEO_BASE_FIELDS = ["id", "create_time", "title", "share_url"];
const METRIC_FIELDS = ["view_count", "like_count", "comment_count", "share_count"];

type RawVideo = {
  id: string;
  create_time: number;
  title?: string;
  share_url?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
};

type ApiResult<T> = {
  ok: boolean;
  rateLimited: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  data: T | null;
};

/**
 * Display API returns HTTP 200 with `error.code` set on failure (docs/DISPLAY_API.md bẫy #7) —
 * checking `res.ok` alone silently swallows errors.
 */
async function callApi<T>(
  path: string,
  opts: { token: string; method?: "GET" | "POST"; fields?: string[]; body?: unknown },
): Promise<ApiResult<T>> {
  const url = new URL(`${API_BASE}${path}`);
  if (opts.fields) url.searchParams.set("fields", opts.fields.join(","));

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const json = await res.json().catch(() => ({}) as Record<string, unknown>);
  const err = (json as { error?: { code?: string; message?: string } }).error ?? {};
  const errorCode = err.code && err.code !== "ok" ? err.code : null;

  return {
    ok: res.ok && !errorCode,
    rateLimited: res.status === 429 || errorCode === "rate_limit_exceeded",
    errorCode,
    errorMessage: err.message ?? null,
    data: (json as { data?: T }).data ?? null,
  };
}

function toVideo(raw: RawVideo): TikTokVideo {
  return {
    id: raw.id,
    createTime: raw.create_time,
    title: raw.title ?? null,
    videoLink: raw.share_url ?? null,
    viewCount: raw.view_count ?? 0,
    likeCount: raw.like_count ?? 0,
    commentCount: raw.comment_count ?? 0,
    shareCount: raw.share_count ?? 0,
  };
}

export class DisplayApiProvider implements TikTokDataProvider {
  /**
   * One lightweight `video/list` call (`max_count: 1`, no metric fields) for just a single video's
   * `share_url` — used by the OAuth callback's wrong-account guard (lib/tiktok/verify-account.ts),
   * which only needs a handle, not the whole channel. Not part of `TikTokDataProvider`: it's a
   * narrow Display-API-specific helper, same reasoning as oauth.ts living outside the interface.
   * Deliberately NOT `listAllVideos()` — that paginates up to 60 pages, which risked exceeding the
   * callback route's request timeout for a channel with many videos, just to read one field.
   */
  async peekFirstVideoLink(accessToken: string): Promise<string | null> {
    const res = await callApi<{ videos: RawVideo[] }>("/video/list/", {
      token: accessToken,
      method: "POST",
      fields: VIDEO_BASE_FIELDS,
      body: { max_count: 1 },
    });
    if (!res.ok || !res.data) return null;
    return res.data.videos?.[0]?.share_url ?? null;
  }

  async getUserInfo(accessToken: string): Promise<TikTokUserStats> {
    const res = await callApi<{ user: { follower_count: number; video_count: number } }>("/user/info/", {
      token: accessToken,
      fields: USER_FIELDS,
    });
    if (!res.ok || !res.data) {
      throw new Error(`TikTok user/info thất bại: ${res.errorCode} — ${res.errorMessage}`);
    }
    return { followerCount: res.data.user.follower_count, videoCount: res.data.user.video_count };
  }

  async listAllVideos(accessToken: string): Promise<ListVideosResult> {
    const videos: TikTokVideo[] = [];
    const seen = new Set<string>();
    let cursor: number | undefined;
    let rateLimited = false;
    let hitSafetyCap = false;
    let metricsMissing = false;

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const body = { max_count: PAGE_SIZE, ...(cursor !== undefined ? { cursor } : {}) };
      const res = await callApi<{ videos: RawVideo[]; cursor: number; has_more: boolean }>("/video/list/", {
        token: accessToken,
        method: "POST",
        fields: [...VIDEO_BASE_FIELDS, ...METRIC_FIELDS],
        body,
      });

      if (res.rateLimited) {
        rateLimited = true;
        break;
      }
      if (!res.ok || !res.data) break; // treat any hard failure as an incomplete snapshot, not a crash

      for (const raw of res.data.videos ?? []) {
        if (seen.has(raw.id)) continue;
        seen.add(raw.id);
        if (raw.view_count === undefined) metricsMissing = true;
        videos.push(toVideo(raw));
      }

      if (!res.data.has_more) break;
      if (res.data.cursor === cursor) break; // stuck cursor — don't loop forever
      cursor = res.data.cursor;
      if (page === MAX_PAGES) hitSafetyCap = true;
    }

    // docs/DISPLAY_API.md: M0 confirmed video/list DOES return metrics via `fields` in practice, but
    // TikTok never documents this as guaranteed — video/query is the one endpoint whose docs commit
    // to returning view/like/comment/share, so fall back to it (batches of 20) if metrics are absent.
    const finalVideos = metricsMissing && videos.length > 0 ? await this.fillMissingMetrics(accessToken, videos) : videos;

    return {
      videos: finalVideos,
      isComplete: !rateLimited && !hitSafetyCap,
      rateLimited,
      hitSafetyCap,
    };
  }

  private async fillMissingMetrics(accessToken: string, videos: TikTokVideo[]): Promise<TikTokVideo[]> {
    const byId = new Map(videos.map((v) => [v.id, v]));

    for (let i = 0; i < videos.length; i += 20) {
      const chunk = videos.slice(i, i + 20).map((v) => v.id);
      const res = await callApi<{ videos: RawVideo[] }>("/video/query/", {
        token: accessToken,
        method: "POST",
        fields: [...VIDEO_BASE_FIELDS, ...METRIC_FIELDS],
        body: { filters: { video_ids: chunk } },
      });
      if (!res.ok || !res.data) continue;
      for (const raw of res.data.videos ?? []) {
        if (byId.has(raw.id)) byId.set(raw.id, toVideo(raw));
      }
    }

    return [...byId.values()];
  }
}
