import { AuthorizationError } from "@/lib/auth";
import {
  fetchDailyRows,
  fetchPostedVnDatesByChannel,
  groupByChannel,
  latestFollowers,
  sumViews,
  type DailyRow,
  // Type-only — lib/kpi.ts already imports runtime values FROM lib/dashboard.ts (above), so a
  // runtime import in the other direction would be circular. `DashboardResponse` is erased at
  // compile time, so this direction stays safe. See `mergeDashboardKpi`'s doc comment below.
  type DashboardResponse,
} from "@/lib/dashboard";
import { formatCompact } from "@/lib/format";
import { metricHint, metricText, type KpiMetricRemaining } from "@/lib/kpi-format";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { addDaysToDateString, daysBetweenDateStrings, nowVnDateString } from "@/lib/time";
import { ValidationError } from "@/lib/validation";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// Re-exported so server-side callers can keep doing `import { metricText } from "@/lib/kpi"` — the
// real definitions live in lib/kpi-format.ts (see that file's header comment for why).
export { metricHint, metricText, type KpiMetricRemaining };

// ---------------------------------------------------------------------------
// Pure helpers — no Supabase, all unit-tested in kpi.test.ts. Mirrors lib/dashboard.ts's split
// (CLAUDE.md: "tính toán progress ở server-side" + every pure-math module in this repo keeps I/O
// out so the math can be tested with fake data, no DB needed).
// ---------------------------------------------------------------------------

export type KpiPeriodType = "weekly" | "custom";
export type KpiStatus = "draft" | "final";

/** `null` = that target wasn't set (25/08/2026, theo yêu cầu — a cycle needs only 1 of the 3, not
 *  all 3; docs/API_SPEC.md's original `overallPct = (viewsPct+videosPct+followersPct)/3` assumed all
 *  3 always exist, updated to match). */
export type KpiTargets = { views: number | null; videos: number | null; followers: number | null };

/** `views: null` = no day in the period has a known view number yet — same "chưa có số đo" honesty
 *  as `ChannelPeriodStat.views` (lib/dashboard.ts), never a bogus 0. `videos` is always a real count
 *  (COUNT query, 0 is a genuine answer, never unknown) — matches CLAUDE.md's "videosTrongKỳ = đếm
 *  content_video có posted_at trong kỳ". */
export type KpiActuals = { views: number | null; videos: number; followersNow: number | null };

export type KpiProgress = {
  viewsPct: number | null;
  videosPct: number | null;
  followersPct: number | null;
  /** Average of whichever of the 3 above are non-null — NOT divided by a fixed 3
   *  (docs/API_SPEC.md "Công thức progress", updated 25/08/2026). `null` only when every set
   *  target still has no computable pct (e.g. a cycle that just started, no sync yet). */
  overallPct: number | null;
  /** How many of the 3 targets were actually set — lets the UI say "đang tính trên N chỉ tiêu"
   *  instead of silently implying all 3 always applied. */
  targetCount: number;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Follower % is an ABSOLUTE MILESTONE, not a gain (CLAUDE.md): `(now − atStart) / (target − atStart)`.
 * `target === atStart` divides by zero → `null` (not `Infinity`/`NaN`) — a target equal to the
 * starting point is a degenerate cycle, not a 100% or 0% one. A channel that lost followers
 * (`now < atStart`) gets a genuine negative pct here — clamping to 0 is a UI (progress-bar) concern,
 * not a math one, so this function never clamps.
 */
export function computeProgress(targets: KpiTargets, actuals: KpiActuals, followersAtStart: number): KpiProgress {
  let targetCount = 0;

  let viewsPct: number | null = null;
  if (targets.views !== null) {
    targetCount += 1;
    if (targets.views > 0 && actuals.views !== null) viewsPct = round1((actuals.views / targets.views) * 100);
  }

  let videosPct: number | null = null;
  if (targets.videos !== null) {
    targetCount += 1;
    if (targets.videos > 0) videosPct = round1((actuals.videos / targets.videos) * 100);
  }

  let followersPct: number | null = null;
  if (targets.followers !== null) {
    targetCount += 1;
    const denom = targets.followers - followersAtStart;
    if (denom !== 0 && actuals.followersNow !== null) {
      followersPct = round1(((actuals.followersNow - followersAtStart) / denom) * 100);
    }
  }

  const known = [viewsPct, videosPct, followersPct].filter((p): p is number => p !== null);
  const overallPct = known.length > 0 ? round1(known.reduce((a, b) => a + b, 0) / known.length) : null;

  return { viewsPct, videosPct, followersPct, overallPct, targetCount };
}

/**
 * % of the cycle's calendar days that have passed, inclusive of both endpoints — day 4 of a 7-day
 * cycle (periodStart + 3) is `round(4/7*100) = 57`, matching docs/API_SPEC.md's worked example
 * (`elapsedPct: 57` next to `overallPct: 52`). Clamped to [0, 100]: a cycle that hasn't started yet
 * reads 0, one that's ended reads 100 forever after, never negative or over 100.
 */
export function elapsedPct(periodStart: string, periodEnd: string, today: string): number {
  const totalDays = daysBetweenDateStrings(periodStart, periodEnd) + 1; // inclusive; always >= 1 (DB: period_end >= period_start)
  if (today < periodStart) return 0;
  const cappedToday = today > periodEnd ? periodEnd : today;
  const elapsedDays = daysBetweenDateStrings(periodStart, cappedToday) + 1;
  return Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)));
}

