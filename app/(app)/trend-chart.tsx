"use client";

import { useState } from "react";

import type { TrendPoint } from "@/lib/dashboard";
import { formatCompact } from "@/lib/format";
import { METRIC_BG_CSS_VAR, METRIC_CSS_VAR, METRIC_TEXT_CLASS, METRIC_TONE, type MetricTone } from "@/lib/metric-tone";

// Formatters are resolved by key, not passed as function props — a Server Component (the page) can't
// hand a function to a Client Component like this one.
const FORMATTERS = {
  compact: formatCompact,
  count: (n: number) => String(Math.round(n)),
} as const;

type Tab = {
  /** Must match a key in `METRIC_TONE` (lib/metric-tone.ts) — the tab button and chart line are
   *  tinted by it, so a caller can't add a metric tab without also deciding its colour. */
  key: keyof typeof METRIC_TONE;
  label: string;
  /** Both granularities precomputed server-side (lib/dashboard.ts's `getDashboard`/channel-detail
   *  page) — the tuần/tháng toggle below just picks one, no refetch, same as switching metric tabs. */
  points: { week: TrendPoint[]; month: TrendPoint[] };
  format: keyof typeof FORMATTERS;
};

const GRANULARITY_LABEL = { week: "tuần", month: "tháng" } as const;
type Granularity = keyof typeof GRANULARITY_LABEL;

const WIDTH = 750;
const HEIGHT = 212;
const X0 = 50;
const X1 = WIDTH - 12;
const TOP = 14;
const PLOT = 150;

function niceRange(values: number[]): { lo: number; hi: number } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (lo === hi) {
    const pad = Math.max(1, Math.abs(hi) * 0.1);
    return { lo: Math.max(0, lo - pad), hi: hi + pad };
  }
  const pad = (hi - lo) * 0.15;
  return { lo: Math.max(0, lo - pad), hi: hi + pad };
}

/** Inline-SVG line chart with a metric tab-switcher + tuần/tháng granularity toggle (docs/TASKS.md
 *  Đợt 2 #2) — no charting dependency, matching design/Main.dc.html's hand-built approach. Renders
 *  whichever `tabs[active].points[granularity]` series is selected; `subtitlePrefix` gets the
 *  "N tuần/tháng gần nhất" tail appended so it can't say "tuần" while showing months. */
export function TrendChart({ title, subtitlePrefix, tabs }: { title: string; subtitlePrefix?: string; tabs: Tab[] }) {
  const [active, setActive] = useState(0);
  const [granularity, setGranularity] = useState<Granularity>("week");
  const tab = tabs[active];
  const points = tab?.points[granularity] ?? [];
  const tone: MetricTone | undefined = tab ? METRIC_TONE[tab.key] : undefined;
  const subtitle = [subtitlePrefix, `${points.length} ${GRANULARITY_LABEL[granularity]} gần nhất`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-card border border-line px-5 pb-3.5 pt-[18px]">
      <div className="mb-3.5 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[15px] font-bold">{title}</div>
          <div className="mt-[3px] text-xs text-ink-3">{subtitle}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-[3px] rounded-[6px] bg-line-soft p-[3px]">
            {(Object.keys(GRANULARITY_LABEL) as Granularity[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGranularity(g)}
                className={`rounded-[4px] px-2.5 py-1.5 text-[12.5px] capitalize ${
                  g === granularity ? "bg-bg font-bold text-ink" : "font-medium text-ink-2"
                }`}
              >
                {GRANULARITY_LABEL[g]}
              </button>
            ))}
          </div>
          <div className="flex gap-[3px] rounded-[6px] bg-line-soft p-[3px]">
            {tabs.map((t, i) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActive(i)}
                className={`rounded-[4px] px-3.5 py-1.5 text-[12.5px] ${
                  i === active ? `bg-bg font-bold ${METRIC_TEXT_CLASS[METRIC_TONE[t.key]]}` : "font-medium text-ink-2"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {points.length === 0 ? (
        <div className="flex h-[212px] items-center justify-center text-[13px] text-ink-3">
          Chưa có dữ liệu trong khoảng thời gian này.
        </div>
      ) : (
        <ChartSvg points={points} formatValue={FORMATTERS[tab.format]} tone={tone ?? "blue"} />
      )}
    </div>
  );
}

function ChartSvg({
  points,
  formatValue,
  tone,
}: {
  points: TrendPoint[];
  formatValue: (n: number) => string;
  tone: MetricTone;
}) {
  const lineColor = METRIC_CSS_VAR[tone];
  const fillColor = METRIC_BG_CSS_VAR[tone];
  const known = points.map((p) => p.value).filter((v): v is number => v !== null);
  // Every point is a gap (e.g. a brand-new channel before its first sync resolves) — nothing to
  // scale the y-axis against. Labels below still render.
  const { lo, hi } = known.length > 0 ? niceRange(known) : { lo: 0, hi: 1 };
  const yOf = (v: number) => TOP + (1 - (v - lo) / (hi - lo)) * PLOT;
  const xOf = (i: number) => (points.length === 1 ? (X0 + X1) / 2 : X0 + (i * (X1 - X0)) / (points.length - 1));

  const plotted = points.map((p, i) => ({
    x: xOf(i),
    y: p.value === null ? null : yOf(p.value),
    label: p.label,
    isLast: i === points.length - 1,
  }));

  // A null point breaks the line into a separate segment — plotting it as 0 would draw "the metric
  // crashed to zero," when the truth is "chưa có số đo" (CLAUDE.md: never let missing read as zero).
  const segments: { x: number; y: number }[][] = [];
  for (const p of plotted) {
    if (p.y === null) continue;
    const last = segments[segments.length - 1];
    const prevPlottedIndex = plotted.indexOf(p) - 1;
    const isContinuation = last && prevPlottedIndex >= 0 && plotted[prevPlottedIndex]?.y !== null;
    if (isContinuation) last.push({ x: p.x, y: p.y });
    else segments.push([{ x: p.x, y: p.y }]);
  }

  const gridLines = [0, 1, 2, 3].map((i) => hi - (i * (hi - lo)) / 3);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block h-auto w-full" role="img" aria-label="Biểu đồ xu hướng">
      {gridLines.map((v) => {
        const y = yOf(v);
        return (
          <g key={v}>
            <line x1={X0 - 8} y1={y} x2={X1} y2={y} stroke="var(--color-line-soft)" strokeWidth={1} />
            <text x={0} y={y - 5} fontSize={10.5} fill="#c9c9cb">
              {known.length > 0 ? formatValue(v) : ""}
            </text>
          </g>
        );
      })}
      {segments.map((seg, i) => (
        <path
          key={i}
          d={`M${seg.map((p) => `${p.x},${p.y}`).join(" L")} L${seg[seg.length - 1].x},${TOP + PLOT} L${seg[0].x},${TOP + PLOT} Z`}
          fill={fillColor}
        />
      ))}
      {segments.map((seg, i) => (
        <polyline
          key={i}
          points={seg.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={lineColor}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {plotted.map((p) => (
        <g key={`${p.x}-${p.label}`}>
          {p.y !== null ? (
            <circle cx={p.x} cy={p.y} r={p.isLast ? 5 : 3.5} fill="var(--color-bg)" stroke={lineColor} strokeWidth={2.5} />
          ) : null}
          <text
            x={p.x}
            y={HEIGHT - 10}
            textAnchor="middle"
            fontSize={11}
            fontWeight={p.isLast ? 700 : 500}
            fill={p.isLast ? "var(--color-ink)" : "var(--color-ink-3)"}
          >
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
