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

/** Tiền tố dòng đầu tooltip. Tuần cần chữ "tuần" vì nhãn chỉ là ngày trần ("17/8" — xem
 *  `weekStartLabel`); tháng thì bỏ trống, nhãn tháng đã tự mang "Th" nên thêm vào sẽ ra "tháng Th8". */
const TOOLTIP_PREFIX: Record<Granularity, string> = { week: "tuần ", month: "" };

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
        <ChartSvg
          points={points}
          formatValue={FORMATTERS[tab.format]}
          tone={tone ?? "blue"}
          pointPrefix={TOOLTIP_PREFIX[granularity]}
        />
      )}
    </div>
  );
}

function ChartSvg({
  points,
  formatValue,
  tone,
  pointPrefix,
}: {
  points: TrendPoint[];
  formatValue: (n: number) => string;
  tone: MetricTone;
  /** "tuần " cho biểu đồ tuần, rỗng cho biểu đồ tháng — xem `TOOLTIP_PREFIX`. */
  pointPrefix: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
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

  // Kỳ cuối chưa kết thúc (`coverage`, xem lib/dashboard.ts `withUnfinishedMarks`) thì tách khỏi
  // đường liền nét: nó chỉ mới cộng được vài ngày nên đứng ngang hàng với các kỳ đủ ngày sẽ đọc như
  // một cú tụt thật. Vẫn vẽ, chỉ là bằng nét đứt (07/09/2026, theo yêu cầu — không giấu số).
  const lastIsPartial = points[points.length - 1]?.coverage != null;
  const solidPlotted = lastIsPartial ? plotted.slice(0, -1) : plotted;

  // A null point breaks the line into a separate segment — plotting it as 0 would draw "the metric
  // crashed to zero," when the truth is "chưa có số đo" (CLAUDE.md: never let missing read as zero).
  const segments: { x: number; y: number }[][] = [];
  solidPlotted.forEach((p, i) => {
    if (p.y === null) return;
    const last = segments[segments.length - 1];
    const isContinuation = last && i > 0 && solidPlotted[i - 1]?.y !== null;
    if (isContinuation) last.push({ x: p.x, y: p.y });
    else segments.push([{ x: p.x, y: p.y }]);
  });

  // Chặng nối từ kỳ trọn vẹn cuối cùng sang kỳ ĐANG CHẠY, vẽ nét đứt — nhưng CHỈ khi kỳ đang chạy đã
  // có số đo thật ở cả 2 đầu.
  //
  // Đã thử kéo ngang giữ mức kỳ trước cho những kỳ chưa có số, để lúc nào cũng có nét đứt: SAI, và bị
  // bắt ngay (07/09/2026, theo yêu cầu "giá trị nét đứt cần đúng số liệu thật"). Đầu mút của đoạn
  // thẳng là một toạ độ Y — người đọc chiếu sang trục là ra một con số. Bịa đầu mút = bịa số, đúng
  // loại lỗi CLAUDE.md cấm ("chưa có số đo" không được vẽ thành một giá trị). Kỳ chưa sync ngày nào
  // thì cột đó chỉ còn nhãn trục X + tooltip "chưa có số đo"; nét đứt xuất hiện ngay khi có số thật.
  const prev = plotted[plotted.length - 2];
  const tail = plotted[plotted.length - 1];
  const partialLeg =
    lastIsPartial && prev && tail && prev.y !== null && tail.y !== null ? { prev, tail } : null;

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
      {partialLeg ? (
        <line
          x1={partialLeg.prev.x}
          y1={partialLeg.prev.y ?? 0}
          x2={partialLeg.tail.x}
          y2={partialLeg.tail.y ?? 0}
          stroke={lineColor}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray="5 4"
        />
      ) : null}
      {plotted.map((p, i) => (
        <g key={`${p.x}-${p.label}`}>
          {p.y !== null ? (
            <circle
              cx={p.x}
              cy={p.y}
              r={i === hover ? 6 : p.isLast ? 5 : 3.5}
              fill="var(--color-bg)"
              stroke={lineColor}
              strokeWidth={2.5}
            />
          ) : null}
          <text
            x={p.x}
            y={HEIGHT - 10}
            textAnchor="middle"
            fontSize={11}
            fontWeight={i === hover || p.isLast ? 700 : 500}
            fill={i === hover || p.isLast ? "var(--color-ink)" : "var(--color-ink-3)"}
          >
            {p.label}
          </text>
        </g>
      ))}

      {/* Vùng bắt chuột: mỗi điểm một cột trong suốt trải hết chiều cao, nên không phải trỏ trúng
          đúng chấm tròn 3,5px mới hiện số (07/09/2026, theo yêu cầu "di chuột vào các chấm tròn cần
          hiện số liệu cụ thể"). `fill="transparent"` chứ không phải `none` — `none` không nhận sự
          kiện chuột. `onPointerEnter` cũng bắn khi chạm trên mobile. */}
      {plotted.map((p, i) => {
        const half = plotted.length === 1 ? (X1 - X0) / 2 : (X1 - X0) / (plotted.length - 1) / 2;
        return (
          <rect
            key={`hit-${p.x}`}
            x={p.x - half}
            y={0}
            width={half * 2}
            height={HEIGHT}
            fill="transparent"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover((h) => (h === i ? null : h))}
          />
        );
      })}

      {hover !== null && plotted[hover] ? <ChartTooltip
        point={plotted[hover]}
        value={points[hover].value}
        coverage={points[hover].coverage}
        formatValue={formatValue}
        prefix={pointPrefix}
        lineColor={lineColor}
      /> : null}
    </svg>
  );
}

