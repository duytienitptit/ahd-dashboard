import { decryptToken, encryptToken } from "@/lib/crypto/token";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { addDaysToDateString } from "@/lib/time";

import type { TikTokDataProvider } from "./provider";
import { refreshAccessToken } from "./oauth";
import { computeViewsDelta, type PreviousVideoSnapshot } from "./video-delta";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

const HASHTAG_RE = /#(\w+)/g;
function extractHashtags(title: string): string[] {
  return [...title.matchAll(HASHTAG_RE)].map((m) => m[1]);
}

const ACCESS_TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export type SyncOutcome =
  | { status: "ok"; channelId: string; isComplete: boolean; gotVideos: number; expectedVideos: number }
  | { status: "failed"; channelId: string; error: string }
  | { status: "unverified"; channelId: string };

/**
 * Syncs one channel's Display API numbers. `sampleDate` (VN calendar date, caller resolves via
 * `sampleDateForRun()` in lib/time.ts) is the day THIS run's numbers belong to — both the raw
 * `video_snapshot` log and the `data_snapshot` delta it produces.
 *
 * B1 (24/08/2026, docs/DISPLAY_API.md bẫy #12/#13 — replaces the old `determineSyncDate`/
 * `isBootstrap`/`HISTORY_LOOKBACK_DAYS` design): every video's delta is computed against the
 * baseline dated EXACTLY `sampleDate − 1`, not "whatever `last_sync_at` says" or "most recent
 * within 30 days". This makes the whole thing idempotent — re-running mid-day only refines
 * `sampleDate`'s own `video_snapshot` row (upserted, last-write-wins), it can never cut off or
 * double-count a previous run's contribution the way the old `last_sync_at`-driven window did.
 * Reconnecting a channel needs no special-case reset either: a missing `sampleDate − 1` baseline
 * naturally falls through computeViewsDelta's `lateDiscoveredVideoIds` path below.
 *
 * Every failure mode (never connected, refresh token expired, TikTok API error) is caught and
 * turned into `channel_oauth.last_sync_status = 'failed'` plus a returned `{status:'failed'}` —
 * never thrown, so one broken channel can't take the rest of the batch down (see `syncAllChannels`).
 */
