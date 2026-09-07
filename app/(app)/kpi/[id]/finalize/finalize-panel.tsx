"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { formatFullDate, formatNumber } from "@/lib/format";
import type { FinalizeReadiness, KpiCycleWithProgress } from "@/lib/kpi";
import { METRIC_TEXT_CLASS } from "@/lib/metric-tone";

import { finalizeKpiCycleAction, type FinalizeFormState } from "../../actions";
import { KPI_METRIC_ROWS, KpiHealthBadge, kpiActualFor, kpiPctFor, metricText, type KpiMetricKey } from "../../kpi-widgets";

type ChannelInfo = { id: string; name: string; tiktokHandle: string };

const initialState: FinalizeFormState = { error: null };

const METRIC_LABEL: Record<KpiMetricKey, string> = { views: "Lượt xem", videos: "Video", followers: "Follower" };

/** Static for views/videos — both descriptions are just PRODUCT_SPEC.md's own wording for what the
 *  number means ("số phát sinh trong kỳ", `videosTrongKỳ`), not invented copy. followers is dynamic
 *  because "đầu kỳ → mục tiêu" is real per-cycle data (`followersAtStart`), not boilerplate. */
function metricNote(cycle: KpiCycleWithProgress, key: KpiMetricKey): string {
  if (key === "views") return "View phát sinh trong kỳ";
  if (key === "videos") return "Đếm theo ngày đăng trong kỳ";
  return `Đầu kỳ ${formatNumber(cycle.followersAtStart)} → mục tiêu ${formatNumber(cycle.targetFollowers ?? 0)}`;
}

