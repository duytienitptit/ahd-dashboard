import type { AppRole } from "@/lib/auth";
import { type ChannelSummary, listChannels } from "@/lib/channels";
import { listCreators } from "@/lib/creators";
import {
  buildCreatorPerformance,
  getChannelPeriodStats,
  isoWeekStart,
  previousPeriod,
  rankCreatorPerformance,
} from "@/lib/dashboard";
import { formatFullDate } from "@/lib/format";
import { attachProgress, listKpiCycles } from "@/lib/kpi";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { addDaysToDateString, nowVnDateString, resolvePeriodParamsAllTime } from "@/lib/time";

import type { AppNotification } from "./notification-log";

export type { AppNotification } from "./notification-log";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Tính danh sách thông báo ĐANG liên quan tới `user` — chạy mỗi lần vào Tổng quan (`/`). Client
 * (`lib/notification-log.ts`) gộp vào nhật ký `localStorage` và nhớ "đã đọc" theo `id`.
 *
 * Các loại hiện có:
 *  • `leader_flex`     — top 1 view (mọi người). Creator: giọng chọc ghẹo; Manager: câu trang trọng.
 *  • `runner_up`       — chỉ Creator đang đứng top 2/3 view, lời động viên.
 *  • `import_reminder` — thứ Tư hằng tuần, **chỉ Creator** (người thật sự nộp file). Manager không nộp.
 *  • `import_missing`  — **chỉ Manager**, từ thứ Tư tới hết tuần: nêu đích danh ai chưa nộp file tuần
 *                       trước. `repeat` — hiện lại tới khi mọi người đã nộp.
 *  • `kpi_assigned`    — Creator vừa được giao KPI cho kênh mình phụ trách.
 *  • `kpi_achieved`    — kênh đạt 100% KPI: Manager (câu trung tính) + Creator của kênh (câu vui).
 *
 * **Giọng theo vai trò** (09/09/2026, theo yêu cầu): `formal = user.role === "manager"` → mọi câu
 * chữ + icon Manager thấy đều lịch sự, nghiêm túc; Creator giữ giọng vui.
 *
 * `repeat: true` cho thông báo **THỨ HẠNG** (`leader_flex`, `runner_up`) và **`import_missing`** —
 * hiện lại modal mỗi lần vào Tổng quan, kể cả đã bấm "Đã xem". Loại khác (`import_reminder`, `kpi_*`)
 * hiện một lần rồi thôi; `id` đổi thì hiện lại (thứ Tư tuần sau, chu kỳ KPI mới).
 *
 * Màu + độ "vui" từng loại: `NOTIF_STYLE` ở `lib/notification-log.ts` — client tô theo `kind`.
 * `id` mã hoá sự thật: `leader-flex:<creatorId>`, `runner-up:<creatorId>`,
 * `import-reminder:<mondayOfWeek>`, `import-missing:<mondayOfLastWeek>`, `kpi-assigned:<cycleId>`,
 * `kpi-achieved:<cycleId>`.
 */

type NotifUser = { id: string; role: AppRole };
type CreatorRef = { id: string; name: string };

/** Bảng xếp hạng nhân sự theo tổng lượt xem toàn thời gian, + ai là "leader" theo đúng
 *  `rankCreatorPerformance` (khớp huy chương 🥇 trên `/creators`). `ranked` sắp view giảm dần, chỉ
 *  gồm người có kênh; `views` là số thật (`-1` nếu chưa đo được). */
async function creatorViewStanding(
  supabase: SupabaseServerClient,
): Promise<{ leader: CreatorRef | null; ranked: { id: string; name: string; views: number }[] }> {
  const creators = await listCreators(supabase);
  const channelIds = creators.flatMap((c) => c.channels.map((ch) => ch.id));
  if (channelIds.length === 0) return { leader: null, ranked: [] };

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
  const leaderId = [...ranks.entries()].find(([, r]) => r === "leader")?.[0] ?? null;
  const leaderRow = leaderId ? creators.find((c) => c.id === leaderId) : undefined;

  const ranked = creators
    .filter((c) => c.channelCount > 0)
    .map((c) => ({ id: c.id, name: c.name, views: perf.get(c.id)!.totalViews ?? -1 }))
    .sort((a, b) => b.views - a.views);

  return { leader: leaderRow ? { id: leaderRow.id, name: leaderRow.name } : null, ranked };
}

/** Kênh đang hoạt động CHƯA có dòng `studio_import` nào trong `[from, to]` (tuần lịch trước). "Chưa
 *  nộp" = chưa chạy import lần nào cho tuần đó — không xét đủ 7 ngày hay chưa (Studio có thể thiếu
 *  ngày thật). Truy vấn thẳng `data_snapshot` như `fetchManualEntryDates`: đây là kiểm TỒN TẠI row,
 *  không phải phân giải nguồn nào thắng (nên không cần `v_channel_daily`). Trả tên người phụ trách,
 *  hoặc `kênh <tên>` nếu kênh chưa gán ai — để ghép vào câu "những người … chưa upload data". */
async function whoMissedImport(
  supabase: SupabaseServerClient,
  channels: ChannelSummary[],
  from: string,
  to: string,
): Promise<string[]> {
  const active = channels.filter((c) => c.isActive);
  if (active.length === 0) return [];

  const { data, error } = await supabase
    .from("data_snapshot")
    .select("channel_id")
    .eq("source", "studio_import")
    .gte("date", from)
    .lte("date", to)
    .in(
      "channel_id",
      active.map((c) => c.id),
    );
  if (error) throw error;

  const uploaded = new Set((data ?? []).map((r) => r.channel_id as string));
  const names = active
    .filter((c) => !uploaded.has(c.id))
    .map((c) => c.currentCreator?.name ?? `kênh ${c.name}`);
  return [...new Set(names)];
}

