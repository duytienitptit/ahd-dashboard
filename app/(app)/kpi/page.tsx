import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { listChannels } from "@/lib/channels";
import { attachProgress, listKpiCycles, type KpiCycleWithProgress } from "@/lib/kpi";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { nowVnDateString } from "@/lib/time";

import { KpiCard } from "../channels/[id]/kpi-card";

/**
 * Channel-first (26/08/2026, theo yêu cầu — trước đó là danh sách CHU KỲ nhóm theo Đang chạy/Sắp
 * tới/Đã qua). Đúng tinh thần CLAUDE.md "dữ liệu kênh trước, KPI sau, đừng lấy % KPI làm trục sắp
 * xếp mặc định": mỗi kênh luôn có đúng 1 dòng, kể cả kênh chưa từng đặt KPI — không rớt khỏi trang
 * chỉ vì chưa có chu kỳ nào. Không sắp lại theo % hay theo trạng thái — giữ nguyên thứ tự
 * `listChannels()` (theo tên).
 *
 * Dùng lại nguyên `KpiCard` — component đã có sẵn từ M5 cho trang chi tiết kênh (đủ cả active
 * cycle + "Các kỳ trước" + cảnh báo dataGaps), chỉ thêm phần header tên/handle kênh cho ngữ cảnh
 * liệt kê nhiều kênh. Nhờ vậy màn "Chưa có KPI cho kênh này" + cảnh báo thiếu dữ liệu vốn chỉ nằm ở
 * trang chi tiết kênh nay cũng tự nhiên có luôn ở đây — không cần viết lại.
 *
 * M/C — Manager thấy mọi kênh; Creator chỉ thấy (nhiều nhất) đúng kênh mình phụ trách (nav "KPI của
 * tôi", docs/USER_FLOW.md). Scoping ở tầng server cho cả 2 query, không dựa vào RLS (kpi_cycle's RLS
 * cho mọi vai trò đọc toàn bộ, giống mọi bảng nghiệp vụ khác).
 */
export default async function KpiPage() {
  const user = await requireUser();
  const isManager = user.role === "manager";
  const creatorId = isManager ? undefined : user.id;

  const supabase = await createSupabaseServerClient();
  // 2 query độc lập, không phải 1-query-mỗi-kênh: listKpiCycles({creatorId}) đã tự resolve về đúng
  // tập kênh của Creator (hoặc toàn bộ nếu Manager) trong 1 lượt, attachProgress tính progress cho
  // TOÀN BỘ cycle trong 1 cặp round-trip rồi mới chia theo kênh ở dưới — cùng cách làm
  // buildDashboardKpiSummary (lib/kpi.ts) đã dùng, tránh N+1 khi trang có tới 9 kênh.
  const [channels, cycles] = await Promise.all([
    listChannels(supabase, { creatorId }),
    listKpiCycles(supabase, { creatorId }),
  ]);
  const withProgress = await attachProgress(supabase, cycles);

  const cyclesByChannel = new Map<string, KpiCycleWithProgress[]>();
  for (const cycle of withProgress) {
    const list = cyclesByChannel.get(cycle.channelId);
    if (list) list.push(cycle);
    else cyclesByChannel.set(cycle.channelId, [cycle]);
  }

  const today = nowVnDateString();

  return (
    <div className="px-8 py-10">
      <div className="mb-[18px] flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.6px]">{isManager ? "KPI" : "KPI của tôi"}</h1>
          <p className="mt-1.5 text-[13px] text-ink-3">{channels.length} kênh</p>
        </div>
        {isManager ? (
          <Link
            href="/kpi/new"
            className="flex h-[38px] items-center rounded-btn bg-red px-[18px] text-sm font-bold text-white hover:opacity-90"
          >
            + Đặt KPI mới
          </Link>
        ) : null}
      </div>

      {channels.length === 0 ? (
        <div className="rounded-card border border-line px-5 py-10 text-center text-sm text-ink-3">
          {isManager ? "Chưa có kênh nào." : "Bạn chưa được phân công phụ trách kênh nào."}
        </div>
      ) : (
        channels.map((channel, i) => {
          const channelCycles = cyclesByChannel.get(channel.id) ?? [];
          const activeCycle = channelCycles.find((c) => c.periodStart <= today && today <= c.periodEnd) ?? null;
          const pastCycles = channelCycles.filter((c) => c.id !== activeCycle?.id).slice(0, 3);

          return (
            <KpiCard
              key={channel.id}
              channelId={channel.id}
              channelName={channel.name}
              isManager={isManager}
              activeCycle={activeCycle}
              pastCycles={pastCycles}
              header={{ tiktokHandle: channel.tiktokHandle, avatarIndex: i }}
            />
          );
        })
      )}
    </div>
  );
}
