import { metricText } from "@/lib/kpi-format";
import type { KpiHealth, KpiHealthValue } from "@/lib/kpi";

export { metricText };

export const KPI_HEALTH_LABEL: Record<KpiHealthValue, string> = {
  green: "Vượt tiến độ",
  yellow: "Đúng tiến độ",
  red: "Cần tăng tốc",
};

const KPI_HEALTH_DOT: Record<KpiHealthValue, string> = { green: "bg-green", yellow: "bg-amber", red: "bg-red" };
const KPI_HEALTH_BG: Record<KpiHealthValue, string> = { green: "bg-green-bg", yellow: "bg-amber-bg", red: "bg-red-bg" };
const KPI_HEALTH_TEXT: Record<KpiHealthValue, string> = {
  green: "text-green-dark",
  yellow: "text-amber-dark",
  red: "text-red-dark",
};

/** 🟢🟡🔴 pill with label — `/kpi` list rows, channel/Nhân sự detail cards. `title` carries
 *  `health.explanation` as a native tooltip (PRODUCT_SPEC.md #7: "kèm tooltip giải thích"). */
export function KpiHealthBadge({ health }: { health: KpiHealth }) {
  return (
    <span
      title={health.explanation}
      className={`inline-flex w-fit items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-bold ${KPI_HEALTH_BG[health.value]} ${KPI_HEALTH_TEXT[health.value]}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-pill ${KPI_HEALTH_DOT[health.value]}`} />
      {health.overallPct !== null ? `${health.overallPct}%` : "—"} · {KPI_HEALTH_LABEL[health.value]}
    </span>
  );
}

/** Percent-only pill, no label — `/channels`' "Tiến độ KPI" column has no room for the full badge
 *  (dense table row). Same colors/tooltip as `KpiHealthBadge`, just terser. */
export function KpiProgressPill({ health }: { health: KpiHealth }) {
  return (
    <span
      title={health.explanation}
      className={`inline-flex w-fit items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-semibold ${KPI_HEALTH_BG[health.value]} ${KPI_HEALTH_TEXT[health.value]}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-pill ${KPI_HEALTH_DOT[health.value]}`} />
      {health.overallPct !== null ? `${health.overallPct}%` : "Chưa có số liệu"}
    </span>
  );
}

const METRIC_BAR_HEALTH = {
  green: { bar: "bg-green", text: "text-green-dark" },
  yellow: { bar: "bg-amber", text: "text-amber-dark" },
  red: { bar: "bg-red", text: "text-red-dark" },
} as const;

/**
 * One metric's progress bar (views/videos/followers row inside the KPI card). Colored by
 * PER-METRIC health (on-pace/behind for THIS specific metric, same 🟢🟡🔴 vocabulary as
 * `KpiHealthBadge`) — deliberately NOT the blue/orange/purple metric-identity palette
 * (docs/DESIGN_SYSTEM.md "Màu theo chỉ số", written 24/08/2026 before M5 existed, already lists
 * "thanh tiến độ KPI" as an explicit exclusion: a progress bar's job is to show progress-vs-pace,
 * the "chiều hướng" half of the app's two separate color systems, not metric identity). First
 * implementation of this component used the metric palette by mistake — caught and fixed before
 * merge, see docs/PROGRESS.md "M5 — KPI Cycle".
 *
 * Bar width clamps to [0, 100] — the underlying `pct` never does (lib/kpi.ts's `computeProgress`:
 * an overachieved target or a follower drop is a real number; only the bar clamps, not the math).
 * `pct === null` (no target, or a target with no measured data yet) renders an empty bar with "—"
 * instead of hiding the row, so a Creator can see which of the 3 metrics has no data yet.
 */
export function KpiMetricBar({
  label,
  pct,
  text,
  health,
}: {
  label: string;
  pct: number | null;
  text: string;
  health: KpiHealthValue;
}) {
  const width = pct === null ? 0 : Math.min(100, Math.max(0, pct));
  const { bar, text: textColor } = METRIC_BAR_HEALTH[health];
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-[12.5px] font-semibold text-ink-2">{label}</span>
        <span className={`text-[12.5px] font-bold ${textColor}`}>
          {pct !== null ? `${pct}%` : "—"}
          {text ? <span className="ml-1.5 font-medium text-ink-3">{text}</span> : null}
        </span>
      </div>
      <div className="h-[6px] overflow-hidden rounded-pill bg-line-soft">
        <div className={`h-[6px] rounded-pill ${bar} transition-[width]`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
