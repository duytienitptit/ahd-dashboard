import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { listCreators } from "@/lib/creators";
import { getChannelPeriodStats, pctChange, previousPeriod, rankCreatorPerformance, type ChannelPeriodStat } from "@/lib/dashboard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addDaysToDateString, nowVnDateString } from "@/lib/time";

import { CreateCreatorForm, CreatorCard, type CreatorPerformance } from "./creator-form";

// Manager-only screen (docs/USER_FLOW.md: "Tạo tài khoản Creator — Có / Ẩn"). RLS lets a Creator
// read the creator table too (cross-channel visibility is deliberate elsewhere), but this specific
// management screen — with the "tạo tài khoản" action — is not meant for them.
export default async function CreatorsPage() {
  const user = await requireUser();
  if (user.role !== "manager") redirect("/");

  const supabase = await createSupabaseServerClient();
  const creators = await listCreators(supabase);
  const totalChannels = creators.reduce((sum, creator) => sum + creator.channelCount, 0);

  const to = nowVnDateString();
  const from = addDaysToDateString(to, -6);
  const { comparedFrom, comparedTo } = previousPeriod(from, to);
  const allChannelIds = creators.flatMap((c) => c.channels.map((ch) => ch.id));
  const stats = await getChannelPeriodStats(supabase, { channelIds: allChannelIds, from, to, comparedFrom, comparedTo });

  const performanceByCreator = new Map<string, CreatorPerformance>();
  for (const creator of creators) {
    const channelStats = creator.channels.map((ch) => ({ channel: ch, stat: stats.get(ch.id) }));
    const sum = (pick: (s: ChannelPeriodStat) => number) =>
      channelStats.reduce((acc, { stat }) => acc + (stat ? pick(stat) : 0), 0);

    const totalViews = sum((s) => s.views);
    const previousViews = sum((s) => s.previousViews);

    performanceByCreator.set(creator.id, {
      totalViews,
      viewsDeltaPct: pctChange(totalViews, previousViews),
      followerGain: sum((s) => s.followersGain ?? 0),
      engagementRate: totalViews > 0 ? (sum((s) => s.likes) + sum((s) => s.comments) + sum((s) => s.shares)) / totalViews : null,
      channels: channelStats.map(({ channel, stat }) => ({
        id: channel.id,
        name: channel.name,
        tiktokHandle: channel.tiktokHandle,
        views: stat?.views ?? 0,
        viewsDeltaPct: stat?.viewsDeltaPct ?? null,
      })),
    });
  }

  const ranks = rankCreatorPerformance(
    creators.map((c) => {
      const perf = performanceByCreator.get(c.id)!;
      return { creatorId: c.id, totalViews: perf.totalViews, avgViewsDeltaPct: perf.viewsDeltaPct, channelCount: c.channelCount };
    }),
  );

  return (
    <div className="px-8 py-10">
      <div className="mb-[18px] flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.6px]">Creator</h1>
          <p className="mt-1.5 text-[13px] text-ink-3">
            {creators.length} Creator đang phụ trách {totalChannels} kênh · 7 ngày gần nhất
          </p>
        </div>
      </div>

      <CreateCreatorForm />

      {creators.length === 0 ? (
        <div className="rounded-card border border-line px-5 py-10 text-center text-sm text-ink-3">
          Chưa có Creator nào.
        </div>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2">
          {creators.map((creator) => (
            // This page redirects non-Managers above, so isManager is always true here — kept as an
            // explicit prop (not hardcoded in CreatorCard) so the component stays reusable if a
            // read-only view is ever needed elsewhere.
            <CreatorCard
              key={creator.id}
              creator={creator}
              isManager
              performance={performanceByCreator.get(creator.id)!}
              rank={ranks.get(creator.id) ?? "stable"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
