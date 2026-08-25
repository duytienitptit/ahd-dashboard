// Pure formatting helpers split out of lib/kpi.ts specifically so client components can import them
// safely. lib/kpi.ts pulls in lib/auth.ts (for AuthorizationError, used by assertEditable) and
// lib/dashboard.ts's query functions — importing ANY value export from lib/kpi.ts drags that whole
// chain into a client bundle, which fails the build the moment it reaches lib/auth.ts's
// `next/headers` import (server-only). This file has zero such dependencies — only lib/format.ts's
// formatCompact, itself dependency-free — so app/(app)/kpi/kpi-widgets.tsx (shared by both Server
// and Client Components) can import metricText/metricHint from here instead. lib/kpi.ts re-exports
// both so every existing server-side caller keeps working unchanged.

import { formatCompact } from "@/lib/format";

/** "470k / 500k view" — docs/API_SPEC.md's `myChannels[].metrics[].text` shape, generalized to all
 *  3 metric types (originally written for views only). `target === null` (no target set on this
 *  cycle) returns "" — callers skip the row entirely in that case rather than render an empty unit. */
export function metricText(actual: number | null, target: number | null, unit: string): string {
  if (target === null) return "";
  const actualText = actual !== null ? formatCompact(actual) : "—";
  return `${actualText} / ${formatCompact(target)} ${unit}`;
}

export type KpiMetricRemaining = { remaining: number; perDay: number | null };

/** One-metric "hint" for `myChannels[].metrics[].hint` (docs/API_SPEC.md's example: "Sắp về đích,
 *  cần thêm 30k view") — same "cần thêm" framing as `remainingPerDay`'s headline `text` in
 *  lib/kpi.ts, just for whichever single metric the caller is rendering, not necessarily the
 *  primary one. `null` (metric has no target, or no measured actual yet) → "". */
export function metricHint(remaining: KpiMetricRemaining | null, unit: string): string {
  if (!remaining) return "";
  if (remaining.remaining <= 0) return "Đã đạt chỉ tiêu";
  return `Cần thêm ${formatCompact(remaining.remaining)} ${unit}`;
}
