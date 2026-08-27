import { randomUUID } from "node:crypto";

import { listKpiCycles } from "@/lib/kpi";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { addDaysToDateString } from "@/lib/time";
import { ValidationError } from "@/lib/validation";

import { extractCsvEntries } from "./zip";
import { parseOverviewCsv } from "./overview";
import { parseFollowerHistoryCsv } from "./follower-history";
import { parseViewersCsv } from "./viewers";
import { parseFollowerActivityCsv } from "./follower-activity";
import { parseFollowerGenderCsv, parseFollowerTerritoriesCsv } from "./audience";
import { parseContentCsv } from "./content";
import { planStudioImport, type Discrepancy } from "./plan-import";
import type { MergedDailyMetrics } from "./merge";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type RunImportResult = {
  importedDates: string[];
  skippedRecentDates: string[];
  skippedFinalDates: string[];
  discrepancies: Discrepancy[];
  videosUpserted: number;
  /** Not in the original docs/API_SPEC.md — total distinct dates read across Overview/Followers/
   *  Viewers before any filtering, feeds the "Ngày đọc được" stat tile in design/Import.dc.html. */
  readDates: number;
};

const REQUIRED_FILES = ["Overview.csv", "FollowerHistory.csv", "Viewers.csv"] as const;

const STORAGE_BUCKET = "studio-imports";

/** Every calendar date this channel has already `final`-locked, across every finalized cycle — not
 *  just the newest one, a channel can have several closed weeks. Reuses `listKpiCycles` (lib/kpi.ts)
 *  rather than a raw query so this stays in sync with whatever that function considers "final". */
async function fetchLockedDates(supabase: SupabaseServerClient, channelId: string): Promise<Set<string>> {
  const finalCycles = await listKpiCycles(supabase, { channelId, status: "final" });
  const locked = new Set<string>();
  for (const cycle of finalCycles) {
    let cursor = cycle.periodStart;
    while (cursor <= cycle.periodEnd) {
      locked.add(cursor);
      cursor = addDaysToDateString(cursor, 1);
    }
  }
  return locked;
}

function toDataSnapshotRow(channelId: string, date: string, m: MergedDailyMetrics, rawFileRef: string) {
  return {
    channel_id: channelId,
    date,
    source: "studio_import",
    video_views: m.videoViews,
    profile_views: m.profileViews,
    likes: m.likes,
    comments: m.comments,
    shares: m.shares,
    followers: m.followers,
    total_viewers: m.totalViewers,
    new_viewers: m.newViewers,
    returning_viewers: m.returningViewers,
    raw_file_ref: rawFileRef,
  };
}

/**
 * Runs (or, with `dryRun`, only simulates) one Studio import for a channel. Thin wrapper around the
 * pure `planStudioImport` — this function's only job is fetching what that needs and executing what
 * it decides. See the M3a plan for why the settle window applies only to `data_snapshot`.
 */
