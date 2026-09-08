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

/**
 * Which VN calendar day a Display API sync run's numbers belong to — normally today VN, except in
 * the [00:00, 02:00) VN window, where it's still YESTERDAY's sample (docs/DISPLAY_API.md bẫy #12).
 *
 * lib/tiktok/sync.ts (B1, 24/08/2026) attributes each day's view count to the exact pair of
 * end-of-day `video_snapshot` rows (today's vs yesterday's) — every calendar day needs a real
 * sample at its end, or that day's number becomes unmeasurable (null, not a wrong guess). The cron
 * is scheduled for 23:30 VN specifically so a normal run lands right before the boundary, but
 * Vercel Cron can run late; a run that slips past midnight must still close out the day it was
 * MEANT to sample, not silently start sampling the new day one run early (which would leave the
 * day that just ended with no closing sample at all). Deliberately not tied to the cron's literal
 * 23:30 schedule — the manual "Chạy đồng bộ ngay" button goes through the same function, so it
 * behaves the same way on the rare click that happens to land at 1am.
 *
 * `hourCycle: "h23"` (not the default, or `hour12: false`) — some ICU builds render midnight as
 * "24" instead of "00" under `hour12: false`, which would silently defeat the < 2 check below.
 */
export function sampleDateForRun(now: Date = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-CA", { timeZone: VN_TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(now));
  const today = nowVnDateString(now);
  return hour < 2 ? addDaysToDateString(today, -1) : today;
}

/** Whole calendar days from `a` to `b` (positive when `b` is later). Pure date-string arithmetic. */
export function daysBetweenDateStrings(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const diffMs = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(diffMs / 86_400_000);
}

/** Every calendar date from `from` to `to` inclusive, ascending, as "YYYY-MM-DD" strings. Returns
 *  `[]` when `to < from`. Used to build a DENSE day series for the trend chart's "ngày" granularity
 *  — a missing day must still occupy a column (as a gap), not vanish and let the line read as
 *  continuous. */
export function dateRangeInclusive(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysToDateString(d, 1)) out.push(d);
  return out;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Stand-in for "since the beginning" in a `from` field — fixed, not relative, so it doesn't drift
 *  as calendar time passes (unlike a big `defaultDays`, which would eventually creep past real
 *  early data — this project's data only starts in 2026, so any date this early is equivalent to
 *  "no lower bound" for as long as the tool exists). Used by the Tổng quan default and the date
 *  picker's "Toàn bộ thời gian" preset (22/08/2026) — both must use this exact constant so the
 *  picker recognizes the default as that preset instead of falling back to a raw date-range label. */
export const ALL_TIME_FROM = "2020-01-01";

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

/**
 * Same as `resolvePeriodParams`, but defaults to "Toàn bộ thời gian" (`ALL_TIME_FROM` through today)
 * instead of a recent window when neither `?from=` nor `?to=` was given — every page's picker default
 * (22/08/2026, theo yêu cầu — was Tổng quan-only at first, then extended to match everywhere). Once
 * either query param is present (the picker's been touched, including its own "Toàn bộ thời gian"
 * preset), resolution is identical to `resolvePeriodParams` — this only changes what "nothing in the
 * URL yet" means.
 */
export function resolvePeriodParamsAllTime(params: { from?: string; to?: string }, now: Date = new Date()): { from: string; to: string } {
  if (!params.from && !params.to) return { from: ALL_TIME_FROM, to: nowVnDateString(now) };
  return resolvePeriodParams(params, undefined, now);
}
