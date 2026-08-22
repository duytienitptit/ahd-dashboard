import { decryptToken, encryptToken } from "@/lib/crypto/token";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { addDaysToDateString, nowVnDateString } from "@/lib/time";

import type { TikTokDataProvider } from "./provider";
import { refreshAccessToken } from "./oauth";
import { computeViewsDelta, type PreviousVideoSnapshot } from "./video-delta";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

const HASHTAG_RE = /#(\w+)/g;
function extractHashtags(title: string): string[] {
  return [...title.matchAll(HASHTAG_RE)].map((m) => m[1]);
}

const ACCESS_TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
/** How far back to look for a delta baseline. Generous relative to the daily cron cadence — only
 *  matters if a channel went this long with zero successful syncs, in which case falling back to
 *  bootstrap behavior (see determineSyncDate) is a reasonable degradation, not a bug. */
const HISTORY_LOOKBACK_DAYS = 30;

export type SyncOutcome =
  | { status: "ok"; channelId: string; isComplete: boolean; gotVideos: number; expectedVideos: number }
  | { status: "failed"; channelId: string; error: string }
  | { status: "unverified"; channelId: string };

/**
 * Which calendar day a sync's view-count delta belongs to, and whether this is the channel's
 * first-ever sync (no baseline to diff against at all — see the bootstrap handling in syncChannel).
 *
 * Derived from `lastSyncAt`, NOT from "today" and not from a fixed "-1 day": the delta always
 * measures growth since the last successful sync, whenever that was, so it belongs to the date THAT
 * sync happened on. This matters because the cron runs at a fixed wall-clock time (03:00 VN) that
 * straddles the day boundary — its ~24h delta window is [yesterday 03:00, today 03:00], which is
 * overwhelmingly yesterday's activity. Using "today" would silently misattribute an entire day's
 * growth to the wrong date every single time the cron runs. Deriving from `lastSyncAt` instead is
 * also correct for the manual "Chạy đồng bộ ngay" trigger, which can run at any time of day and
 * would otherwise need separate, special-cased logic from the cron path.
 *
 * `today` is the caller's already-computed "today" (syncChannel's own `today` parameter) — used
 * only for the bootstrap fallback, deliberately NOT re-derived via `new Date()` here. Two different
 * "now"s for the same sync run would work by coincidence outside a ~3-minute VN-midnight window, but
 * a test that fixes `today` to a specific date and expects it to be honored would catch the drift.
 */
export function determineSyncDate(lastSyncAt: string | null, today: string): { date: string; isBootstrap: boolean } {
  if (!lastSyncAt) return { date: today, isBootstrap: true };
  return { date: nowVnDateString(new Date(lastSyncAt)), isBootstrap: false };
}

/**
 * Syncs one channel's Display API numbers. `today` is the actual calendar day the sync is running
 * on (Asia/Ho_Chi_Minh) — used for the raw video_snapshot log; the date the resulting delta is
 * attributed to in data_snapshot is computed separately (see determineSyncDate) since it isn't
 * always the same day. Every failure mode (never connected, refresh token expired, TikTok API
 * error) is caught and turned into `channel_oauth.last_sync_status = 'failed'` plus a returned
 * `{status:'failed'}` — never thrown, so one broken channel can't take the rest of the batch down
 * (see `syncAllChannels`).
 */
