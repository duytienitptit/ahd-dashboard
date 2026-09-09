import Link from "next/link";

import type { KpiCycleWithProgress } from "@/lib/kpi";

import { KpiHealthBadge } from "../../kpi/kpi-widgets";

type ChannelRef = { id: string; name: string };

/** Thứ tự hàng: kênh cần chú ý nhất trước — đỏ → vàng → xanh → chưa đặt KPI. Trong mỗi nhóm giữ
 *  nguyên thứ tự `channels` truyền vào. */
const HEALTH_SORT: Record<string, number> = { red: 0, yellow: 1, green: 2 };

/**
 * "Tiến độ KPI các kênh" trên trang chi tiết Nhân sự (`/creators/[id]`) — mỗi kênh người này phụ
 * trách một dòng: badge 🟢🟡🔴 + "cần X/ngày". Đặt SAU biểu đồ xu hướng, TRƯỚC bảng "Kênh phụ trách"
 * (CLAUDE.md: "trả lời dữ liệu đang thế nào trước, rồi mới đến có đạt chỉ tiêu không").
 *
 * Chỉ tính chu kỳ ĐANG CHẠY (`activeOnly` ở chỗ gọi). Kênh không có chu kỳ nào đang chạy → dòng
 * "Chưa đặt KPI" + link tạo. `cycles` đã kèm `progress`/`health` (`attachProgress`).
 */
export function CreatorKpiCard({
  channels,
  cycles,
  canManage,
}: {
  channels: ChannelRef[];
  cycles: KpiCycleWithProgress[];
  /** `false` for a Creator viewing the page — the "+ Đặt KPI" link is Manager-only and would just
   *  bounce a Creator off `/kpi/new` (09/09/2026). */
  canManage: boolean;
}) {
  const cycleByChannel = new Map(cycles.map((c) => [c.channelId, c]));
  const withKpi = cycles.length;
  const onTrack = cycles.filter((c) => c.health.value === "green").length;
  const atRisk = cycles.filter((c) => c.health.value === "yellow").length;
  const behind = cycles.filter((c) => c.health.value === "red").length;

  const rows = channels
    .map((ch) => ({ ch, cycle: cycleByChannel.get(ch.id) ?? null }))
    .sort((a, b) => {
      if (!a.cycle && !b.cycle) return 0;
      if (!a.cycle) return 1;
      if (!b.cycle) return -1;
      return HEALTH_SORT[a.cycle.health.value] - HEALTH_SORT[b.cycle.health.value];
    });

  return (
    <div className="rounded-card border border-line px-5 py-[18px]">
      <div className="text-[15px] font-bold">Tiến độ KPI các kênh</div>
      <div className="mt-[3px] text-xs text-ink-3">Chỉ tính chu kỳ đang chạy — bấm tên kênh để xem chi tiết</div>

      {channels.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-ink-3">Chưa phụ trách kênh nào.</p>
      ) : (
        <>
          {withKpi > 0 ? (
            <div className="mb-3.5 mt-4 flex items-baseline gap-2">
              <span className="text-[22px] font-extrabold leading-none tracking-[-0.8px]">
                {onTrack}/{withKpi}
              </span>
              <span className="text-[12px] text-ink-3">kênh đạt tiến độ</span>
              <span className="ml-1 flex items-center gap-2.5 text-[11px] text-ink-3">
                {atRisk > 0 ? (
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-pill bg-amber" />
                    {atRisk} cần chú ý
                  </span>
                ) : null}
                {behind > 0 ? (
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-pill bg-red" />
                    {behind} tụt lại
                  </span>
                ) : null}
              </span>
            </div>
          ) : (
            <p className="mb-3 mt-4 text-[12.5px] text-ink-3">Chưa kênh nào của nhân sự này có chu kỳ KPI đang chạy.</p>
          )}

          <div className="flex flex-col divide-y divide-line-soft">
            {rows.map(({ ch, cycle }) => (
              <div key={ch.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0">
                <Link href={`/channels/${ch.id}`} className="text-[13px] font-semibold hover:underline">
                  {ch.name}
                </Link>
                {cycle ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-[11.5px] text-ink-3">{cycle.remaining.text}</span>
                    <KpiHealthBadge health={cycle.health} />
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 text-[11.5px]">
                    <span className="text-ink-3">Chưa đặt KPI</span>
                    {canManage ? (
                      <Link href={`/kpi/new?channelId=${ch.id}`} className="font-bold text-red hover:opacity-80">
                        + Đặt KPI
                      </Link>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