/** Hộp số liệu nổi khi rê chuột — vẽ bằng chính SVG (không phải overlay HTML) để tự co giãn cùng
 *  `viewBox`, khỏi phải quy đổi toạ độ khi khung bị scale theo bề rộng cột. */
function ChartTooltip({
  point,
  value,
  coverage,
  formatValue,
  prefix,
  lineColor,
}: {
  point: { x: number; y: number | null; label: string };
  value: number | null;
  /** Có mặt = kỳ chưa kết thúc; ghi thẳng "mới có N/M ngày" để con số thấp không bị đọc là tụt. */
  coverage?: { days: number; totalDays: number };
  formatValue: (n: number) => string;
  prefix: string;
  lineColor: string;
}) {
  const title = `${prefix}${point.label}`;
  // "chưa có số đo" chứ không phải "0" — cùng luật `unknown ≠ known-zero` của cả app (CLAUDE.md).
  const valueText = value === null ? "chưa có số đo" : formatValue(value);
  const noteText = coverage ? `kỳ chưa xong — mới có ${coverage.days}/${coverage.totalDays} ngày` : null;

  // Ước lượng bề rộng theo số ký tự: SVG không đo được text trước khi vẽ, mà cỡ chữ ở đây cố định
  // nên xấp xỉ tuyến tính là đủ (thừa vài px vô hại, thiếu thì chữ tràn hộp).
  const width = Math.max(title.length * 6.1, valueText.length * 7.4, (noteText?.length ?? 0) * 5.6) + 22;
  const height = noteText ? 58 : 42;
  const anchorY = point.y ?? TOP + PLOT / 2;
  const above = anchorY - height - 14 >= 0;
  const y = above ? anchorY - height - 14 : anchorY + 14;
  const x = Math.min(Math.max(point.x - width / 2, 2), WIDTH - width - 2);

  return (
    <g pointerEvents="none">
      <line x1={point.x} y1={TOP} x2={point.x} y2={TOP + PLOT} stroke={lineColor} strokeWidth={1} strokeDasharray="3 3" opacity={0.45} />
      <rect x={x} y={y} width={width} height={height} rx={8} fill="var(--color-bg)" stroke="var(--color-line)" strokeWidth={1} />
      <text x={x + 11} y={y + 17} fontSize={11} fill="var(--color-ink-3)">
        {title}
      </text>
      <text x={x + 11} y={y + 33} fontSize={13} fontWeight={700} fill="var(--color-ink)">
        {valueText}
      </text>
      {noteText ? (
        <text x={x + 11} y={y + 49} fontSize={10} fill="var(--color-amber-dark)">
          {noteText}
        </text>
      ) : null}
    </g>
  );
}
