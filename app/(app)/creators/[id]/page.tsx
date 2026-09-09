import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { listCreators } from "@/lib/creators";
import {
  aggregateChannelStats,
  bucketDailyLastFollowers,
  bucketDailyVideoCounts,
  bucketDailyViews,
  bucketMonthlyLastFollowers,
  bucketMonthlyVideoCounts,
  bucketMonthlyViews,
  bucketWeeklyLastFollowers,
  bucketWeeklyVideoCounts,
  bucketWeeklyViews,
  type DayWindow,
  latestDateOf,
  buildCreatorPerformance,
  fetchDailyRows,
  fetchPostedVnDates,
  getChannelPeriodStats,
  isoWeekStart,
  pctChange,
  previousPeriod,
  rankCreatorsAllTime,
  withUnfinishedMarks,
} from "@/lib/dashboard";
import { formatCompact, formatDeltaPct, formatSignedNumber } from "@/lib/format";
import { attachProgress, listKpiCycles } from "@/lib/kpi";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listTeams } from "@/lib/teams";
import { addDaysToDateString, resolvePeriodParams } from "@/lib/time";

import { EyeIcon, HeartIcon, StatTile, UsersIcon, VideoIcon } from "../../dashboard-widgets";
import { DateRangePicker } from "../../date-range-picker";
import { FilterPendingOverlay, FilterTransitionProvider } from "../../filter-transition";
import { TrendChart } from "../../trend-chart";
import { CreatorChannelsTable } from "./creator-channels-table";
import { CreatorKpiCard } from "./creator-kpi-card";
import { CreatorEditToggle } from "./edit-toggle";
import { CreatorAvatar, LeaderBadge } from "./leader-badge";

const HISTORY_DAYS = 180;

type SearchParams = Promise<{ from?: string; to?: string }>;

