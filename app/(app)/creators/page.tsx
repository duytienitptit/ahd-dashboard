import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { listCreators } from "@/lib/creators";
import { aggregateChannelStats, buildCreatorPerformance, getChannelPeriodStats, previousPeriod, rankCreatorPerformance } from "@/lib/dashboard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listTeams } from "@/lib/teams";
import { resolvePeriodParamsAllTime } from "@/lib/time";

import { CreateCreatorForm, TeamManager } from "./creator-form";
import { DateRangePicker } from "../date-range-picker";
import { FilterPendingOverlay, FilterTransitionProvider } from "../filter-transition";
import { TeamAccordion, type TeamGroupData } from "./team-accordion";

type SearchParams = Promise<{ from?: string; to?: string }>;

// Manager-only screen (docs/USER_FLOW.md: "Tạo tài khoản Creator — Có / Ẩn"). RLS lets a Creator
// read the creator table too (cross-channel visibility is deliberate elsewhere), but this specific
// management screen — with the "tạo tài khoản" action — is not meant for them.
export default async function CreatorsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  if (user.role !== "manager") redirect("/");

  const params = await searchParams;
  const { from, to } = resolvePeriodParamsAllTime(params);

  const supabase = await createSupabaseServerClient();
  const [creators, teams] = await Promise.all([listCreators(supabase), listTeams(supabase)]);
  const totalChannels = creators.reduce((sum, creator) => sum + creator.channelCount, 0);

  const { comparedFrom, comparedTo } = previousPeriod(from, to);
  const allChannelIds = creators.flatMap((c) => c.channels.map((ch) => ch.id));
  const stats = await getChannelPeriodStats(supabase, { channelIds: allChannelIds, from, to, comparedFrom, comparedTo });

  const performanceByCreator = buildCreatorPerformance(creators, stats);

  // Ranked over ALL creators, never narrowed to one team's members — a badge earned by being #1
  // company-wide must not silently mean something else (or vanish) depending on which screen you're
  // looking at (bug in the old /creators vs /creators/team/[id] split, fixed by always ranking here
  // once and passing the result down).
  const ranks = rankCreatorPerformance(
    creators.map((c) => {
      const perf = performanceByCreator.get(c.id)!;
      return { creatorId: c.id, totalViews: perf.totalViews, avgViewsDeltaPct: perf.viewsDeltaPct, channelCount: c.channelCount };
    }),
  );

  const teamOptions = teams.map((t) => ({ id: t.id, name: t.name }));

  // Every creator (active AND disabled) lands in exactly one group — disabled accounts used to be
  // pulled out into a separate page-level <details>; now they just sort to the end of their own
  // team's panel (21/08/2026 follow-up: a disabled account's team membership is still worth seeing
  // at a glance, and a whole extra collapsed section was one more click for very little).
  function toRow(creator: (typeof creators)[number]) {
    const perf = performanceByCreator.get(creator.id)!;
    return {
      id: creator.id,
      name: creator.name,
      username: creator.username,
      isActive: creator.isActive,
      team: creator.team,
      channels: creator.channels,
      totalViews: perf.totalViews,
      followersNow: perf.followersNow,
      videos: perf.videos,
      rank: ranks.get(creator.id) ?? "stable",
    };
  }

  function sortRows(rows: ReturnType<typeof toRow>[]) {
    const active = rows.filter((r) => r.isActive).sort((a, b) => b.totalViews - a.totalViews);
    const disabled = rows.filter((r) => !r.isActive).sort((a, b) => b.totalViews - a.totalViews);
    return [...active, ...disabled];
  }

  const groups: TeamGroupData[] = [
    ...teams.map((t) => {
      const teamCreators = creators.filter((c) => c.team?.id === t.id);
      const teamChannelIds = teamCreators.flatMap((c) => c.channels.map((ch) => ch.id));
      return {
        id: t.id,
        name: t.name,
        rollup: aggregateChannelStats(teamChannelIds, stats),
        creators: sortRows(teamCreators.map(toRow)),
      };
    }),
    {
      id: null,
      name: null,
      rollup: aggregateChannelStats(
        creators.filter((c) => !c.team).flatMap((c) => c.channels.map((ch) => ch.id)),
        stats,
      ),
      creators: sortRows(creators.filter((c) => !c.team).map(toRow)),
    },
  ].filter((g) => g.creators.length > 0);

  return (
    <div className="px-8 py-10">
      <FilterTransitionProvider>
        {/* items-start, not items-end: bên phải đổi giữa nút thấp và form cao hơn khi mở "+ Tạo tài
            khoản" — items-end sẽ làm tiêu đề nhảy theo mỗi lần đổi cao độ. Cùng lý do và bố cục với
            "/channels" (title+subtitle trái, DateRangePicker + nút tạo phải) — Nhân sự trước đây đặt
            "+ Tạo tài khoản" thành khối riêng phía dưới, đọc lạc lõng giữa trang. */}
        <div className="mb-[18px] flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-[-0.6px]">Nhân sự</h1>
            <p className="mt-1.5 text-[13px] text-ink-3">
              {creators.length} Creator đang phụ trách {totalChannels} kênh
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker from={from} to={to} />
            <CreateCreatorForm teams={teamOptions} />
          </div>
        </div>

        <TeamManager teams={teams} />

        <FilterPendingOverlay>
          {creators.length === 0 ? (
            <div className="rounded-card border border-line px-5 py-10 text-center text-sm text-ink-3">
              Chưa có Creator nào.
            </div>
          ) : (
            <TeamAccordion groups={groups} teams={teamOptions} />
          )}
        </FilterPendingOverlay>
      </FilterTransitionProvider>
    </div>
  );
}