export type KpiHealthValue = "green" | "yellow" | "red";

/** Named `health`, not `status` — `kpi_cycle.status` already means draft/final (the workflow
 *  state); docs/API_SPEC.md's original "Công thức progress" section reused the word `status` for
 *  this 🟢🟡🔴 traffic light, which would collide if both lived on the same object. Renamed here,
 *  doc updated to match (25/08/2026). */
export type KpiHealth = {
  value: KpiHealthValue;
  overallPct: number | null;
  elapsedPct: number;
  explanation: string;
};

/** ±10% band around elapsedPct (docs/API_SPEC.md, PRODUCT_SPEC.md #7). `overallPct === null` (no
 *  measurable data yet) can't honestly be green or red, so it reads yellow with its own explanation
 *  rather than silently defaulting to a color that implies a real number was computed. */
export function resolveStatus(overallPct: number | null, elapsedPctValue: number): KpiHealth {
  if (overallPct === null) {
    return {
      value: "yellow",
      overallPct: null,
      elapsedPct: elapsedPctValue,
      explanation: `Đã qua ${elapsedPctValue}% chu kỳ, chưa có đủ dữ liệu để tính % hoàn thành.`,
    };
  }
  const rounded = Math.round(overallPct);
  const value: KpiHealthValue =
    overallPct >= elapsedPctValue + 10 ? "green" : overallPct <= elapsedPctValue - 10 ? "red" : "yellow";
  return {
    value,
    overallPct: rounded,
    elapsedPct: elapsedPctValue,
    explanation: `Đã qua ${elapsedPctValue}% chu kỳ, hoàn thành ${rounded}% chỉ tiêu.`,
  };
}

export type KpiRemaining = {
  views: KpiMetricRemaining | null;
  videos: KpiMetricRemaining | null;
  followers: KpiMetricRemaining | null;
  daysLeft: number;
  /** Headline text for the PRIMARY metric (PRODUCT_SPEC #7: "cần X/ngày" is the main number shown
   *  to Creator, preferred over the forecast because it's pure arithmetic and "không bao giờ sai"). */
  text: string;
};

/** `remaining` is clamped to >= 0 — already past target reads "0 còn thiếu", never a confusing
 *  negative "cần −500 view/ngày". `perDay` is `null` only when `daysLeft <= 0` (can't divide). */
function remainingFor(target: number | null, actual: number | null, daysLeft: number): KpiMetricRemaining | null {
  if (target === null || actual === null) return null;
  const remaining = Math.max(0, target - actual);
  return { remaining, perDay: daysLeft > 0 ? remaining / daysLeft : null };
}

const METRIC_UNIT_LABEL = { views: "view", videos: "video", followers: "follower" } as const;

/**
 * `daysLeft` counts today as one of the remaining days (today through periodEnd, inclusive) — "còn
 * 2 ngày" reads as "today and tomorrow are still usable", not "today's already spent". `<= 0` once
 * the cycle has ended, guarded before any division.
 */
export function remainingPerDay(
  targets: KpiTargets,
  actuals: KpiActuals,
  periodEnd: string,
  today: string,
): KpiRemaining {
  const daysLeft = today > periodEnd ? 0 : daysBetweenDateStrings(today, periodEnd) + 1;
  const views = remainingFor(targets.views, actuals.views, daysLeft);
  const videos = remainingFor(targets.videos, actuals.videos, daysLeft);
  const followers = remainingFor(targets.followers, actuals.followersNow, daysLeft);

  // Views first when set (matches PRODUCT_SPEC's worked example unit), then videos, then followers
  // — same left-to-right order docs/API_SPEC.md and design/KpiForm.dc.html already list the 3
  // targets in. First SET target wins, not "biggest gap" — deterministic and easy to explain.
  const primaryKey: keyof KpiTargets | null = views ? "views" : videos ? "videos" : followers ? "followers" : null;
  const primary = primaryKey && { views, videos, followers }[primaryKey];

  let text: string;
  if (!primary || !primaryKey) {
    text = "Chưa đặt chỉ tiêu nào để tính số cần làm mỗi ngày.";
  } else if (primary.remaining <= 0) {
    text = "Đã đạt chỉ tiêu.";
  } else if (daysLeft <= 0) {
    text = `Đã hết chu kỳ, còn thiếu ${formatCompact(primary.remaining)} ${METRIC_UNIT_LABEL[primaryKey]}.`;
  } else {
    text = `Cần ${formatCompact(primary.perDay ?? 0)} ${METRIC_UNIT_LABEL[primaryKey]}/ngày trong ${daysLeft} ngày còn lại.`;
  }

  return { views, videos, followers, daysLeft, text };
}

