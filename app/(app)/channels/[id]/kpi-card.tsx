import Link from "next/link";

import { formatFullDate } from "@/lib/format";
import { resolveStatus, type KpiCycleWithProgress } from "@/lib/kpi";

import { KpiHealthBadge, KpiMetricBar, metricText } from "../../kpi/kpi-widgets";

const STATUS_BADGE = {
  draft: { bg: "bg-amber-bg", fg: "text-amber-dark", dot: "bg-amber", label: "Nháp" },
  final: { bg: "bg-green-bg", fg: "text-green-dark", dot: "bg-green", label: "Đã chốt" },
} as const;

/**
 * "KPI kỳ này" — M5, restores the card M4 deliberately left out (`kpi_cycle` had no rows yet, so a
 * mockup-shaped progress card would have shown fake numbers — docs/TASKS.md M4 notes). Placed as its
 * own full-width row, right after the 4 `StatTile`s and before `TrendChart`
 * (app/(app)/channels/[id]/page.tsx), not squeezed into the trend-chart/`NewViewerRatioCard` sidebar
 * row — that row's layout is unrelated M4 work, left untouched.
 */
export function KpiCard({
  channelId,
  isManager,
  activeCycle,
  pastCycles,
}: {
  channelId: string;
  isManager: boolean;
  /** The cycle covering TODAY, if any — independent of the page's date-range picker (a KPI cycle
   *  has its own fixed dates; "kỳ này" means "right now", not whatever historical window is
   *  selected for the trend chart/table below). */
  activeCycle: KpiCycleWithProgress | null;
  /** Up to 3 of the channel's other cycles, most recently ended first. */
  pastCycles: KpiCycleWithProgress[];
}) {
  if (!activeCycle && pastCycles.length === 0) {
    return (
      <div className="mb-3.5 rounded-card border border-line px-5 py-6 text-center">
        <p className="text-[13px] text-ink-3">Chưa có KPI cho kênh này.</p>
        {isManager ? (
          <Link
            href={`/kpi/new?channelId=${channelId}`}
            className="mt-2 inline-block text-[12.5px] font-bold text-red hover:opacity-80"
          >
            + Đặt KPI cho kênh này
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mb-3.5 rounded-card border border-line px-5 py-[18px]">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[15px] font-bold">KPI kỳ này</div>
        {activeCycle ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-bold ${STATUS_BADGE[activeCycle.status].bg} ${STATUS_BADGE[activeCycle.status].fg}`}
          >
            <span className={`h-1.5 w-1.5 rounded-pill ${STATUS_BADGE[activeCycle.status].dot}`} />
            {STATUS_BADGE[activeCycle.status].label}
          </span>
        ) : null}
      </div>

      {!activeCycle ? (
        <div className="py-2 text-center">
          <p className="text-[13px] text-ink-3">Không có chu kỳ KPI nào đang chạy cho kỳ hiện tại.</p>
          {isManager ? (
            <Link
              href={`/kpi/new?channelId=${channelId}`}
              className="mt-2 inline-block text-[12.5px] font-bold text-red hover:opacity-80"
            >
              + Đặt KPI mới
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <div className="mb-3 text-xs text-ink-3">
              {formatFullDate(activeCycle.periodStart)} – {formatFullDate(activeCycle.periodEnd)}
            </div>

            {/* PRODUCT_SPEC.md #7: "cần X/ngày" là chỉ số chính hiển thị cho Creator, ưu tiên hơn dự
                đoán vì là số học thuần, không bao giờ sai. */}
            <div className="rounded-input bg-line-soft px-3 py-2.5">
              <div className="text-[12.5px] font-bold">{activeCycle.remaining.text}</div>
              <div className="mt-0.5 text-[11px] text-ink-3">{activeCycle.health.explanation}</div>
            </div>

            {/* Chỉ tính từ elapsedPct >= 50 (lib/kpi.ts forecastOverallPct) — luôn ghi rõ "ước tính". */}
            {activeCycle.forecast ? (
              <p className="mt-2.5 text-[11px] leading-relaxed text-ink-3">
                Ước tính cuối kỳ (chưa chắc chắn):{" "}
                <strong className="text-ink-2">~{activeCycle.forecast.overallPct}%</strong> — {activeCycle.forecast.basis}, độ
                tin cậy {activeCycle.forecast.confidence === "medium" ? "trung bình" : "thấp"}.
              </p>
            ) : null}

            {activeCycle.dataGaps.missingDates.length > 0 ? (
              <p className="mt-2.5 rounded-input bg-amber-bg px-2.5 py-2 text-[11px] leading-relaxed text-amber-dark">
                Thiếu số liệu đáng tin cậy {activeCycle.dataGaps.missingDates.length} ngày trong kỳ — % có thể thấp hơn thực
                tế.
              </p>
            ) : null}
            {activeCycle.dataGaps.manualOnlyDates.length > 0 ? (
              <p className="mt-1.5 text-[11px] text-ink-3">
                {activeCycle.dataGaps.manualOnlyDates.length} ngày chỉ có số nhập tay (chưa xác thực).
              </p>
            ) : null}

            {isManager && activeCycle.status === "draft" ? (
              <Link
                href={`/kpi/${activeCycle.id}/edit`}
                className="mt-3 inline-block text-[12.5px] font-semibold text-red hover:opacity-80"
              >
                Sửa chu kỳ này →
              </Link>
            ) : null}
          </div>

          <div className="flex flex-col justify-center gap-3.5">
            {activeCycle.targetViews !== null ? (
              <KpiMetricBar
                label="Lượt xem"
                pct={activeCycle.progress.viewsPct}
                text={metricText(activeCycle.actuals.views, activeCycle.targetViews, "view")}
                health={resolveStatus(activeCycle.progress.viewsPct, activeCycle.health.elapsedPct).value}
              />
            ) : null}
            {activeCycle.targetVideos !== null ? (
              <KpiMetricBar
                label="Video"
                pct={activeCycle.progress.videosPct}
                text={metricText(activeCycle.actuals.videos, activeCycle.targetVideos, "video")}
                health={resolveStatus(activeCycle.progress.videosPct, activeCycle.health.elapsedPct).value}
              />
            ) : null}
            {activeCycle.targetFollowers !== null ? (
              <KpiMetricBar
                label="Follower"
                pct={activeCycle.progress.followersPct}
                text={metricText(activeCycle.actuals.followersNow, activeCycle.targetFollowers, "follower")}
                health={resolveStatus(activeCycle.progress.followersPct, activeCycle.health.elapsedPct).value}
              />
            ) : null}
          </div>
        </div>
      )}

      {pastCycles.length > 0 ? (
        <div className="mt-4 border-t border-line-soft pt-4">
          <div className="mb-2.5 text-[12.5px] font-bold text-ink-2">Các kỳ trước</div>
          <div className="flex flex-col gap-2">
            {pastCycles.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[12.5px] font-semibold">
                    {formatFullDate(c.periodStart)} – {formatFullDate(c.periodEnd)}
                  </div>
                  <div className="text-[11px] text-ink-3">{c.status === "final" ? "Đã chốt sổ" : "Nháp — kỳ đã qua"}</div>
                </div>
                <KpiHealthBadge health={c.health} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