// Both roles, same rule as /creators (09/09/2026). A Creator sees it read-only: the "Sửa thông tin"
// toggle and the "+ Đặt KPI" link are gated on `isManager`. Everything else on the page —
// StatTiles, trend chart, KPI health, channels table — is built from data a Creator can already
// reach via /channels; this view just groups it by the person running the channels.
export default async function CreatorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const isManager = user.role === "manager";

  const { id } = await params;
  const search = await searchParams;
  // "7 ngày qua" (so với tuần trước), không phải "Toàn bộ thời gian" — mặc định khác các trang còn
  // lại (24/08/2026, theo yêu cầu riêng cho trang này): "Toàn bộ thời gian" không có kỳ trước để so,
  // nên mọi badge %thay đổi ở đây luôn hiện "—"/"0" ngay khi vào trang.
  const { from, to } = resolvePeriodParams(search, 7);

  const supabase = await createSupabaseServerClient();
  const [creators, teams] = await Promise.all([listCreators(supabase), listTeams(supabase)]);
  const creator = creators.find((c) => c.id === id);
  if (!creator) notFound();

  const { comparedFrom, comparedTo } = previousPeriod(from, to);
  // Anchored to the picker's `to`, not real "now" — same convention getDashboard() uses once a
  // DateRangePicker is in play (unlike channels/[id]/page.tsx, which has no picker and is always
  // "today"-anchored). Picking a past date range shifts the trend chart's window along with it.
  const historyFrom = addDaysToDateString(to, -(HISTORY_DAYS - 1));
  const trendFrom = isoWeekStart(addDaysToDateString(to, -55));
  const channelIds = creator.channels.map((ch) => ch.id);

  const [periodStats, historyRows, postedDates, kpiCycles, creatorRanks] = await Promise.all([
    getChannelPeriodStats(supabase, { channelIds, from, to, comparedFrom, comparedTo }),
    fetchDailyRows(supabase, channelIds, historyFrom, to),
    fetchPostedVnDates(supabase, channelIds, historyFrom, to),
    // Chỉ chu kỳ đang chạy — cho thẻ "Tiến độ KPI các kênh". Độc lập với `from`/`to` của bộ lọc
    // trang (chu kỳ KPI có ngày riêng, xem KpiCard's doc comment).
    listKpiCycles(supabase, { creatorId: id, activeOnly: true }),
    // Xếp hạng toàn team (all-time) — chỉ để gắn cúp 🏆 "TOP 1" nếu người này đang dẫn đầu lượt xem.
    // Khớp huy chương 🥇 ở `/creators` + thông báo `leader_flex` (cùng `rankCreatorsAllTime`).
    rankCreatorsAllTime(supabase, creators),
  ]);
  const kpiWithProgress = await attachProgress(supabase, kpiCycles);
  const isLeader = creatorRanks.get(id) === "leader";

  const rollup = aggregateChannelStats(channelIds, periodStats);
  const channelPerformance = buildCreatorPerformance([creator], periodStats).get(creator.id)!.channels;

  // Trend buckets take the RAW multi-channel rows directly — bucketWeeklyLastFollowers/
  // bucketMonthlyLastFollowers resolve "each channel's own last known value that bucket, summed" via
  // groupByChannel internally (see their docstrings), so a creator's channels last syncing on
  // different days within a bucket still roll up correctly.
  const trendRows = historyRows.filter((r) => r.date >= trendFrom);
  // `withUnfinishedMarks` kéo dài chuỗi tới kỳ chứa `to` (luôn có cột "tuần này"), cắt còn 8 tuần /
  // 6 tháng, và đánh dấu cột cuối dở dang để biểu đồ vẽ nét đứt thay vì đọc như cú tụt thật.
  const trendThrough = latestDateOf(historyRows);
  const trendOpts = { now: to, through: trendThrough };
  const trendPostedDates = postedDates.filter((d) => d >= trendFrom);
  // Mốc "ngày": 14 ngày gần nhất, lọc trong bộ nhớ từ cùng 180-ngày trên (không query thêm).
  const dayFrom = addDaysToDateString(to, -13);
  const dayTrendRows = historyRows.filter((r) => r.date >= dayFrom);
  const dayTrendPostedDates = postedDates.filter((d) => d >= dayFrom);
  const dayWindow: DayWindow = { from: dayFrom, to, through: trendThrough };

  const teamHref = creator.team ? `/creators?team=${creator.team.id}` : "/creators?team=_unassigned";
  const teamLabel = creator.team?.name ?? "Chưa gán team";
  const teamOptions = teams.map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className="px-8 py-10">
      <div className="mb-4 flex items-center gap-2 text-[13px] text-ink-3">
        <Link href="/creators" className="hover:underline">
          Nhân sự
        </Link>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c9c9cb" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span className="font-semibold text-ink">{creator.name}</span>
      </div>

      <FilterTransitionProvider>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <CreatorAvatar name={creator.name} isLeader={isLeader} />
            <div>
              <h1 className="text-2xl font-extrabold tracking-[-0.6px]">{creator.name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
                {isLeader ? <LeaderBadge /> : null}
                <span>{creator.username}</span>
                <span className="h-[3px] w-[3px] shrink-0 rounded-pill bg-line" />
                <Link href={teamHref} className="font-semibold hover:underline">
                  {teamLabel}
                </Link>
                {!creator.isActive ? (
                  <span className="rounded-pill bg-line-soft px-2 py-[2px] font-semibold text-ink-2">Đã vô hiệu hoá</span>
                ) : null}
                {!isManager ? (
                  <span className="rounded-pill bg-line-soft px-2 py-[2px] font-semibold text-ink-2">Chỉ xem</span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DateRangePicker from={from} to={to} />
            {isManager ? <CreatorEditToggle creator={creator} teams={teamOptions} /> : null}
          </div>
        </div>

        <FilterPendingOverlay>
          <div className="mb-3.5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {/* null total = no measurable day, not a measured zero — "—" with a reason instead of
                the "0 view" this used to show (28/08/2026, lib/dashboard.ts `sumViewsOrNull`). */}
            <StatTile
              label="Lượt xem"
              value={rollup.totalViews !== null ? formatCompact(rollup.totalViews) : "—"}
              unit={rollup.totalViews !== null ? "view" : undefined}
              deltaText={rollup.totalViews !== null ? formatDeltaPct(rollup.viewsDeltaPct) : undefined}
              deltaGood={rollup.viewsDeltaPct === null ? null : rollup.viewsDeltaPct >= 0}
              note={
                rollup.totalViews === null
                  ? "chưa có số liệu kỳ này"
                  : rollup.viewsDeltaInsufficientData
                    ? "kỳ này chưa đủ ngày số liệu"
                    : "so với tuần trước"
              }
              icon={<EyeIcon />}
              tone="blue"
            />
            <StatTile
              label="Follower"
              value={formatCompact(rollup.followersNow)}
              unit="follower"
              deltaText={formatSignedNumber(rollup.followerGain)}
              deltaGood={rollup.followerGain >= 0}
              note="tăng trong tuần"
              icon={<UsersIcon />}
              tone="purple"
            />
            <StatTile
              label="Video đã đăng"
              value={String(rollup.videos)}
              unit="video"
              deltaText={formatDeltaPct(pctChange(rollup.videos, rollup.previousVideos))}
              deltaGood={rollup.videos >= rollup.previousVideos}
              note="so với tuần trước"
              icon={<VideoIcon />}
              tone="orange"
            />
            <StatTile label="Tổng số like" value={formatCompact(rollup.totalLikes)} unit="like" icon={<HeartIcon />} tone="crimson" />
          </div>

          {/* Biểu đồ + "Tiến độ KPI" chung một hàng (09/09/2026, theo yêu cầu) — biểu đồ hẹp lại
              cho dễ đọc nhịp, thẻ KPI thành cột phải ~340px (giống Tổng quan). Xuống 1 cột ở < lg. */}
          <div className="mb-3.5 grid items-start gap-3.5 lg:grid-cols-[1fr_340px]">
            <TrendChart
              title="Diễn biến"
              tabs={[
                {
                  key: "views",
                  label: "Lượt xem",
                  points: withUnfinishedMarks(
                    {
                      day: bucketDailyViews(dayTrendRows, dayWindow),
                      week: bucketWeeklyViews(trendRows),
                      month: bucketMonthlyViews(historyRows),
                    },
                    trendOpts,
                  ),
                  format: "compact",
                },
                {
                  key: "followers",
                  label: "Follower",
                  points: withUnfinishedMarks(
                    {
                      day: bucketDailyLastFollowers(dayTrendRows, dayWindow),
                      week: bucketWeeklyLastFollowers(trendRows),
                      month: bucketMonthlyLastFollowers(historyRows),
                    },
                    trendOpts,
                  ),
                  format: "compact",
                },
                {
                  key: "videos",
                  label: "Video",
                  points: withUnfinishedMarks(
                    {
                      day: bucketDailyVideoCounts(dayTrendPostedDates, dayWindow),
                      week: bucketWeeklyVideoCounts(trendPostedDates),
                      month: bucketMonthlyVideoCounts(postedDates),
                    },
                    trendOpts,
                  ),
                  format: "count",
                },
              ]}
            />
            <CreatorKpiCard channels={creator.channels} cycles={kpiWithProgress} canManage={isManager} />
          </div>

          <div>
            <CreatorChannelsTable channels={channelPerformance} />
          </div>
        </FilterPendingOverlay>
      </FilterTransitionProvider>
    </div>
  );
}