export type KpiForecast = { overallPct: number; basis: string; confidence: "low" | "medium" } | null;

/**
 * Linear projection from the cycle's OWN average pace so far (`overallPct / elapsedPct * 100`) —
 * only computed once `elapsedPctValue >= 50` (PRODUCT_SPEC #7: extrapolating a short early window is
 * "vô nghĩa và nguy hiểm khi KPI gắn với thưởng", given views can jump 10x in 2 days).
 *
 * Simplified from PRODUCT_SPEC's "tốc độ trung bình 4 ngày qua" wording — a true last-4-days
 * velocity model needs a per-day series threaded through `attachProgress` → the API → the UI for a
 * field that's already explicitly low-stakes (`confidence: "low"/"medium"`, UI must label it "ước
 * tính"). Whole-cycle-so-far pace is simpler, still a genuine trend extrapolation, and easy to
 * upgrade later if the coarser version proves misleading in practice.
 */
export function forecastOverallPct(overallPct: number | null, elapsedPctValue: number): KpiForecast {
  if (overallPct === null || elapsedPctValue < 50) return null;
  const projected = (overallPct / elapsedPctValue) * 100;
  return {
    overallPct: Math.round(projected),
    basis: "tốc độ trung bình từ đầu kỳ",
    confidence: elapsedPctValue >= 70 ? "medium" : "low",
  };
}

export type KpiDataGaps = { missingDates: string[]; manualOnlyDates: string[] };

/**
 * `missingDates` is about VIEW reliability specifically: a date with no row at all, OR a date whose
 * resolved row has `isComplete = false` — CLAUDE.md is explicit that an incomplete snapshot must not
 * be used to compute KPI ("không dùng snapshot đó tính KPI"), and `computeProgress`'s `actuals.views`
 * is built by excluding exactly those rows before summing (see `attachProgress` below). Deliberately
 * does NOT fold `isComplete = false` into "followers unreliable" — that flag reflects the Display
 * API's video-list pagination completeness, which has nothing to do with `user/info.follower_count`
 * from the same call; treating followers as suspect too would be a false alarm.
 *
 * `manualOnlyDates` flags a date whose resolved source is `manual_entry` — a Manager-typed number,
 * unverified, covering all 3 metrics for that date (docs/DATA_SOURCES.md: "miếng vá tạm"). Days
 * after `today` (cycle not finished yet) are never counted as gaps — nothing should be expected yet.
 */
export function computeDataGaps(
  periodRows: { date: string; source: string; isComplete: boolean }[],
  periodStart: string,
  periodEnd: string,
  today: string,
): KpiDataGaps {
  const cappedEnd = periodEnd < today ? periodEnd : today;
  if (cappedEnd < periodStart) return { missingDates: [], manualOnlyDates: [] };

  const byDate = new Map(periodRows.map((r) => [r.date, r]));
  const missingDates: string[] = [];
  const manualOnlyDates: string[] = [];
  let cursor = periodStart;
  while (cursor <= cappedEnd) {
    const row = byDate.get(cursor);
    if (!row || !row.isComplete) missingDates.push(cursor);
    else if (row.source === "manual_entry") manualOnlyDates.push(cursor);
    cursor = addDaysToDateString(cursor, 1);
  }
  return { missingDates, manualOnlyDates };
}

/** First line of every mutation that touches an existing cycle — `status = 'final'` is read-only at
 *  the app layer (CLAUDE.md). M5 never produces a `final` row (that's M6's `finalize` endpoint), but
 *  this guard has to exist now so M6 doesn't have to retrofit it, and so a cycle finalized by a
 *  future M6 can't be edited/deleted through M5's routes the moment it exists. */
export function assertEditable(cycle: { status: KpiStatus }): void {
  if (cycle.status === "final") {
    throw new AuthorizationError(403, "Chu kỳ KPI đã chốt sổ — không thể sửa hoặc xoá (CLAUDE.md).");
  }
}

// ---------------------------------------------------------------------------
// Finalize (M6) — docs/API_SPEC.md `POST /api/kpi-cycles/:id/finalize`. 3 independent gates,
// evaluated together rather than short-circuited, so a Manager sees every blocker at once instead of
// fixing one and being told about the next on a second attempt.
// ---------------------------------------------------------------------------

export type FinalizeReasonCode = "too_early" | "missing_studio_data" | "has_manual_entry";

