// Chỉ số → màu cố định, dùng xuyên suốt app để quét nhanh bằng mắt (24/08/2026, theo yêu cầu) — xem
// docs/DESIGN_SYSTEM.md mục "Icon-box màu". Chỉ áp cho tiêu đề cột, số liệu chính, tab/đường biểu đồ
// — KHÔNG áp cho badge %thay đổi (badge đó vẫn xanh lá=tăng/đỏ=giảm như trước, xem DeltaPill trong
// dashboard-widgets.tsx) để 2 hệ màu (theo chỉ số vs. theo chiều hướng) không lẫn nhau.
//
// `crimson` (không phải `red`) cho Like — `red` là màu brand/nút/link dùng khắp app, tách riêng để
// màu Like không bị hiểu nhầm thành "cảnh báo/giảm" khi đặt cạnh badge thật dùng `red`.

export type MetricTone = "blue" | "purple" | "orange" | "crimson";

export const METRIC_TONE = {
  views: "blue",
  followers: "purple",
  videos: "orange",
  likes: "crimson",
} as const satisfies Record<string, MetricTone>;

/** Tailwind text-color class per tone, cho tiêu đề/số liệu (span, th, div...). */
export const METRIC_TEXT_CLASS: Record<MetricTone, string> = {
  blue: "text-blue",
  purple: "text-purple",
  orange: "text-orange",
  crimson: "text-crimson",
};

/** Same 4 tone, làm CSS var — dùng cho stroke của đường biểu đồ SVG (không nhận class Tailwind). */
export const METRIC_CSS_VAR: Record<MetricTone, string> = {
  blue: "var(--color-blue)",
  purple: "var(--color-purple)",
  orange: "var(--color-orange)",
  crimson: "var(--color-crimson)",
};

/** Nền mềm tương ứng — vùng tô dưới đường biểu đồ (area fill), cùng cặp với `bg-*-bg` ở StatTile. */
export const METRIC_BG_CSS_VAR: Record<MetricTone, string> = {
  blue: "var(--color-blue-bg)",
  purple: "var(--color-purple-bg)",
  orange: "var(--color-orange-bg)",
  crimson: "var(--color-crimson-bg)",
};