function FinalizeCheck({ ok, label, note }: { ok: boolean; label: string; note: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-pill ${ok ? "bg-green-bg" : "bg-red-bg"}`}
      >
        {ok ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#046c45" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#c11238" strokeWidth={3} strokeLinecap="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        )}
      </span>
      <div className="min-w-0">
        <div className={`text-[13px] font-semibold ${ok ? "text-ink" : "text-red-dark"}`}>{label}</div>
        <div className="mt-0.5 text-[11.5px] leading-relaxed text-ink-3">{note}</div>
      </div>
    </div>
  );
}

function FinalizedMeta({ finalizedByName, finalizedAt }: { finalizedByName: string | null; finalizedAt: string | null }) {
  return (
    <>
      <div>Người chốt · {finalizedByName ?? "—"}</div>
      {finalizedAt ? <div className="mt-0.5">{new Date(finalizedAt).toLocaleString("vi-VN")}</div> : null}
    </>
  );
}

/**
 * `/kpi/[id]/finalize` — the only screen that can lock a cycle (Manager-only, gated in page.tsx).
 * Reused for BOTH the pre-lock review ("đối chiếu số liệu trước khi khoá", docs/TASKS.md) and the
 * post-lock read-only view ("xem lại lịch sử các kỳ đã chốt") — `cycle.status` decides which one
 * renders, so a Manager clicking "Xem chốt sổ" on an old cycle lands on the exact same route a
 * still-draft one uses, just without the checklist/buttons.
 *
 * Deliberately does NOT reproduce design/Finalize.dc.html's per-metric "Đạt/Gần đạt/Chưa đạt"
 * result badges — that mock only shows 3 illustrative data points, not enough to know where the
 * yellow/red boundary actually sits, and CLAUDE.md is explicit that KPI math must never be guessed.
 * The already-shipped, already-approved `KpiHealthBadge` (±10% around 100% elapsed, since the cycle
 * has ended) covers "kết quả chung" instead; per-metric rows show plain numbers colored by metric
 * identity (`METRIC_TEXT_CLASS`), same as everywhere else in the app.
 */
export function FinalizePanel({
  cycle,
  channel,
  readiness,
  finalizedByName,
}: {
  cycle: KpiCycleWithProgress;
  channel: ChannelInfo;
  readiness: FinalizeReadiness | null;
  finalizedByName: string | null;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const boundAction = finalizeKpiCycleAction.bind(null, cycle.id, channel.id);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  const isFinal = cycle.status === "final";
  const activeMetrics = KPI_METRIC_ROWS.filter((m) => cycle[m.targetKey] !== null);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.6px]">Chốt sổ chu kỳ</h1>
          <div className="mt-1.5 flex items-center gap-2 text-[13px] text-ink-3">
            <span>
              {channel.name} · {channel.tiktokHandle}
            </span>
            <span className="h-[3px] w-[3px] rounded-pill bg-line" />
            <span>
              {formatFullDate(cycle.periodStart)} – {formatFullDate(cycle.periodEnd)}
            </span>
          </div>
        </div>
        {isFinal ? (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-green-bg px-3 py-1.5 text-[12.5px] font-bold text-green-dark">
            <span className="h-1.5 w-1.5 rounded-pill bg-green" /> Đã chốt sổ
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-amber-bg px-3 py-1.5 text-[12.5px] font-bold text-amber-dark">
            <span className="h-1.5 w-1.5 rounded-pill bg-amber" /> Đang ở trạng thái Draft
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-3.5">
          {isFinal ? (
            <div className="rounded-card border border-line p-5">
              <div className="mb-1 text-sm font-bold">Đã khoá</div>
              <p className="text-[12.5px] leading-relaxed text-ink-3">
                Số liệu chu kỳ này đã được khoá vĩnh viễn và dùng làm căn cứ tính thưởng. Mọi chỉnh sửa về sau đều
                được ghi lại kèm người thực hiện và lý do.
              </p>
              <div className="mt-3 border-t border-line-soft pt-3 text-[12.5px] text-ink-3">
                <FinalizedMeta finalizedByName={finalizedByName} finalizedAt={cycle.finalizedAt} />
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-card border border-line p-5">
                <div className="mb-1 text-sm font-bold">Điều kiện chốt sổ</div>
                <p className="mb-4 text-[12.5px] leading-relaxed text-ink-3">
                  Không cần tải file ở đây — hệ thống dùng số liệu đã nhập trước đó
                </p>
                <div className="flex flex-col gap-3.5">
                  <FinalizeCheck
                    ok={!!readiness && !readiness.reasons.includes("too_early")}
                    label="Đã qua hạn chờ dữ liệu"
                    note={
                      readiness
                        ? `Chu kỳ kết thúc ${formatFullDate(cycle.periodEnd)}, ${
                            readiness.reasons.includes("too_early") ? "mở khoá từ" : "đã mở khoá từ"
                          } ${formatFullDate(readiness.unlockAt)} (Studio trễ 2 ngày + 1 ngày an toàn)`
                        : ""
                    }
                  />
                  <FinalizeCheck
                    ok={!!readiness && readiness.missingDates.length === 0}
                    label="Đủ dữ liệu Studio cho cả kỳ"
                    note={
                      readiness && readiness.missingDates.length > 0
                        ? `Còn thiếu ${readiness.missingDates.length} ngày: ${readiness.missingDates.map(formatFullDate).join(", ")}`
                        : "Mọi ngày trong kỳ đã có số liệu đã đối chiếu (studio_import)"
                    }
                  />
                  <FinalizeCheck
                    ok={!!readiness && readiness.manualEntryDates.length === 0}
                    label="Không còn số nhập tay chưa đối chiếu"
                    note={
                      readiness && readiness.manualEntryDates.length > 0
                        ? `Còn ${readiness.manualEntryDates.length} ngày từng nhập tay: ${readiness.manualEntryDates.map(formatFullDate).join(", ")}`
                        : "Không có ngày nào còn số nhập tay"
                    }
                  />
                </div>
              </div>

              <div className="rounded-card border border-red-dark bg-red-bg p-4">
                <div className="mb-1.5 text-[13.5px] font-bold text-red-dark">Chốt sổ là thao tác không thể hoàn tác</div>
                <p className="text-[12.5px] leading-relaxed text-red-dark">
                  Sau khi chốt, số liệu chu kỳ này bị khoá vĩnh viễn và dùng làm căn cứ tính thưởng. Mọi chỉnh sửa về
                  sau đều bị ghi lại kèm người thực hiện và lý do.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="overflow-hidden rounded-card border border-line">
          <div className="border-b border-line-soft px-5 py-4">
            <div className="text-sm font-bold">Kết quả chu kỳ</div>
            <p className="mt-1 text-[12.5px] text-ink-3">
              Tổng hợp từ số liệu {isFinal ? "TikTok Studio đã nhập" : "đang có tính đến hôm nay"}, đối chiếu với chỉ
              tiêu đã giao
            </p>
          </div>

          <div className="divide-y divide-line-soft">
            {activeMetrics.map(({ key, targetKey, unit, tone }) => {
              const target = cycle[targetKey]!;
              const actual = kpiActualFor(cycle, key);
              const pct = kpiPctFor(cycle, key);
              return (
                <div key={key} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                  <div>
                    <div className="text-[13.5px] font-semibold">{METRIC_LABEL[key]}</div>
                    <div className="text-[11.5px] text-ink-3">{metricNote(cycle, key)}</div>
                  </div>
                  <div className="flex items-center gap-5 text-right">
                    <div className="text-[13.5px] text-ink-3">{metricText(actual, target, unit)}</div>
                    <div className={`w-[64px] text-[15px] font-extrabold tracking-[-0.3px] ${METRIC_TEXT_CLASS[tone]}`}>
                      {pct !== null ? `${pct}%` : "—"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-5 py-4">
            <div>
              <div className="mb-1 text-[12.5px] text-ink-3">Kết quả chung chu kỳ</div>
              <KpiHealthBadge health={cycle.health} />
            </div>
            {isFinal ? (
              <div className="text-right text-[12px] text-ink-3">
                <FinalizedMeta finalizedByName={finalizedByName} finalizedAt={cycle.finalizedAt} />
              </div>
            ) : null}
          </div>

          {!isFinal ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-5 py-4">
              <label className="flex items-center gap-2.5 text-[12.5px] text-ink-2">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="h-4 w-4 accent-ink"
                />
                Tôi xác nhận đã đối chiếu số liệu và đồng ý khoá chu kỳ này
              </label>
              <div className="flex shrink-0 gap-2.5">
                <Link
                  href="/kpi"
                  className="flex h-10 items-center rounded-btn border border-line px-5 text-sm font-semibold hover:bg-surface"
                >
                  Huỷ
                </Link>
                <form action={formAction}>
                  <button
                    type="submit"
                    disabled={!readiness?.ready || !confirmed || pending}
                    className="flex h-10 items-center rounded-btn bg-red px-5 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {pending ? "Đang chốt sổ…" : "Chốt sổ & khoá"}
                  </button>
                </form>
              </div>
            </div>
          ) : null}

          {state.error ? (
            <div role="alert" className="border-t border-line-soft bg-red-bg px-5 py-3 text-[12.5px] font-medium text-red-dark">
              {state.error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