export type FinalizeReadiness = {
  ready: boolean;
  reasons: FinalizeReasonCode[];
  /** Every calendar day in the cycle whose currently-resolved source isn't `studio_import` — no row
   *  at all, or a lower-priority source is still the only one on file. Empty when gate 2 passes. */
  missingDates: string[];
  /** Every calendar day that still has a raw `manual_entry` row in `data_snapshot`, regardless of
   *  whether `studio_import` already outranks it in `v_channel_daily` — see `fetchManualEntryDates`
   *  for why this can't reuse the resolved-source check above. Empty when gate 3 passes. */
  manualEntryDates: string[];
  unlockAt: string;
};

/**
 * Gate 1: `periodEnd + 3 ngày` (2 ngày Studio trễ + 1 ngày an toàn, docs/API_SPEC.md). Deliberately
 * its OWN constant, not a reuse of `lib/import/settle-window.ts`'s window (now `importDate − 1`,
 * 25/08/2026 fix): that one controls which day an import may overwrite and gets to assume more days
 * pass safely because a bad overwrite there is still just data, correctable by importing again.
 * Finalize is irreversible and feeds bonus/salary, so it keeps the full original safety margin
 * instead of following the import window down — confirmed with the user 26/08/2026 (chốt sổ vẫn
 * chờ tới thứ Tư, không chuyển sang thứ Ba dù thứ Ba đã đủ số).
 */
export function finalizeUnlockAt(periodEnd: string): string {
  return addDaysToDateString(periodEnd, 3);
}

/**
 * Gate 2: every calendar day in `[periodStart, periodEnd]` whose resolved `v_channel_daily` row is
 * `studio_import` — a plain "does a row exist" check isn't enough, a day still sitting on
 * `display_api` (tạm tính) or `manual_entry` counts the same as a missing day here. `resolvedRows`
 * is expected to already be scoped to one channel and this date range (`fetchDailyRows`).
 */
export function findNonStudioDates(
  resolvedRows: { date: string; source: string }[],
  periodStart: string,
  periodEnd: string,
): string[] {
  const sourceByDate = new Map(resolvedRows.map((r) => [r.date, r.source]));
  const dates: string[] = [];
  let cursor = periodStart;
  while (cursor <= periodEnd) {
    if (sourceByDate.get(cursor) !== "studio_import") dates.push(cursor);
    cursor = addDaysToDateString(cursor, 1);
  }
  return dates;
}

/**
 * Gate 3's data source — raw `data_snapshot`, NOT `v_channel_daily`. `lib/import/run-import.ts`
 * never deletes a `manual_entry` row once `studio_import` lands for the same date, it only adds the
 * higher-priority row alongside it (`source_rank()`, migration 0005) — so a date can pass gate 2
 * (resolved source is studio_import) while a manual_entry row still physically sits underneath it.
 * CLAUDE.md is explicit that finalize must block on that too ("không cho chốt sổ chu kỳ còn chứa
 * nó"), so this checks the table directly instead of trusting the view's resolution.
 */
export async function fetchManualEntryDates(
  supabase: SupabaseServerClient,
  channelId: string,
  periodStart: string,
  periodEnd: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("data_snapshot")
    .select("date")
    .eq("channel_id", channelId)
    .eq("source", "manual_entry")
    .gte("date", periodStart)
    .lte("date", periodEnd);
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => r.date as string))].sort();
}

/** Runs all 3 finalize gates for one cycle. Read-only — callers decide what to do with the result
 *  (route/action layer owns turning `ready: false` into a 422, same split as everywhere else in this
 *  file that a mutation's preconditions are checked by the caller, not thrown from deep inside). */
export async function checkFinalizeReadiness(
  supabase: SupabaseServerClient,
  cycle: Pick<KpiCycleSummary, "channelId" | "periodStart" | "periodEnd">,
): Promise<FinalizeReadiness> {
  const unlockAt = finalizeUnlockAt(cycle.periodEnd);
  const timeOk = nowVnDateString() >= unlockAt;

  const [resolvedRows, manualEntryDates] = await Promise.all([
    fetchDailyRows(supabase, [cycle.channelId], cycle.periodStart, cycle.periodEnd),
    fetchManualEntryDates(supabase, cycle.channelId, cycle.periodStart, cycle.periodEnd),
  ]);
  const missingDates = findNonStudioDates(resolvedRows, cycle.periodStart, cycle.periodEnd);

  const reasons: FinalizeReasonCode[] = [];
  if (!timeOk) reasons.push("too_early");
  if (missingDates.length > 0) reasons.push("missing_studio_data");
  if (manualEntryDates.length > 0) reasons.push("has_manual_entry");

  return { ready: reasons.length === 0, reasons, missingDates, manualEntryDates, unlockAt };
}

