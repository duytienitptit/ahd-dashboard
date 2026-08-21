// VN-calendar-day helpers. TS counterpart of the SQL `today_vn()` function
// (supabase/migrations/20260820000007_ownership_trigger.sql) — keep both in sync if the timezone
// rule ever changes. See CLAUDE.md "Múi giờ" for why this conversion exists.

const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";

/** Today's calendar date in Asia/Ho_Chi_Minh, as "YYYY-MM-DD". */
export function nowVnDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: VN_TIME_ZONE }).format(now);
}

/** `dateStr` shifted by `days` (negative = earlier). Pure calendar-date arithmetic, no timezone involved. */
export function addDaysToDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Midnight Asia/Ho_Chi_Minh (UTC+7, no DST) for `dateStr`, as an ISO instant — for timestamptz
 *  columns fed a date-only value (e.g. `content_video.posted_at` from Content.csv's "Post time"). */
export function vnMidnightIso(dateStr: string): string {
  return `${dateStr}T00:00:00+07:00`;
}

/** Whole calendar days from `a` to `b` (positive when `b` is later). Pure date-string arithmetic. */
export function daysBetweenDateStrings(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const diffMs = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(diffMs / 86_400_000);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resolves a `?from=&to=` query pair (both optional, either may be missing/malformed) into a valid
 * `{from, to}`, anchored to today VN when nothing usable was given (M4 decision, 2026-08-21 — see
 * CLAUDE.md). Falls back to a clean `defaultDays`-long window ending today on any bad input,
 * instead of erroring — a page's date picker should never be able to crash the page it lives on.
 */
export function resolvePeriodParams(
  params: { from?: string; to?: string },
  defaultDays = 7,
  now: Date = new Date(),
): { from: string; to: string } {
  const today = nowVnDateString(now);
  const to = params.to && DATE_RE.test(params.to) && params.to <= today ? params.to : today;
  const fallbackFrom = addDaysToDateString(to, -(defaultDays - 1));
  const from = params.from && DATE_RE.test(params.from) && params.from <= to ? params.from : fallbackFrom;
  return { from, to };
}
