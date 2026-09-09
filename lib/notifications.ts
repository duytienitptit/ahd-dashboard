import { listCreators } from "@/lib/creators";
import {
  buildCreatorPerformance,
  getChannelPeriodStats,
  previousPeriod,
  rankCreatorPerformance,
} from "@/lib/dashboard";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePeriodParamsAllTime } from "@/lib/time";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Cơ chế thông báo — cố tình tối giản (08/09/2026, theo yêu cầu: "chỉ cần có cơ chế trước, sau này
 * thêm nhiều loại"). Một thông báo = một `AppNotification`; `buildNotifications` gom mọi loại, client
 * `NotificationHost` hiện từng cái một và nhớ "đã tắt" trong `localStorage` theo `id`.
 *
 * `id` phải đổi khi SỰ THẬT đứng sau nó đổi (vd. `leader-flex:<creatorId>` — top 1 đổi người → id
 * mới → hiện lại). Cùng một id đã tắt thì không hiện lại nữa (khớp "vào lần đầu thì show").
 */
export type AppNotification = {
  id: string;
  /** Emoji hiển thị to bên trái. */
  icon: string;
  message: string;
  /** Nút hành động — bỏ qua nếu không cần. `href` là link nội bộ. */
  cta?: { label: string; href: string };
};

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

export async function buildNotifications(supabase: SupabaseServerClient): Promise<AppNotification[]> {
  const out: AppNotification[] = [];

  // Loại đầu tiên: top 1 "flex" — copy do người dùng đặt (08/09/2026).
  const leader = await topCreatorByViews(supabase);
  if (leader) {
    out.push({
      id: `leader-flex:${leader.id}`,
      icon: "😆",
      message: `Haha mấy con gà, nhìn chị ${leader.name} tao đây lày hehe`,
      cta: { label: "XEM VÀ KHEN", href: `/creators/${leader.id}` },
    });
  }

  return out;
}