export async function syncChannel(
  supabase: AdminClient,
  provider: TikTokDataProvider,
  channel: { id: string; name: string },
  today: string,
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

    // Read the baseline reference BEFORE this sync updates last_sync_at below.
    const { date: attributedDate, isBootstrap } = determineSyncDate(oauthRow.last_sync_at, today);

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

    // Baseline for the delta: the most recent known view count for EVERY video this channel has
    // (not just the ones returned today) — filtered by channel_id directly, via the FK embed, so a
    // video that has since disappeared from the API response is still found here and can correctly
    // be reported as "disappeared" (docs/DATA_SOURCES.md: skip it, don't subtract) instead of never
    // being looked up at all. No upper date bound: today's own row is a valid baseline too, if an
    // earlier sync already ran today (e.g. cron this morning, then a manual re-sync this afternoon).
    const { data: history, error: historyError } = await supabase
      .from("video_snapshot")
      .select("view_count, content_video:content_video_id!inner(tiktok_video_id, channel_id)")
      .eq("content_video.channel_id", channel.id)
      .gte("date", addDaysToDateString(today, -HISTORY_LOOKBACK_DAYS))
      .order("date", { ascending: false });
    if (historyError) throw historyError;

    // Embedded via the content_video_id FK; cast through unknown because the untyped client (no
    // generated Database types) can't infer this is a to-one relation, not an array — same
    // situation as `currentCreator` in lib/channels.ts.
    const latestPerVideo = new Map<string, number>();
    for (const row of (history ?? []) as unknown as {
      view_count: number | null;
      content_video: { tiktok_video_id: string } | null;
    }[]) {
      const tiktokId = row.content_video?.tiktok_video_id;
      if (!tiktokId || latestPerVideo.has(tiktokId)) continue; // sorted desc — first hit is most recent
      latestPerVideo.set(tiktokId, row.view_count ?? 0);
    }
    const previousSnapshots: PreviousVideoSnapshot[] = [...latestPerVideo.entries()].map(
      ([tiktokVideoId, viewCount]) => ({ tiktokVideoId, viewCount }),
    );

    const delta = computeViewsDelta(previousSnapshots, videosResult.videos);

    const contentVideoIds = [...idByTiktokId.values()];
    if (contentVideoIds.length > 0) {
      const snapshotRows = videosResult.videos.map((v) => ({
        content_video_id: idByTiktokId.get(v.id)!,
        date: today,
        view_count: v.viewCount,
        like_count: v.likeCount,
        comment_count: v.commentCount,
        share_count: v.shareCount,
      }));
      const { error: snapshotError } = await supabase
        .from("video_snapshot")
        .upsert(snapshotRows, { onConflict: "content_video_id,date" });
      if (snapshotError) throw snapshotError;
    }

    const gotVideos = videosResult.videos.length;
    // docs/DISPLAY_API.md bẫy #1: video_count có thể ≠ số video video/list trả về ngay cả khi đầy đủ
    // (video riêng tư) — chưa xác nhận cố định cho vuonvuonvang, nên vẫn kiểm đúng như spec, không tự
    // đổi phép so sánh.
    const isComplete = videosResult.isComplete && gotVideos === userStats.videoCount && delta.negativeCount === 0;

    const { error: dataSnapshotError } = await supabase.from("data_snapshot").upsert(
      {
        channel_id: channel.id,
        date: attributedDate,
        source: "display_api",
        followers: userStats.followerCount,
        video_count: gotVideos,
        // Bootstrap (first-ever sync): there is no baseline, so every video looks "new" and the sum
        // would equal LIFETIME views across the whole channel, not one day's growth — write null
        // (unknown), never a wrong number. video_snapshot above still gets written either way,
        // seeding the baseline the next sync will diff against.
        video_views: isBootstrap ? null : delta.viewsInPeriod,
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

export async function syncAllChannels(supabase: AdminClient, provider: TikTokDataProvider, today: string) {
  const { data: channels, error } = await supabase.from("channel").select("id, name").eq("is_active", true);
  if (error) throw error;

  const results = await Promise.all((channels ?? []).map((c) => syncChannel(supabase, provider, c, today)));

  const incomplete = results
    .filter((r): r is Extract<SyncOutcome, { status: "ok" }> => r.status === "ok" && !r.isComplete)
    .map((r) => ({ channelId: r.channelId, expectedVideos: r.expectedVideos, gotVideos: r.gotVideos }));

  return {
    date: today,
    synced: results.filter((r) => r.status === "ok").length,
    failed: results.filter((r) => r.status === "failed").length,
    unverified: results.filter((r) => r.status === "unverified").length,
    incomplete,
  };
}