export async function buildNotifications(
  supabase: SupabaseServerClient,
  user: NotifUser,
): Promise<AppNotification[]> {
  const out: AppNotification[] = [];
  const isCreator = user.role === "creator";
  // Manager: giọng lịch sự, nghiêm túc. Creator: giọng vui, chọc ghẹo (09/09/2026, theo yêu cầu).
  const formal = user.role === "manager";

  // 1) leader_flex — cho mọi người.  2) runner_up — chỉ người đang top 2/3.
  const { leader, ranked } = await creatorViewStanding(supabase);
  if (leader) {
    out.push({
      id: `leader-flex:${leader.id}`,
      kind: "leader_flex",
      icon: formal ? "🏆" : "😆",
      message: formal
        ? `${leader.name} đang dẫn đầu toàn team về lượt xem.`
        : `Haha mấy con vợ, nhìn chị ${leader.name} TOP 1 của lòng tao đây lày hehe. Mấy vợ cũng cố lên nhé. Yêu các vợ❤️`,
      cta: { label: formal ? "XEM CHI TIẾT" : "XEM VÀ KHEN", href: `/creators/${leader.id}` },
      repeat: true, // thứ hạng → luôn hiện, cho cả Manager lẫn Creator
    });
  }

  const runnerUp = ranked.slice(1, 3).find((c) => c.views > 0 && c.id === user.id);
  if (isCreator && runnerUp) {
    out.push({
      id: `runner-up:${runnerUp.id}`,
      kind: "runner_up",
      icon: "😤",
      message: "Mạnh nữa lên đi em ey. Đá đít top 1 cho anh.🏌️",
      cta: leader ? { label: "XEM TOP 1", href: `/creators/${leader.id}` } : undefined,
      repeat: true,
    });
  }

  // import_reminder — thứ Tư (VN), **chỉ Creator** (người thật sự nộp file; Manager không nộp data).
  // Hiện một lần; `id` gắn với tuần nên thứ Tư tuần sau lại hiện.
  const todayVn = nowVnDateString();
  const dow = new Date(`${todayVn}T00:00:00Z`).getUTCDay(); // 0=CN, 1=T2 … 3=T4 … 6=T7
  if (isCreator && dow === 3) {
    out.push({
      id: `import-reminder:${isoWeekStart(todayVn)}`,
      kind: "import_reminder",
      icon: "🥺",
      message: "Lạy ông đi qua lạy bà đi lại. Hãy nhập dữ liệu tuần này cho con, con đói lắm rồi.",
      cta: { label: "NHẬP DỮ LIỆU", href: "/import" },
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
          icon: "🎁",
          message: `Anh nhắc em nhớ hoàn thành KPI cho kênh ${channel.name}, kỳ ${formatFullDate(cycle.periodStart)}–${formatFullDate(cycle.periodEnd)}. Mở xem chỉ tiêu nhé! Hoàn thành anh thưởng cho các bé`,
          cta: { label: "XEM KPI", href: `/channels/${channel.id}` },
        });
      }

      // kpi_achieved — đạt 100%. Báo cho Manager (bao quát mọi KPI) và Creator của kênh đó.
      const achieved = cycle.progress.overallPct !== null && cycle.progress.overallPct >= 100;
      if (achieved && (user.role === "manager" || managesThis)) {
        const pct = Math.round(cycle.progress.overallPct!);
        const creatorName = channel.currentCreator?.name;
        out.push({
          id: `kpi-achieved:${cycle.id}`,
          kind: "kpi_achieved",
          icon: formal ? "✅" : "🥳",
          message: formal
            ? `Kênh ${channel.name} đã hoàn thành KPI kỳ này (${pct}%)${creatorName ? ` — ${creatorName} phụ trách` : ""}.`
            : `Kênh ${channel.name} của bạn đã đạt KPI kỳ này (${pct}%)! Làm tốt lắm.`,
          cta: { label: "XEM", href: `/channels/${channel.id}` },
        });
      }
    }
  }

  // import_missing — CHỈ Manager, từ thứ Tư tới hết tuần lịch hiện tại: nêu đích danh ai chưa nộp
  // file Studio cho TUẦN TRƯỚC. `repeat` → hiện lại mỗi lần Manager vào Tổng quan cho tới khi mọi
  // người đã nộp (lúc đó `whoMissedImport` rỗng → không push nữa → modal tự tắt). `id` gắn với
  // thứ Hai tuần trước nên tuần sau là thông báo mới. Thứ Hai/Ba chưa tới hạn → chưa nhắc.
  if (formal) {
    const thisWeekMon = isoWeekStart(todayVn);
    if (todayVn >= addDaysToDateString(thisWeekMon, 2) /* thứ Tư */) {
      const lastWeekMon = addDaysToDateString(thisWeekMon, -7);
      const lastWeekSun = addDaysToDateString(thisWeekMon, -1);
      const missing = await whoMissedImport(supabase, channels, lastWeekMon, lastWeekSun);
      if (missing.length > 0) {
        out.push({
          id: `import-missing:${lastWeekMon}`,
          kind: "import_missing",
          icon: "😔",
          message: `Anh thật thất vọng khi những người ${missing.join(", ")} chưa upload data`,
          cta: { label: "MỞ TRANG NHẬP LIỆU", href: "/import" },
          repeat: true,
        });
      }
    }
  }

  return out;
}