/** Locks the cycle. Assumes the caller already ran `checkFinalizeReadiness()` and confirmed
 *  `status !== 'final'` — doesn't re-check either itself, same split `updateKpiCycle`/
 *  `deleteKpiCycle` already use (this file checks business preconditions, the route/action layer
 *  checks the object still exists and owns writing `audit_log` after success). */
export async function finalizeKpiCycle(
  supabase: SupabaseServerClient,
  id: string,
  finalizedBy: string,
): Promise<KpiCycleSummary> {
  const { data, error } = await supabase
    .from("kpi_cycle")
    .update({ status: "final", finalized_by: finalizedBy, finalized_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return toKpiCycleSummary(data);
}

/** Display name for `finalizedBy`/`finalized_at` on the finalize review screen — `kpi_cycle` stores
 *  only the manager's uuid (FK to `manager(id)`), never a name, so resolving it to something a
 *  Manager can read is a separate lookup. `manager` grants `select` to any authenticated role
 *  (20260820000006_rls.sql, "the UI shows who assigned what"), so the regular session client is
 *  enough — no admin client needed. */
export async function getManagerNameById(supabase: SupabaseServerClient, id: string): Promise<string | null> {
  const { data, error } = await supabase.from("manager").select("name").eq("id", id).maybeSingle();
  if (error) throw error;
  return data?.name ?? null;
}

// ---------------------------------------------------------------------------
// I/O layer
// ---------------------------------------------------------------------------

export type KpiCycleSummary = {
  id: string;
  channelId: string;
  periodType: KpiPeriodType;
  periodStart: string;
  periodEnd: string;
  targetViews: number | null;
  targetVideos: number | null;
  targetFollowers: number | null;
  followersAtStart: number;
  status: KpiStatus;
  finalizedBy: string | null;
  finalizedAt: string | null;
  createdAt: string;
};

type KpiCycleRow = {
  id: string;
  channel_id: string;
  period_type: KpiPeriodType;
  period_start: string;
  period_end: string;
  target_views: number | string | null;
  target_videos: number | string | null;
  target_followers: number | string | null;
  followers_at_start: number | string;
  status: KpiStatus;
  finalized_by: string | null;
  finalized_at: string | null;
  created_at: string;
};

function toKpiCycleSummary(row: KpiCycleRow): KpiCycleSummary {
  const num = (v: number | string | null) => (v === null ? null : Number(v));
  return {
    id: row.id,
    channelId: row.channel_id,
    periodType: row.period_type,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    targetViews: num(row.target_views),
    targetVideos: num(row.target_videos),
    targetFollowers: num(row.target_followers),
    followersAtStart: Number(row.followers_at_start),
    status: row.status,
    finalizedBy: row.finalized_by,
    finalizedAt: row.finalized_at,
    createdAt: row.created_at,
  };
}

/**
 * The channel's most recent `followers` that isn't `null` — NOT `v_channel_latest` (that's the most
 * recent ROW regardless of column, which can be a `display_api` day that only carries views). Reads
 * `v_channel_daily` directly (CLAUDE.md: never query `data_snapshot` straight), so this already
 * respects the same source-priority resolution every other screen uses. `null` means the channel has
 * no follower number at all yet — callers must block cycle creation on that, not fall back to 0.
 */
export async function captureFollowersAtStart(
  supabase: SupabaseServerClient,
  channelId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("v_channel_daily")
    .select("followers")
    .eq("channel_id", channelId)
    .not("followers", "is", null)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.followers !== null && data?.followers !== undefined ? Number(data.followers) : null;
}

export async function listKpiCycles(
  supabase: SupabaseServerClient,
  opts: { channelId?: string; status?: KpiStatus; activeOnly?: boolean; creatorId?: string } = {},
): Promise<KpiCycleSummary[]> {
  let query = supabase.from("kpi_cycle").select("*").order("period_start", { ascending: false });
  if (opts.channelId) query = query.eq("channel_id", opts.channelId);
  if (opts.status) query = query.eq("status", opts.status);

  if (opts.creatorId) {
    const { data: channels, error: channelsError } = await supabase
      .from("channel")
      .select("id")
      .eq("current_creator_id", opts.creatorId);
    if (channelsError) throw channelsError;
    const ids = (channels ?? []).map((c) => c.id as string);
    if (ids.length === 0) return [];
    query = query.in("channel_id", ids);
  }

  const { data, error } = await query;
  if (error) throw error;
  let cycles = (data ?? []).map(toKpiCycleSummary);

  // Same VN-calendar-day convention as every other "today" comparison in this app (lib/time.ts).
  if (opts.activeOnly) {
    const today = nowVnDateString();
    cycles = cycles.filter((c) => c.periodStart <= today && today <= c.periodEnd);
  }

  return cycles;
}

/** Single-cycle fetch — the edit page (`/kpi/[id]/edit`) needs one row by id, which none of
 *  `listKpiCycles`'s filters (channelId/status/activeOnly/creatorId) directly express. */
export async function getKpiCycleById(supabase: SupabaseServerClient, id: string): Promise<KpiCycleSummary | null> {
  const { data, error } = await supabase.from("kpi_cycle").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toKpiCycleSummary(data) : null;
}

export type CreateKpiCycleInput = {
  channelId: string;
  periodType: KpiPeriodType;
  periodStart: string;
  periodEnd: string;
  targetViews?: number | null;
  targetVideos?: number | null;
  targetFollowers?: number | null;
};

/**
 * Blocks on 2 things `PATCH`/DB constraints can't catch cleanly: fewer than 1 target set (25/08/2026,
 * theo yêu cầu — the DB has no CHECK for "at least one of 3 nullable columns"), and a channel with no
 * `followers` reading yet (`followers_at_start` is `NOT NULL` and never editable — CLAUDE.md — so a
 * cycle created against a guess could never be corrected). Both are `ValidationError` → `400`
 * (docs/API_SPEC.md, not the `422` shape reserved for M6's `finalize`). The one thing this does NOT
 * check is overlapping date ranges — `kpi_cycle_no_overlap` (the `EXCLUDE USING gist` constraint,
 * 20260820000004_kpi_audit.sql) does that at the DB layer; the insert's `23P01` surfaces up to
 * `errorResponse()` as a `409` instead of being re-checked here.
 */
export async function createKpiCycle(
  supabase: SupabaseServerClient,
  input: CreateKpiCycleInput,
): Promise<KpiCycleSummary> {
  if (input.periodEnd < input.periodStart) {
    throw new ValidationError("Ngày kết thúc phải sau ngày bắt đầu.");
  }
  const targetViews = input.targetViews ?? null;
  const targetVideos = input.targetVideos ?? null;
  const targetFollowers = input.targetFollowers ?? null;
  if (targetViews === null && targetVideos === null && targetFollowers === null) {
    throw new ValidationError("Phải đặt ít nhất một chỉ tiêu (lượt xem, video hoặc follower).");
  }

  const followersAtStart = await captureFollowersAtStart(supabase, input.channelId);
  if (followersAtStart === null) {
    throw new ValidationError(
      "Kênh này chưa có số follower nào được ghi nhận — chưa thể tạo chu kỳ KPI. Nhập tay 1 ngày dữ liệu ở /import/manual-entry, hoặc chờ đồng bộ Display API rồi thử lại.",
    );
  }

  const { data, error } = await supabase
    .from("kpi_cycle")
    .insert({
      channel_id: input.channelId,
      period_type: input.periodType,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      target_views: targetViews,
      target_videos: targetVideos,
      target_followers: targetFollowers,
      followers_at_start: followersAtStart,
    })
    .select("*")
    .single();
  if (error) throw error; // 23P01 (date overlap) passes through — errorResponse() maps it to 409

  return toKpiCycleSummary(data);
}

export type UpdateKpiCycleInput = {
  periodStart?: string;
  periodEnd?: string;
  targetViews?: number | null;
  targetVideos?: number | null;
  targetFollowers?: number | null;
};

/** `channelId`/`followersAtStart` are never patchable — changing the channel would make the
 *  already-captured `followersAtStart` meaningless (docs/API_SPEC.md). Blocked entirely once
 *  `status = 'final'` (`assertEditable`). */
export async function updateKpiCycle(
  supabase: SupabaseServerClient,
  id: string,
  input: UpdateKpiCycleInput,
): Promise<KpiCycleSummary> {
  const { data: existing, error: fetchError } = await supabase.from("kpi_cycle").select("*").eq("id", id).single();
  if (fetchError) throw fetchError;
  const current = toKpiCycleSummary(existing);
  assertEditable(current);

  const nextStart = input.periodStart ?? current.periodStart;
  const nextEnd = input.periodEnd ?? current.periodEnd;
  if (nextEnd < nextStart) throw new ValidationError("Ngày kết thúc phải sau ngày bắt đầu.");

  const nextViews = input.targetViews !== undefined ? input.targetViews : current.targetViews;
  const nextVideos = input.targetVideos !== undefined ? input.targetVideos : current.targetVideos;
  const nextFollowers = input.targetFollowers !== undefined ? input.targetFollowers : current.targetFollowers;
  if (nextViews === null && nextVideos === null && nextFollowers === null) {
    throw new ValidationError("Phải giữ lại ít nhất một chỉ tiêu.");
  }

  const patch: Record<string, unknown> = {};
  if (input.periodStart !== undefined) patch.period_start = input.periodStart;
  if (input.periodEnd !== undefined) patch.period_end = input.periodEnd;
  if (input.targetViews !== undefined) patch.target_views = input.targetViews;
  if (input.targetVideos !== undefined) patch.target_videos = input.targetVideos;
  if (input.targetFollowers !== undefined) patch.target_followers = input.targetFollowers;

  if (Object.keys(patch).length === 0) return current;

  const { data, error } = await supabase.from("kpi_cycle").update(patch).eq("id", id).select("*").single();
  if (error) throw error; // 23P01 possible too, if the date edit now overlaps another cycle

  return toKpiCycleSummary(data);
}

/** Only ever deletes a `draft` cycle (`assertEditable`) — `audit_log` is written by the caller
 *  (route handler/Server Action) after success, same convention as `deleteChannel`/`deleteCreator`
 *  (lib/channels.ts, lib/creators.ts: the lib function does the mutation, the entry point logs it). */
export async function deleteKpiCycle(supabase: SupabaseServerClient, id: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase.from("kpi_cycle").select("*").eq("id", id).maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) throw new ValidationError("Chu kỳ KPI không tồn tại.");
  assertEditable(toKpiCycleSummary(existing));

  const { error } = await supabase.from("kpi_cycle").delete().eq("id", id);
  if (error) throw error;
}

export type KpiCycleWithProgress = KpiCycleSummary & {
  /** Raw measured numbers behind `progress`'s percentages — the UI needs these to render "470k /
   *  500k" style text (docs/API_SPEC.md's `myChannels[].metrics[].text` shape) next to each bar,
   *  which a bare pct can't reconstruct on its own. */
  actuals: KpiActuals;
  progress: KpiProgress;
  health: KpiHealth;
  remaining: KpiRemaining;
  forecast: KpiForecast;
  dataGaps: KpiDataGaps;
};

/**
 * Computes progress for every cycle in ONE round trip pair, not one pair per cycle — Supabase is in
 * Tokyo, the function runs in Hong Kong (~50ms/round-trip, CLAUDE.md), and `/kpi` can list every
 * channel's cycles at once. Fetches the union bounding window across all cycles' channels once, then
 * slices per cycle in memory — same pattern `getChannelPeriodStats` (lib/dashboard.ts) already uses.
 */
export async function attachProgress(
  supabase: SupabaseServerClient,
  cycles: KpiCycleSummary[],
): Promise<KpiCycleWithProgress[]> {
  if (cycles.length === 0) return [];

  const channelIds = [...new Set(cycles.map((c) => c.channelId))];
  const minStart = cycles.reduce((min, c) => (c.periodStart < min ? c.periodStart : min), cycles[0].periodStart);
  const maxEnd = cycles.reduce((max, c) => (c.periodEnd > max ? c.periodEnd : max), cycles[0].periodEnd);
  const today = nowVnDateString();

  const [dailyRows, postedDatesByChannel] = await Promise.all([
    fetchDailyRows(supabase, channelIds, minStart, maxEnd),
    fetchPostedVnDatesByChannel(supabase, channelIds, minStart, maxEnd),
  ]);
  const dailyByChannel = groupByChannel(dailyRows);

  return cycles.map((cycle) => {
    const allRows = dailyByChannel.get(cycle.channelId) ?? [];
    const periodRows: DailyRow[] = allRows.filter((r) => r.date >= cycle.periodStart && r.date <= cycle.periodEnd);
    // CLAUDE.md: an is_complete=false snapshot must not be used to compute KPI — excluded from the
    // views sum specifically (see computeDataGaps's doc comment for why this doesn't also apply to
    // followers/videos).
    const completeRows = periodRows.filter((r) => r.isComplete);
    const views = sumViews(completeRows);

    const postedDates = (postedDatesByChannel.get(cycle.channelId) ?? []).filter(
      (d) => d >= cycle.periodStart && d <= cycle.periodEnd,
    );
    const followersNow = latestFollowers(periodRows);

    const targets: KpiTargets = { views: cycle.targetViews, videos: cycle.targetVideos, followers: cycle.targetFollowers };
    const actuals: KpiActuals = { views, videos: postedDates.length, followersNow };

    const progress = computeProgress(targets, actuals, cycle.followersAtStart);
    const elapsed = elapsedPct(cycle.periodStart, cycle.periodEnd, today);
    const health = resolveStatus(progress.overallPct, elapsed);
    const remaining = remainingPerDay(targets, actuals, cycle.periodEnd, today);
    const forecast = forecastOverallPct(progress.overallPct, elapsed);
    const dataGaps = computeDataGaps(periodRows, cycle.periodStart, cycle.periodEnd, today);

    return { ...cycle, actuals, progress, health, remaining, forecast, dataGaps };
  });
}

// ---------------------------------------------------------------------------
// GET /api/dashboard integration (M5) — kept here rather than in lib/dashboard.ts's getDashboard()
// itself, since that would need a runtime import FROM lib/kpi.ts while lib/kpi.ts already imports
// runtime values FROM lib/dashboard.ts above (fetchDailyRows, groupByChannel, ...) — a two-way
// runtime dependency between the same two files. Callers (app/(app)/page.tsx,
// app/api/dashboard/route.ts) call getDashboard() first, then buildDashboardKpiSummary() using its
// `channels` field, then mergeDashboardKpi() to splice the two results into one response — 3 calls
// instead of 1, but no circular import between the two lib modules.
// ---------------------------------------------------------------------------

export type DashboardKpiSummary = {
  onTrack: number;
  atRisk: number;
  behind: number;
  attention: { channelId: string; channelName: string; reason: string }[];
};

export type DashboardMyChannelKpi = {
  overallStatus: KpiHealthValue | null;
  hasActiveKpi: boolean;
  metrics: { name: string; pct: number; text: string; hint: string }[];
};

/**
 * `kpiSummary` + each channel's KPI fields for `myChannels[]`, scoped to exactly the channel set
 * `getDashboard()` already resolved (respecting role/creatorId/teamId) — pass its `channels` field
 * straight through, no second filter query. `onTrack`/`atRisk`/`behind` count this channel set's
 * currently-ACTIVE cycles by `health.value`; `attention` lists every `red` one (no top-N cap,
 * matching the 24/08/2026 "no artificial top-N" decision already applied to growth/viewShare/
 * efficiency — CLAUDE.md, docs/TASKS.md M4 notes).
 */
export async function buildDashboardKpiSummary(
  supabase: SupabaseServerClient,
  channels: { id: string; name: string }[],
): Promise<{ kpiSummary: DashboardKpiSummary; byChannel: Map<string, DashboardMyChannelKpi> }> {
  const channelIds = new Set(channels.map((c) => c.id));
  const nameById = new Map(channels.map((c) => [c.id, c.name]));

  const allActive = await listKpiCycles(supabase, { activeOnly: true });
  const scoped = allActive.filter((c) => channelIds.has(c.channelId));
  const withProgress = await attachProgress(supabase, scoped);

  let onTrack = 0;
  let atRisk = 0;
  let behind = 0;
  const attention: { channelId: string; channelName: string; reason: string }[] = [];
  const byChannel = new Map<string, DashboardMyChannelKpi>();

  for (const cycle of withProgress) {
    if (cycle.health.value === "green") onTrack += 1;
    else if (cycle.health.value === "yellow") atRisk += 1;
    else behind += 1;

    if (cycle.health.value === "red") {
      attention.push({
        channelId: cycle.channelId,
        channelName: nameById.get(cycle.channelId) ?? "",
        reason: cycle.health.explanation,
      });
    }

    const metrics: { name: string; pct: number; text: string; hint: string }[] = [];
    if (cycle.targetViews !== null && cycle.progress.viewsPct !== null) {
      metrics.push({
        name: "views",
        pct: cycle.progress.viewsPct,
        text: metricText(cycle.actuals.views, cycle.targetViews, "view"),
        hint: metricHint(cycle.remaining.views, "view"),
      });
    }
    if (cycle.targetVideos !== null && cycle.progress.videosPct !== null) {
      metrics.push({
        name: "videos",
        pct: cycle.progress.videosPct,
        text: metricText(cycle.actuals.videos, cycle.targetVideos, "video"),
        hint: metricHint(cycle.remaining.videos, "video"),
      });
    }
    if (cycle.targetFollowers !== null && cycle.progress.followersPct !== null) {
      metrics.push({
        name: "followers",
        pct: cycle.progress.followersPct,
        text: metricText(cycle.actuals.followersNow, cycle.targetFollowers, "follower"),
        hint: metricHint(cycle.remaining.followers, "follower"),
      });
    }

    byChannel.set(cycle.channelId, { overallStatus: cycle.health.value, hasActiveKpi: true, metrics });
  }

  return { kpiSummary: { onTrack, atRisk, behind, attention }, byChannel };
}

/** Splices `buildDashboardKpiSummary`'s result into a `getDashboard()` response — replaces the
 *  hard-coded `{onTrack:0,atRisk:0,behind:0,attention:[]}` (docs/TASKS.md: "M5 hasn't created any
 *  kpi_cycle row yet", no longer true) and fills in each `myChannels[]` entry's KPI fields. A
 *  channel with no active cycle keeps `getDashboard()`'s own default
 *  (`hasActiveKpi:false, overallStatus:null, metrics:[]`) — `byChannel.get()` returning `undefined`
 *  spreads nothing on top of it. */
export function mergeDashboardKpi(
  dashboard: DashboardResponse,
  slice: { kpiSummary: DashboardKpiSummary; byChannel: Map<string, DashboardMyChannelKpi> },
): DashboardResponse {
  return {
    ...dashboard,
    kpiSummary: slice.kpiSummary,
    myChannels: dashboard.myChannels
      ? dashboard.myChannels.map((mc) => ({ ...mc, ...(slice.byChannel.get(mc.channelId) ?? {}) }))
      : null,
  };
}
