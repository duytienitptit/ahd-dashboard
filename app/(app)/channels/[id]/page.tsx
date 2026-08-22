import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentOwnershipStart, listChannels } from "@/lib/channels";
import { getCurrentUser } from "@/lib/auth";
import {
  aggregateHashtagStats,
  bucketMonthlyLastFollowers,
  bucketMonthlyVideoCounts,
  bucketMonthlyViews,
  bucketWeeklyLastFollowers,
  bucketWeeklyVideoCounts,
  bucketWeeklyViews,
  fetchActivityHeatmap,
  fetchChannelVideos,
  fetchDailyRows,
  fetchPostedVnDates,
  getChannelPeriodStats,
  isoWeekStart,
  latestViewerRatio,
  previousPeriod,
} from "@/lib/dashboard";
import { formatCompact, formatFullDate, initialsFromStart } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addDaysToDateString, resolvePeriodParamsAllTime } from "@/lib/time";

import { StatTile } from "../../dashboard-widgets";
import { DateRangePicker } from "../../date-range-picker";
import { FilterPendingOverlay, FilterTransitionProvider } from "../../filter-transition";
import { TrendChart } from "../../trend-chart";
import { DailyTable } from "./daily-table";
import { ActivityHeatmapCard, HashtagTable, NewViewerRatioCard, VideoList } from "./detail-widgets";
import { ManualEntryForm } from "./manual-entry-form";

const HISTORY_DAYS = 180;

type SearchParams = Promise<{ from?: string; to?: string }>;

export default async function ChannelDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return null; // layout already redirects signed-out visitors

  const supabase = await createSupabaseServerClient();
  const [channel] = await listChannels(supabase, { channelId: id });
  if (!channel) notFound();

  const search = await searchParams;
  const { from, to } = resolvePeriodParamsAllTime(search);
  const { comparedFrom, comparedTo } = previousPeriod(from, to);
  const historyFrom = addDaysToDateString(to, -(HISTORY_DAYS - 1));
  const trendFrom = isoWeekStart(addDaysToDateString(to, -55));

  const [ownershipStart, periodStats, historyRows, postedDates, heatmap, videos] = await Promise.all([
    getCurrentOwnershipStart(supabase, id),
    getChannelPeriodStats(supabase, { channelIds: [id], from, to, comparedFrom, comparedTo }),
    fetchDailyRows(supabase, [id], historyFrom, to),
    fetchPostedVnDates(supabase, [id], historyFrom, to),
    fetchActivityHeatmap(supabase, id),
    fetchChannelVideos(supabase, id),
  ]);

  const stat = periodStats.get(id);
  // Week granularity is a subset of the 180-day fetch above (same pattern as getDashboard()) — no
  // second query for it.
  const trendRows = historyRows.filter((r) => r.date >= trendFrom);
  const trendPostedDates = postedDates.filter((d) => d >= trendFrom);
  const viewerRatio = latestViewerRatio(historyRows);
  const hashtagStats = aggregateHashtagStats(videos.map((v) => ({ hashtags: v.hashtags, views: v.latestViews })));

  return (
    <div className="px-8 py-10">
      <div className="mb-4 flex items-center gap-2 text-[13px] text-ink-3">
        <Link href="/channels" className="hover:underline">
          Kênh
        </Link>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c9c9cb" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span className="font-semibold text-ink">{channel.name}</span>
      </div>

      <FilterTransitionProvider>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-pill bg-cyan-bg text-lg font-extrabold text-cyan-ink-2">
              {initialsFromStart(channel.name)}
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-[-0.6px]">{channel.name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
                <span>{channel.tiktokHandle}</span>
                {channel.currentCreator ? (
                  <>
                    <span className="h-[3px] w-[3px] rounded-pill bg-line" />
                    <span>
                      {channel.currentCreator.name} phụ trách{ownershipStart ? ` từ ${formatFullDate(ownershipStart)}` : ""}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="h-[3px] w-[3px] rounded-pill bg-line" />
                    <span>Chưa gán Creator</span>
                  </>
                )}
                {!channel.isActive ? (
                  <span className="rounded-pill bg-line-soft px-2 py-[2px] font-semibold text-ink-2">Ngừng hoạt động</span>
                ) : null}
              </div>
            </div>
          </div>
          <DateRangePicker from={from} to={to} />
        </div>

        <FilterPendingOverlay>
          <div className="mb-3.5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Follower"
              value={stat?.followersNow !== null && stat?.followersNow !== undefined ? formatCompact(stat.followersNow) : "—"}
            />
            <StatTile
              label="Lượt xem"
              value={stat?.views !== null && stat?.views !== undefined ? formatCompact(stat.views) : "—"}
              unit="view"
            />
            <StatTile label="Video đã đăng" value={stat ? String(stat.videos) : "—"} unit="video" />
            <StatTile label="Tổng số like" value={formatCompact(stat?.totalLikes ?? 0)} unit="like" />
          </div>

          <div className="mb-3.5 grid gap-3.5 lg:grid-cols-[1fr_320px]">
            <TrendChart
              title="Diễn biến của kênh"
              tabs={[
                {
                  key: "views",
                  label: "Lượt xem",
                  points: { week: bucketWeeklyViews(trendRows), month: bucketMonthlyViews(historyRows) },
                  format: "compact",
                },
                {
                  key: "followers",
                  label: "Follower",
                  points: { week: bucketWeeklyLastFollowers(trendRows), month: bucketMonthlyLastFollowers(historyRows) },
                  format: "compact",
                },
                {
                  key: "videos",
                  label: "Video",
                  points: { week: bucketWeeklyVideoCounts(trendPostedDates), month: bucketMonthlyVideoCounts(postedDates) },
                  format: "count",
                },
              ]}
            />
            <NewViewerRatioCard ratio={viewerRatio} />
          </div>

          {/* Bảng số liệu ngày lên vị trí chính (docs/TASKS.md Đợt 2 #1) — đây là dữ liệu chi tiết,
              đáng tin nhất (thấy được từng ngày, từng nguồn, ngày nào thiếu), trước đây nằm cuối
              trang dưới cả video/hashtag ít dùng hơn. CLAUDE.md: "trả lời dữ liệu đang thế nào trước". */}
          {user.role === "manager" ? (
            <div className="mb-3.5">
              <ManualEntryForm channelId={id} todayVn={to} />
            </div>
          ) : null}
          <div className="mb-3.5">
            <DailyTable
              rows={historyRows}
              csvFilename={`${channel.tiktokHandle.replace(/^@/, "")}_${new Date().toISOString().slice(0, 10)}.csv`}
            />
          </div>

          <div className="mb-3.5 grid gap-3.5 lg:grid-cols-2">
            <ActivityHeatmapCard heatmap={heatmap} />
            <HashtagTable stats={hashtagStats} />
          </div>

          <div>
            {/* channel.latestStats.videos is TikTok's own reported total (data_snapshot.video_count via
                v_channel_latest) — already fetched by listChannels() above, just never surfaced before. */}
            <VideoList videos={videos} totalVideoCount={channel.latestStats?.videos ?? null} />
          </div>
        </FilterPendingOverlay>
      </FilterTransitionProvider>
    </div>
  );
}
