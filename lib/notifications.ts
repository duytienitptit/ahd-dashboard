import type { AppRole } from "@/lib/auth";
import { listChannels } from "@/lib/channels";
import { listCreators } from "@/lib/creators";
import {
  buildCreatorPerformance,
  getChannelPeriodStats,
  previousPeriod,
  rankCreatorPerformance,
} from "@/lib/dashboard";
import { formatFullDate } from "@/lib/format";
import { attachProgress, listKpiCycles } from "@/lib/kpi";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePeriodParamsAllTime } from "@/lib/time";

import type { AppNotification } from "./notification-log";

export type { AppNotification } from "./notification-log";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Tính danh sách thông báo ĐANG liên quan tới `user` — chạy mỗi lần vào Tổng quan (`/`). Client
 * (`lib/notification-log.ts`) gộp vào nhật ký `localStorage` và nhớ "đã đọc" theo `id`, nên cùng một
 * `id` chỉ "bắt buộc xem" một lần (khớp "vào lần đầu thì show").
 *
 * Ba loại hiện có:
 *  • `leader_flex` — top 1 view "flex" (mọi người), copy do người dùng đặt.
 *  • `kpi_assigned` — Creator vừa được giao KPI cho kênh mình phụ trách.
 *  • `kpi_achieved` — kênh đạt 100% KPI: báo cho Manager (+ Creator của kênh đó).
 *
 * `id` mã hoá sự thật: `leader-flex:<creatorId>`, `kpi-assigned:<cycleId>`, `kpi-achieved:<cycleId>`.
 * Thêm loại mới = thêm nhánh ở đây, không phải sửa client.
 */

type NotifUser = { id: string; role: AppRole };

/** Top 1 nhân sự theo tổng lượt xem toàn thời gian — cùng người nhận huy chương 🥇 "Dẫn đầu view"
 *  trên `/creators` (`rankCreatorPerformance`), để thông báo và badge không mâu thuẫn nhau. `null`
 *  khi chưa đủ 2 nhân sự có kênh, hoặc cả team chưa đo được view nào. */
async function topCreatorByViews(
  supabase: SupabaseServerClient,
): Promise<{ id: string; name: string } | null> {
  const creators = await listCreators(supabase);
  const channelIds = creators.flatMap((c) => c.channels.map((ch) => ch.id));
  if (channelIds.length === 0) return null;

  const { from, to } = resolvePeriodParamsAllTime({});
  const { comparedFrom, comparedTo } = previousPeriod(from, to);
  const stats = await getChannelPeriodStats(supabase, { channelIds, from, to, comparedFrom, comparedTo });
  const perf = buildCreatorPerformance(creators, stats);

  const ranks = rankCreatorPerformance(
    creators.map((c) => {
      const p = perf.get(c.id)!;
      return { creatorId: c.id, totalViews: p.totalViews, avgViewsDeltaPct: p.viewsDeltaPct, channelCount: c.channelCount };
    }),
  );
  const leaderId = [...ranks.entries()].find(([, r]) => r === "leader")?.[0];
  if (!leaderId) return null;

  const leader = creators.find((c) => c.id === leaderId);
  return leader ? { id: leader.id, name: leader.name } : null;
}

export async function buildNotifications(
  supabase: SupabaseServerClient,
  user: NotifUser,
): Promise<AppNotification[]> {
  const out: AppNotification[] = [];

  // 1) leader_flex — cho mọi người.
  const leader = await topCreatorByViews(supabase);
  if (leader) {
    out.push({
      id: `leader-flex:${leader.id}`,
      kind: "leader_flex",
      icon: "😆",
      message: `Haha mấy con gà, nhìn chị ${leader.name} tao đây lày hehe`,
      cta: { label: "XEM VÀ KHEN", href: `/creators/${leader.id}` },
    });
  }

  // 2) + 3) KPI — cần chu kỳ đang chạy + tên kênh + ai phụ trách.
  const [activeCycles, channels] = await Promise.all([
    listKpiCycles(supabase, { activeOnly: true }),
    listChannels(supabase),
  ]);
  if (activeCycles.length > 0) {
    const channelById = new Map(channels.map((c) => [c.id, c]));
    const withProgress = await attachProgress(supabase, activeCycles);

    for (const cycle of withProgress) {
      const channel = channelById.get(cycle.channelId);
      if (!channel) continue;
      const managesThis = user.role === "creator" && channel.currentCreator?.id === user.id;

      // kpi_assigned — chỉ Creator của kênh đó.
      if (managesThis) {
        out.push({
          id: `kpi-assigned:${cycle.id}`,
          kind: "kpi_assigned",
          icon: "🎯",
          message: `Bạn được giao KPI cho kênh ${channel.name}, kỳ ${formatFullDate(cycle.periodStart)}–${formatFullDate(cycle.periodEnd)}. Mở xem chỉ tiêu nhé!`,
          cta: { label: "XEM KPI", href: `/channels/${channel.id}` },
        });
      }

      // kpi_achieved — đạt 100%. Báo cho Manager (bao quát mọi KPI) và Creator của kênh đó.
      const achieved = cycle.progress.overallPct !== null && cycle.progress.overallPct >= 100;
      if (achieved && (user.role === "manager" || managesThis)) {
        const who = channel.currentCreator?.name ? ` ${channel.currentCreator.name} làm tốt lắm!` : "";
        out.push({
          id: `kpi-achieved:${cycle.id}`,
          kind: "kpi_achieved",
          icon: "🎉",
          message: `Kênh ${channel.name} đã đạt KPI kỳ này (${Math.round(cycle.progress.overallPct!)}%).${who}`,
          cta: { label: "XEM", href: `/channels/${channel.id}` },
        });
      }
    }
  }

  return out;
}
