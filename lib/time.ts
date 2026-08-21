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
