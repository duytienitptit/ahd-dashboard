import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { listCreators } from "@/lib/creators";
import {
  aggregateChannelStats,
  bucketMonthlyLastFollowers,
  bucketMonthlyVideoCounts,
  bucketMonthlyViews,
  bucketWeeklyLastFollowers,
  bucketWeeklyVideoCounts,
  bucketWeeklyViews,
  buildCreatorPerformance,
  fetchDailyRows,
  fetchPostedVnDates,
  getChannelPeriodStats,
  isoWeekStart,
  mergeDailyRowsByDate,
  pctChange,
  previousPeriod,
} from "@/lib/dashboard";
import { formatCompact, formatDeltaPct, formatSignedNumber, initialsFromEnd } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listTeams } from "@/lib/teams";
import { addDaysToDateString, resolvePeriodParams } from "@/lib/time";

import { EyeIcon, HeartIcon, StatTile, UsersIcon, VideoIcon } from "../../dashboard-widgets";
import { DateRangePicker } from "../../date-range-picker";
import { DailyTable } from "../../channels/[id]/daily-table";
import { FilterPendingOverlay, FilterTransitionProvider } from "../../filter-transition";
import { TrendChart } from "../../trend-chart";
import { CreatorChannelsTable } from "./creator-channels-table";
import { CreatorEditToggle } from "./edit-toggle";

const HISTORY_DAYS = 180;

type SearchParams = Promise<{ from?: string; to?: string }>;

// Manager-only, same rule as /creators. The drill-down target /creators' rows never had before this
// redesign — a Creator's channels used to be dead-end <span>s (CLAUDE.md, this session's feedback).
export default async function CreatorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  if (user.role !== "manager") redirect("/");

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

  const [periodStats, historyRows, postedDates] = await Promise.all([
    getChannelPeriodStats(supabase, { channelIds, from, to, comparedFrom, comparedTo }),
    fetchDailyRows(supabase, channelIds, historyFrom, to),
    fetchPostedVnDates(supabase, channelIds, historyFrom, to),
  ]);

  const rollup = aggregateChannelStats(channelIds, periodStats);
  const channelPerformance = buildCreatorPerformance([creator], periodStats).get(creator.id)!.channels;

  // Trend buckets take the RAW multi-channel rows directly, never mergeDailyRowsByDate's output —
  // bucketWeeklyLastFollowers/bucketMonthlyLastFollowers already resolve "each channel's own last
  // known value that bucket, summed" via groupByChannel internally (see their docstrings). Feeding
  // them pre-merged rows would instead take the last MERGED date's total, silently undercounting any
  // bucket where the creator's channels last synced on different days within it.
  const trendRows = historyRows.filter((r) => r.date >= trendFrom);
  const trendPostedDates = postedDates.filter((d) => d >= trendFrom);

  // DailyTable is the one place that DOES want one row per date — mergeDailyRowsByDate's null-vs-0
  // and weakest-source rules exist specifically for this collapsed view.
  const mergedHistory = mergeDailyRowsByDate(historyRows, channelIds.length);

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
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-pill bg-line-soft text-lg font-extrabold text-ink-2">
              {initialsFromEnd(creator.name)}
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-[-0.6px]">{creator.name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
                <span>{creator.username}</span>
                <span className="h-[3px] w-[3px] shrink-0 rounded-pill bg-line" />
                <Link href={teamHref} className="font-semibold hover:underline">
                  {teamLabel}
                </Link>
                {!creator.isActive ? (
                  <span className="rounded-pill bg-line-soft px-2 py-[2px] font-semibold text-ink-2">Đã vô hiệu hoá</span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DateRangePicker from={from} to={to} />
            <CreatorEditToggle creator={creator} teams={teamOptions} />
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

          <div className="mb-3.5">
            <TrendChart
              title="Diễn biến"
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
          </div>

          <div className="mb-3.5">
            <CreatorChannelsTable channels={channelPerformance} />
          </div>

          <div>
            <DailyTable
              rows={mergedHistory}
              csvFilename={`${creator.name.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`}
              subtitle="Mỗi ngày một bản ghi, tổng hợp mọi kênh phụ trách — nguồn ưu tiên thấp nhất trong ngày đó"
              emptyText="Chưa có số liệu ngày nào cho nhân sự này."
            />
          </div>
        </FilterPendingOverlay>
      </FilterTransitionProvider>
    </div>
  );
}
