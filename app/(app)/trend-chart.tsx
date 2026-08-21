"use client";

import { useState } from "react";

import type { TrendPoint } from "@/lib/dashboard";
import { formatCompact } from "@/lib/format";

// Formatters are resolved by key, not passed as function props — a Server Component (the page) can't
// hand a function to a Client Component like this one.
const FORMATTERS = {
  compact: formatCompact,
  count: (n: number) => String(Math.round(n)),
} as const;

type Tab = {
  key: string;
  label: string;
  points: TrendPoint[];
  format: keyof typeof FORMATTERS;
};

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

/** Inline-SVG line chart with a metric tab-switcher — no charting dependency, matching
 *  design/Main.dc.html's hand-built approach. Renders whichever `tabs[active]` series is selected. */
export function TrendChart({ title, subtitle, tabs }: { title: string; subtitle: string; tabs: Tab[] }) {
  const [active, setActive] = useState(0);
  const tab = tabs[active];
  const points = tab?.points ?? [];

  return (
    <div className="rounded-card border border-line px-5 pb-3.5 pt-[18px]">
      <div className="mb-3.5 flex items-start justify-between">
        <div>
          <div className="text-[15px] font-bold">{title}</div>
          <div className="mt-[3px] text-xs text-ink-3">{subtitle}</div>
        </div>
        <div className="flex gap-[3px] rounded-[6px] bg-line-soft p-[3px]">
          {tabs.map((t, i) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(i)}
              className={`rounded-[4px] px-3.5 py-1.5 text-[12.5px] ${
                i === active ? "bg-bg font-bold text-ink" : "font-medium text-ink-2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {points.length === 0 ? (
        <div className="flex h-[212px] items-center justify-center text-[13px] text-ink-3">
          Chưa có dữ liệu trong khoảng thời gian này.
        </div>
      ) : (
        <ChartSvg points={points} formatValue={FORMATTERS[tab.format]} />
      )}
    </div>
  );
}

function ChartSvg({ points, formatValue }: { points: TrendPoint[]; formatValue: (n: number) => string }) {
  const { lo, hi } = niceRange(points.map((p) => p.value));
  const yOf = (v: number) => TOP + (1 - (v - lo) / (hi - lo)) * PLOT;
  const xOf = (i: number) => (points.length === 1 ? (X0 + X1) / 2 : X0 + (i * (X1 - X0)) / (points.length - 1));

  const plotted = points.map((p, i) => ({
    x: xOf(i),
    y: yOf(p.value),
    label: p.label,
    isLast: i === points.length - 1,
  }));
  const linePoints = plotted.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPath =
    `M${plotted.map((p) => `${p.x},${p.y}`).join(" L")}` +
    ` L${plotted[plotted.length - 1].x},${TOP + PLOT} L${plotted[0].x},${TOP + PLOT} Z`;

  const gridLines = [0, 1, 2, 3].map((i) => hi - (i * (hi - lo)) / 3);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block h-auto w-full" role="img" aria-label="Biểu đồ xu hướng">
      {gridLines.map((v) => {
        const y = yOf(v);
        return (
          <g key={v}>
            <line x1={X0 - 8} y1={y} x2={X1} y2={y} stroke="var(--color-line-soft)" strokeWidth={1} />
            <text x={0} y={y - 5} fontSize={10.5} fill="#c9c9cb">
              {formatValue(v)}
            </text>
          </g>
        );
      })}
      <path d={areaPath} fill="var(--color-cyan-bg)" />
      <polyline
        points={linePoints}
        fill="none"
        stroke="var(--color-cyan)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {plotted.map((p) => (
        <g key={`${p.x}-${p.label}`}>
          <circle cx={p.x} cy={p.y} r={p.isLast ? 5 : 3.5} fill="var(--color-bg)" stroke="var(--color-cyan)" strokeWidth={2.5} />
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