export async function runStudioImport(input: {
  supabase: SupabaseServerClient;
  channelId: string;
  exportDate: string;
  files: { filename: string; buffer: Buffer }[];
  dryRun: boolean;
}): Promise<RunImportResult> {
  const { supabase, channelId, exportDate, dryRun } = input;

  const entries = await extractCsvEntries(input.files);
  const missing = REQUIRED_FILES.filter((name) => !entries.has(name));
  if (missing.length > 0) {
    throw new ValidationError(`Thiếu file bắt buộc trong zip đã tải lên: ${missing.join(", ")}.`);
  }

  const overviewRows = parseOverviewCsv(entries.get("Overview.csv")!, exportDate);
  const followerRows = parseFollowerHistoryCsv(entries.get("FollowerHistory.csv")!, exportDate);
  const viewerRows = parseViewersCsv(entries.get("Viewers.csv")!, exportDate);

  const dateList = [
    ...new Set([...overviewRows, ...followerRows, ...viewerRows].map((r) => r.date)),
  ];

  const existingDisplayApi: Record<string, { videoViews: number | null }> = {};
  const existingStudioImport: Record<string, Partial<MergedDailyMetrics>> = {};

  // Independent of dateList — kicked off here (not awaited yet) so it runs alongside the
  // data_snapshot fetch below instead of after it; awaited just before planStudioImport needs it.
  const lockedDatesPromise = fetchLockedDates(supabase, channelId);

  if (dateList.length > 0) {
    const { data, error } = await supabase
      .from("data_snapshot")
      .select(
        "date, source, video_views, profile_views, likes, comments, shares, followers, total_viewers, new_viewers, returning_viewers",
      )
      .eq("channel_id", channelId)
      .in("date", dateList)
      .in("source", ["display_api", "studio_import"]);
    if (error) throw error;

    for (const row of data ?? []) {
      const metrics: Partial<MergedDailyMetrics> = {
        videoViews: row.video_views,
        profileViews: row.profile_views,
        likes: row.likes,
        comments: row.comments,
        shares: row.shares,
        followers: row.followers,
        totalViewers: row.total_viewers,
        newViewers: row.new_viewers,
        returningViewers: row.returning_viewers,
      };
      if (row.source === "display_api") existingDisplayApi[row.date] = { videoViews: row.video_views };
      else if (row.source === "studio_import") existingStudioImport[row.date] = metrics;
    }
  }

  const plan = planStudioImport({
    overviewRows,
    followerRows,
    viewerRows,
    exportDate,
    existingDisplayApi,
    existingStudioImport,
    lockedDates: await lockedDatesPromise,
  });

  const followerActivityRows = entries.has("FollowerActivity.csv")
    ? parseFollowerActivityCsv(entries.get("FollowerActivity.csv")!, exportDate)
    : [];
  const genderDistribution = entries.has("FollowerGender.csv")
    ? parseFollowerGenderCsv(entries.get("FollowerGender.csv")!)
    : null;
  const territoryDistribution = entries.has("FollowerTopTerritories.csv")
    ? parseFollowerTerritoriesCsv(entries.get("FollowerTopTerritories.csv")!)
    : null;
  const contentRows = entries.has("Content.csv") ? parseContentCsv(entries.get("Content.csv")!, exportDate) : [];

  if (!dryRun) {
    // One batch id shared by every table this import touches, so a Manager can trace any row on
    // any date back to the exact upload that produced it.
    const batchId = randomUUID();
    const storagePrefix = `${channelId}/${batchId}`;
    const rawFileRef = `${STORAGE_BUCKET}/${storagePrefix}`;

    if (plan.dailyWrites.size > 0) {
      const rows = [...plan.dailyWrites.entries()].map(([date, m]) =>
        toDataSnapshotRow(channelId, date, m, rawFileRef),
      );
      const { error } = await supabase.from("data_snapshot").upsert(rows, { onConflict: "channel_id,date,source" });
      if (error) throw error;
    }

    const activityRows = followerActivityRows
      .filter((r) => r.activeFollowers !== null)
      .map((r) => ({ channel_id: channelId, date: r.date, hour: r.hour, active_followers: r.activeFollowers }));
    if (activityRows.length > 0) {
      const { error } = await supabase
        .from("follower_activity")
        .upsert(activityRows, { onConflict: "channel_id,date,hour" });
      if (error) throw error;
    }

    if (genderDistribution || territoryDistribution) {
      const { error } = await supabase.from("audience_snapshot").upsert(
        {
          channel_id: channelId,
          captured_on: exportDate,
          gender_distribution: genderDistribution,
          territory_distribution: territoryDistribution,
        },
        { onConflict: "channel_id,captured_on" },
      );
      if (error) throw error;
    }

    if (contentRows.length > 0) {
      const rows = contentRows.map((r) => ({
        channel_id: channelId,
        tiktok_video_id: r.tiktokVideoId,
        video_link: r.videoLink,
        title: r.title,
        hashtags: r.hashtags,
        posted_at: r.postedAt,
        last_synced_at: new Date().toISOString(),
      }));
      // onConflict must match lib/tiktok/sync.ts's content_video upsert (tiktok_video_id) — both
      // video_link and tiktok_video_id are unique, but picking different conflict targets in the
      // two importers risks a 23505 crash if a video's share_url from Display API ever differs from
      // the video_link Content.csv recorded for the same tiktok_video_id.
      const { data: upserted, error } = await supabase
        .from("content_video")
        .upsert(rows, { onConflict: "tiktok_video_id" })
        .select("id, tiktok_video_id");
      if (error) throw error;

      // Content.csv's "Total views/likes/comments/shares" are cumulative as of the export — same
      // shape as lib/tiktok/sync.ts's video_snapshot rows from Display API, dated at exportDate
      // (Content.csv has no per-row date, only the shared export "Time" column). Not settle-windowed
      // like data_snapshot: a video_snapshot row is a point-in-time reading, not a value that gets
      // reconciled later, so there's nothing to protect by holding back the 3 most recent days.
      const idByTiktokId = new Map((upserted ?? []).map((r) => [r.tiktok_video_id as string, r.id as string]));
      const snapshotRows = contentRows
        .map((r) => {
          const contentVideoId = idByTiktokId.get(r.tiktokVideoId);
          if (!contentVideoId) return null;
          return {
            content_video_id: contentVideoId,
            date: exportDate,
            view_count: r.viewCount,
            like_count: r.likeCount,
            comment_count: r.commentCount,
            share_count: r.shareCount,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (snapshotRows.length > 0) {
        const { error: snapshotError } = await supabase
          .from("video_snapshot")
          .upsert(snapshotRows, { onConflict: "content_video_id,date" });
        if (snapshotError) throw snapshotError;
      }
    }

    for (const file of input.files) {
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(`${storagePrefix}/${file.filename}`, file.buffer, {
          contentType: "application/zip",
          upsert: true,
        });
      if (error) throw error;
    }
  }

  return {
    importedDates: plan.importedDates,
    skippedRecentDates: plan.skippedRecentDates,
    skippedFinalDates: plan.skippedFinalDates,
    discrepancies: plan.discrepancies,
    videosUpserted: contentRows.length,
    readDates: plan.readDates,
  };
}