export async function syncChannel(
  supabase: AdminClient,
  provider: TikTokDataProvider,
  channel: { id: string; name: string },
  sampleDate: string,
): Promise<SyncOutcome> {
  try {
    const { data: oauthRow, error: oauthError } = await supabase
      .from("channel_oauth")
      .select("access_token, access_expires_at, refresh_token, last_sync_at, account_verified")
      .eq("channel_id", channel.id)
      .maybeSingle();
    if (oauthError) throw oauthError;
    if (!oauthRow) throw new Error("Kênh chưa kết nối Display API.");

    // Guard against the 21/08/2026 wrong-account incident happening again: a connection nobody has
    // confirmed matches this channel must never be allowed to write numbers into data_snapshot, no
    // matter how long ago it was authorized. Not a `throw` (that would count as `last_sync_status =
    // 'failed'`, which reads as "TikTok/network error" — this isn't one) — a distinct outcome the
    // caller can surface as "chưa xác minh", not "lỗi".
    if (!oauthRow.account_verified) {
      return { status: "unverified", channelId: channel.id };
    }

    const baselineDate = addDaysToDateString(sampleDate, -1);

    let accessToken = decryptToken(oauthRow.access_token);
    const accessExpiresAt = oauthRow.access_expires_at ? new Date(oauthRow.access_expires_at).getTime() : 0;

    if (accessExpiresAt < Date.now() + ACCESS_TOKEN_REFRESH_MARGIN_MS) {
      // Always overwrite BOTH tokens with whatever comes back, whether or not refresh_token looks
      // unchanged — TikTok never commits to rotation being stable across calls (docs/DISPLAY_API.md).
      const refreshed = await refreshAccessToken(decryptToken(oauthRow.refresh_token));
      accessToken = refreshed.accessToken;

      const { error: updateError } = await supabase
        .from("channel_oauth")
        .update({
          access_token: encryptToken(refreshed.accessToken),
          access_expires_at: refreshed.accessExpiresAt,
          refresh_token: encryptToken(refreshed.refreshToken),
          refresh_expires_at: refreshed.refreshExpiresAt,
          last_refreshed_at: new Date().toISOString(),
        })
        .eq("channel_id", channel.id);
      if (updateError) throw updateError;
    }

    // Sequential, not Promise.all: if getUserInfo rejects first, a still-in-flight listAllVideos
    // rejection would otherwise become an unhandled promise rejection instead of being caught below.
    const userStats = await provider.getUserInfo(accessToken);
    const videosResult = await provider.listAllVideos(accessToken);

    const contentRows = videosResult.videos.map((v) => ({
      channel_id: channel.id,
      tiktok_video_id: v.id,
      video_link: v.videoLink ?? `https://www.tiktok.com/video/${v.id}`,
      title: v.title,
      hashtags: v.title ? extractHashtags(v.title) : [],
      posted_at: new Date(v.createTime * 1000).toISOString(),
      last_synced_at: new Date().toISOString(),
    }));

    let idByTiktokId = new Map<string, string>();
    if (contentRows.length > 0) {
      const { data: upserted, error: upsertError } = await supabase
        .from("content_video")
        .upsert(contentRows, { onConflict: "tiktok_video_id" })
        .select("id, tiktok_video_id");
      if (upsertError) throw upsertError;
      idByTiktokId = new Map((upserted ?? []).map((r) => [r.tiktok_video_id as string, r.id as string]));
    }

    // Baseline for the delta: the view count as of EXACTLY `baselineDate` (= sampleDate − 1) for
    // every video this channel has, not "whatever the most recent snapshot happens to be" (B1,
    // 24/08/2026 — see the syncChannel doc comment). Filtered by channel_id directly via the FK
    // embed, so a video that's since disappeared from the API response is still found here and can
    // be correctly reported as "disappeared" (docs/DATA_SOURCES.md: skip it, don't subtract) rather
    // than never being looked up at all. `video_snapshot`'s own unique constraint is
    // (content_video_id, date), so this is at most one row per video — no ordering/dedup needed.
    const { data: history, error: historyError } = await supabase
      .from("video_snapshot")
      .select("view_count, content_video:content_video_id!inner(tiktok_video_id, channel_id)")
      .eq("content_video.channel_id", channel.id)
      .eq("date", baselineDate);
    if (historyError) throw historyError;

    // Embedded via the content_video_id FK; cast through unknown because the untyped client (no
    // generated Database types) can't infer this is a to-one relation, not an array — same
    // situation as `currentCreator` in lib/channels.ts.
    const previousSnapshots: PreviousVideoSnapshot[] = (
      (history ?? []) as unknown as { view_count: number | null; content_video: { tiktok_video_id: string } | null }[]
    )
      .filter((row) => row.content_video?.tiktok_video_id)
      .map((row) => ({ tiktokVideoId: row.content_video!.tiktok_video_id, viewCount: row.view_count ?? 0 }));

    const delta = computeViewsDelta(previousSnapshots, videosResult.videos, sampleDate);

    const contentVideoIds = [...idByTiktokId.values()];
    if (contentVideoIds.length > 0) {
      const snapshotRows = videosResult.videos.map((v) => ({
        content_video_id: idByTiktokId.get(v.id)!,
        date: sampleDate,
        view_count: v.viewCount,
        like_count: v.likeCount,
        comment_count: v.commentCount,
        share_count: v.shareCount,
      }));
      // Upsert, not insert — re-running mid-day (or a delayed cron re-run) just refines this exact
      // day's cumulative reading with a fresher one. This is what makes B1 idempotent: repeated
      // syncs the same day only ever improve `sampleDate`'s own snapshot, they can't corrupt a
      // PAST day's row the way overwriting a `last_sync_at`-derived date used to (bẫy #12).
      const { error: snapshotError } = await supabase
        .from("video_snapshot")
        .upsert(snapshotRows, { onConflict: "content_video_id,date" });
      if (snapshotError) throw snapshotError;
    }

    const gotVideos = videosResult.videos.length;
    // docs/DISPLAY_API.md bẫy #1: video_count có thể ≠ số video video/list trả về ngay cả khi đầy đủ
    // (video riêng tư) — chưa xác nhận cố định cho vuonvuonvang, nên vẫn kiểm đúng như spec, không tự
    // đổi phép so sánh.
    const isComplete =
      videosResult.isComplete &&
      gotVideos === userStats.videoCount &&
      delta.negativeCount === 0 &&
      delta.lateDiscoveredVideoIds.length === 0;

    // null (not 0) when NOTHING this run could be measured at all — every video was either
    // late-discovered or the channel simply has none (docs/DISPLAY_API.md bẫy #10; same "unknown ≠
    // known-zero" principle as CLAUDE.md's CSV `"undefined"` rule). lib/dashboard.ts's sumViews()
    // and the trend chart both key off this exact null-vs-number distinction — null renders as a
    // gap, 0 renders as a real, misleadingly-flat data point (dashboard.test.ts). A channel with
    // literally zero videos falls through to `viewsInPeriod = 0` correctly — that IS a known zero.
    const measuredCount = gotVideos - delta.lateDiscoveredVideoIds.length;
    const noMeasurement = gotVideos > 0 && measuredCount === 0;

    const { error: dataSnapshotError } = await supabase.from("data_snapshot").upsert(
      {
        channel_id: channel.id,
        date: sampleDate,
        source: "display_api",
        followers: userStats.followerCount,
        video_count: gotVideos,
        video_views: noMeasurement ? null : delta.viewsInPeriod,
        is_complete: isComplete,
      },
      { onConflict: "channel_id,date,source" },
    );
    if (dataSnapshotError) throw dataSnapshotError;

    await supabase
      .from("channel_oauth")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: videosResult.rateLimited ? "rate_limited" : "ok",
        last_sync_error: null,
      })
      .eq("channel_id", channel.id);

    return { status: "ok", channelId: channel.id, isComplete, gotVideos, expectedVideos: userStats.videoCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await supabase
        .from("channel_oauth")
        .update({ last_sync_at: new Date().toISOString(), last_sync_status: "failed", last_sync_error: message })
        .eq("channel_id", channel.id);
    } catch {
      // best-effort — a logging failure here must not mask the original sync error below
    }
    return { status: "failed", channelId: channel.id, error: message };
  }
}

/** `sampleDate` — see syncChannel's doc comment. Callers pass `sampleDateForRun()`'s result
 *  (lib/time.ts), computed once for the whole batch so every channel in one run agrees on which
 *  calendar day they're sampling, even if the run straddles the [00:00, 02:00) VN rollback window. */
export async function syncAllChannels(supabase: AdminClient, provider: TikTokDataProvider, sampleDate: string) {
  const { data: channels, error } = await supabase.from("channel").select("id, name").eq("is_active", true);
  if (error) throw error;

  const results = await Promise.all((channels ?? []).map((c) => syncChannel(supabase, provider, c, sampleDate)));

  const incomplete = results
    .filter((r): r is Extract<SyncOutcome, { status: "ok" }> => r.status === "ok" && !r.isComplete)
    .map((r) => ({ channelId: r.channelId, expectedVideos: r.expectedVideos, gotVideos: r.gotVideos }));

  return {
    date: sampleDate,
    synced: results.filter((r) => r.status === "ok").length,
    failed: results.filter((r) => r.status === "failed").length,
    unverified: results.filter((r) => r.status === "unverified").length,
    incomplete,
  };
}
