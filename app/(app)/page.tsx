import { getCurrentUser } from "@/lib/auth";
import { listCreators } from "@/lib/creators";
import { getDashboard } from "@/lib/dashboard";
import { formatDeltaPct, formatSignedNumber } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePeriodParams } from "@/lib/time";

import { CreatorFilterSelect } from "./creator-filter";
import {
  DataFreshnessLine,
  EfficiencyCard,
  GrowthCard,
  KpiSummaryCard,
  MyChannelsBlock,
  TeamStatsRow,
  ViewShareCard,
} from "./dashboard-widgets";
import { DateRangePicker } from "./date-range-picker";
import { ExportCsvButton } from "./export-csv-button";
import { FilterPendingOverlay, FilterTransitionProvider } from "./filter-transition";
import { TrendChart } from "./trend-chart";

type SearchParams = Promise<{ from?: string; to?: string; creatorId?: string }>;

// Tổng quan — one route, one component, branching on role (docs/USER_FLOW.md). GET /api/dashboard
// exists as a real endpoint too (docs/API_SPEC.md), but this page calls getDashboard() directly,
// same as every other screen in app/(app)/ calling its lib/*.ts function instead of self-fetching.
export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  if (!user) return null; // layout already redirects signed-out visitors

  const params = await searchParams;
  const { from, to } = resolvePeriodParams(params);
  const creatorId = params.creatorId ?? null;

  const supabase = await createSupabaseServerClient();
  const [dashboard, creators] = await Promise.all([
    getDashboard(supabase, { role: user.role, userId: user.id, from, to, creatorId }),
    listCreators(supabase),
  ]);
  const { channelCount, teamStats } = dashboard;

  return (
    <div className="px-8 py-10">
      <FilterTransitionProvider>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-[-0.6px]">Tổng quan dữ liệu</h1>
            <DataFreshnessLine channelCount={channelCount} freshness={dashboard.dataFreshness} />
          </div>
          <div className="flex items-center gap-2">
            <CreatorFilterSelect
              creators={creators.map((c) => ({ id: c.id, name: c.name }))}
              selected={creatorId}
            />
            <DateRangePicker from={from} to={to} />
            <ExportCsvButton
              filename={`tong-quan_${from}_${to}.csv`}
              headers={["Chỉ số", "Giá trị", "So với kỳ trước"]}
              rows={[
                ["Lượt xem", teamStats.views.value, formatDeltaPct(teamStats.views.deltaPct)],
                ["Follower toàn team", teamStats.followers.value, formatSignedNumber(teamStats.followers.deltaAbs)],
                ["Video đã đăng", teamStats.videos.value, formatDeltaPct(teamStats.videos.deltaPct)],
                ["View / video", teamStats.viewsPerVideo.value, formatDeltaPct(teamStats.viewsPerVideo.deltaPct)],
                [
                  "Tỷ lệ tương tác",
                  teamStats.engagementRate.value !== null ? Math.round(teamStats.engagementRate.value * 10000) / 100 : "",
                  formatDeltaPct(teamStats.engagementRate.deltaPct),
                ],
              ]}
              label="Xuất dữ liệu"
            />
          </div>
        </div>

        <FilterPendingOverlay>
          {user.role === "creator" && dashboard.myChannels ? (
            <MyChannelsBlock myChannels={dashboard.myChannels} />
          ) : null}

          {user.role === "creator" ? (
            <div className="mb-3.5 flex items-center gap-2">
              <div className="text-[15px] font-bold">Dữ liệu toàn team</div>
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-line-soft px-2.5 py-1 text-[11.5px] font-semibold text-ink-2">
                Chỉ xem
              </span>
            </div>
          ) : null}

          <TeamStatsRow teamStats={dashboard.teamStats} />

          <div className="mb-3.5 grid gap-3.5 lg:grid-cols-[1fr_320px]">
            <TrendChart
              title="Xu hướng toàn team"
              subtitle={`${channelCount} kênh đang hoạt động · ${dashboard.trend.views.length} tuần gần nhất`}
              tabs={[
                { key: "views", label: "Lượt xem", points: dashboard.trend.views, format: "compact" },
                { key: "followers", label: "Follower", points: dashboard.trend.followers, format: "compact" },
                { key: "videos", label: "Video", points: dashboard.trend.videos, format: "count" },
              ]}
            />
            <KpiSummaryCard kpiSummary={dashboard.kpiSummary} />
          </div>

          <div className="grid gap-3.5 lg:grid-cols-3">
            <GrowthCard growth={dashboard.growth} />
            <ViewShareCard viewShare={dashboard.viewShare} />
            <EfficiencyCard efficiency={dashboard.efficiency} />
          </div>
        </FilterPendingOverlay>
      </FilterTransitionProvider>
    </div>
  );
}
