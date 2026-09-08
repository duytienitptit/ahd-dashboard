import type { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ALL_TIME_FROM,
  addDaysToDateString,
  dateRangeInclusive,
  daysBetweenDateStrings,
  nowVnDateString,
  vnMidnightIso,
} from "@/lib/time";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// ---------------------------------------------------------------------------
// Pure helpers — no Supabase, all unit-tested in dashboard.test.ts. Every screen that shows a
// period-over-period number (Tổng quan, Kênh, Chi tiết kênh, Creator) goes through these so the
// math can't drift between screens (CLAUDE.md: "tính progress ở server-side").
// ---------------------------------------------------------------------------

/** `null` when there's nothing to compare against — an honest "no prior data" instead of a bogus
 *  +Infinity% or a silently-wrong 0%. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Fraction of the comparison period's measured days the current period must also have measured
 *  before a period-over-period view % is worth showing. */
const VIEWS_DELTA_MIN_COVERAGE_RATIO = 0.7;

/**
 * Whether a "so với kỳ trước" view % is trustworthy, given how many COMPLETE measured view-days
 * each side actually has (`isComplete` rows only — a truncated/rate-limited read is excluded from
 * the view sums too, same rule lib/kpi.ts applies: "không dùng snapshot đó tính KPI").
 *
 * A today-anchored window structurally trails its comparison window by a day or two — today isn't
 * synced until ~23:30 and Studio reconciliation runs 2+ days behind (CLAUDE.md) — so a small
 * shortfall is normal and still comparable. This only rejects the case where the current period is
 * so sparse next to the one it's compared against that a raw sum-vs-sum % is really just measuring
 * the missing days (the "−95% vì kỳ này mới có 1/7 ngày có số" bug, 27/08/2026). When it returns
 * false, callers null out `viewsDeltaPct` and set `viewsDeltaInsufficientData` so the UI shows "—"
 * with a "chưa đủ dữ liệu trong kỳ" note instead of a scary bogus drop.
 *
 * Only meaningful when the comparison period itself has data (`previousMeasuredDays >= 1`); callers
 * already keep `viewsDeltaPct = null` (the plain "no prior data" case) when it doesn't.
 */
export function viewsDeltaComparable(currentMeasuredDays: number, previousMeasuredDays: number): boolean {
  if (previousMeasuredDays <= 0) return false;
  return currentMeasuredDays >= Math.ceil(previousMeasuredDays * VIEWS_DELTA_MIN_COVERAGE_RATIO);
}

/**
 * Sums a channel set's per-channel `views`, keeping the unknown-vs-known-zero distinction that
 * `ChannelPeriodStat.views` carries ("Render as '—', never '0 view'").
 *
 * A `null` channel contributing nothing to the total is correct and unchanged — that's ordinary
 * rollup semantics as long as SOMETHING in the set was measured. The degenerate case is the one
 * that used to lie: when every channel is `null`, a plain `?? 0` sum produces `0`, and the UI
 * renders "0 view" — a confident claim that the channels got no views, when the truth is that no
 * day could be measured at all (28/08/2026: cron had never run, so a "7 ngày qua" window had zero
 * complete days and every screen showed a dead team). Same `unknown ≠ known-zero` rule
 * lib/tiktok/sync.ts applies when it writes `video_views: null`.
 *
 * An empty channel set is `null` for the same reason — a team with no channels yet has nothing to
 * report, not a measured zero.
 */
export function sumViewsOrNull(values: (number | null)[]): number | null {
  const measured = values.filter((v): v is number => v !== null);
  return measured.length === 0 ? null : measured.reduce((acc, v) => acc + v, 0);
}

/** The immediately-preceding period of the SAME length as `[from, to]` — "so với kỳ trước" has to
 *  mean "the same number of days, right before this one" once the period is a user-picked range
 *  instead of always 7 days (M4 date-range picker). */
export function previousPeriod(from: string, to: string): { comparedFrom: string; comparedTo: string } {
  const lengthDays = daysBetweenDateStrings(from, to) + 1;
  const comparedTo = addDaysToDateString(from, -1);
  const comparedFrom = addDaysToDateString(comparedTo, -(lengthDays - 1));
  return { comparedFrom, comparedTo };
}

/** Monday of `dateStr`'s ISO week, as the bucket's sort key. Pure calendar-date arithmetic on an
 *  already-VN date string — no timezone conversion (matches lib/time.ts's addDaysToDateString). */
export function isoWeekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum);
  return date.toISOString().slice(0, 10);
}

/** Monday of the current ISO week (VN calendar day) through today — the fixed "tuần này" window
 *  `growth` and `weekStats` use, independent of whatever `[from, to]` the page is filtered to
 *  (04/09/2026, theo yêu cầu: "tăng trưởng" phải luôn là tuần lịch thật, không lùi theo độ dài kỳ
 *  đang chọn — kỳ "Toàn bộ thời gian" từng đẩy kỳ so sánh lùi về trước khi kênh tồn tại, ra "+0" giả). */
export function thisWeekRangeVn(now?: Date): { from: string; to: string } {
  const to = nowVnDateString(now);
  return { from: isoWeekStart(to), to };
}

/**
 * Nhãn trục X của biểu đồ tuần: **ngày bắt đầu tuần** dạng `d/M` ("31/8", "7/9"), không có năm.
 *
 * Đổi từ số thứ tự tuần ISO ("T34") ngày 07/09/2026 (theo yêu cầu) — lệch có chủ đích so với
 * `design/Main.dc.html`. Lý do: "T34" bắt người đọc tự tra tuần 34 rơi vào ngày nào mới đối chiếu
 * được với các màn khác (vốn đều hiển thị ngày thật), trong khi nhãn ngày đọc phát hiểu ngay. Bỏ năm
 * cho gọn — biểu đồ chỉ trải 8 tuần / 6 tháng gần nhất nên không thể lẫn năm.
 *
 * Vẫn nhận **bất kỳ ngày nào trong tuần** rồi tự quy về thứ Hai (`isoWeekStart`), nên gọi được với
 * ngày đại diện của bucket giống hệt `isoWeekLabel` cũ — chỗ gọi không phải đổi.
 */
export function weekStartLabel(dateStr: string): string {
  return dayLabel(isoWeekStart(dateStr));
}

/** Nhãn trục X của biểu đồ NGÀY (mốc "ngày", 14 ngày gần nhất): `d/M` ("7/9", "13/9"), không zero-pad,
 *  không có năm, KHÔNG quy về thứ Hai. Cùng hình dạng với `weekStartLabel` một cách có chủ đích —
 *  chỉ một mốc render tại một thời điểm, và subtitle ("14 ngày gần nhất" vs "8 tuần gần nhất") cùng
 *  `TOOLTIP_PREFIX` ("ngày 7/9" vs "tuần 7/9") đã đủ phân biệt. `formatShortDate` KHÔNG dùng được ở
 *  đây vì nó zero-pad ("07/09") → lệch nhìn với trục tuần. */
export function dayLabel(dateStr: string): string {
  const [, month, day] = dateStr.split("-").map(Number);
  return `${day}/${month}`;
}

export type DailyRow = {
  channelId: string;
  date: string;
  videoViews: number | null;
  videoCount: number | null;
  followers: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  totalViewers: number | null;
  newViewers: number | null;
  returningViewers: number | null;
  profileViews: number | null;
  source: string;
  isComplete: boolean;
};

/** `null` when not one row in `rows` has a known `videoViews` — an honest "chưa có số đo", not a
 *  bogus 0 (same principle CLAUDE.md applies to CSV `"undefined"`: never silently become 0). A
 *  period where SOME days are known still sums those and ignores the unknown ones. */
export function sumViews(rows: DailyRow[]): number | null {
  const known = rows.filter((r) => r.videoViews !== null);
  if (known.length === 0) return null;
  return known.reduce((sum, r) => sum + r.videoViews!, 0);
}

export function sumEngagementParts(rows: DailyRow[]): { likes: number; comments: number; shares: number } {
  return rows.reduce(
    (acc, r) => ({
      likes: acc.likes + (r.likes ?? 0),
      comments: acc.comments + (r.comments ?? 0),
      shares: acc.shares + (r.shares ?? 0),
    }),
    { likes: 0, comments: 0, shares: 0 },
  );
}

export function engagementRate(rows: DailyRow[]): number | null {
  const views = sumViews(rows);
  if (views === null || views <= 0) return null;
  const { likes, comments, shares } = sumEngagementParts(rows);
  return (likes + comments + shares) / views;
}

/** Last known followers value in `rows` (expects ascending-by-date input), skipping null rows. */
export function latestFollowers(rows: DailyRow[]): number | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].followers !== null) return rows[i].followers;
  }
  return null;
}

export type ViewerRatio = {
  date: string;
  totalViewers: number;
  newViewers: number;
  /** Từ cùng row Viewers.csv — `null` nếu ngày đó chỉ có `Total`/`New` (hiếm, nhưng CSV cho phép). */
  returningViewers: number | null;
  /** Overview.csv, ghi chung row `studio_import` với các số trên — `null` nếu ngày đó Overview chưa
   *  phủ (cửa sổ chốt của 2 file có thể lệch nhau). */
  profileViews: number | null;
  ratio: number;
};

/** `newViewers/totalViewers` — Viewers.csv-only fields, so only `studio_import` rows ever carry
 *  them. Picks the most recent row (expects ascending-by-date input) that actually has both; carries
 *  `returningViewers` + `profileViews` from that same row (both written together on a Studio import). */
export function latestViewerRatio(rows: DailyRow[]): ViewerRatio | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row.totalViewers !== null && row.totalViewers > 0 && row.newViewers !== null) {
      return {
        date: row.date,
        totalViewers: row.totalViewers,
        newViewers: row.newViewers,
        returningViewers: row.returningViewers,
        profileViews: row.profileViews,
        ratio: row.newViewers / row.totalViewers,
      };
    }
  }
  return null;
}

/** Groups already-fetched rows by channel — one Supabase round trip serves every per-channel card
 *  (growth / viewShare / efficiency / Channels table / Creator cards). */
export function groupByChannel(rows: DailyRow[]): Map<string, DailyRow[]> {
  const map = new Map<string, DailyRow[]>();
  for (const row of rows) {
    const list = map.get(row.channelId);
    if (list) list.push(row);
    else map.set(row.channelId, [row]);
  }
  return map;
}

/** Priority order a single day's `source` is picked by when multiple channels disagree — same order
 *  as `v_channel_daily`'s `source_rank()` (docs/DATABASE_ERD.md) and CLAUDE.md's
 *  "studio_import > business_api > display_api > vendor_scraping > manual_entry". Index = strength,
 *  lower is stronger. An unrecognized value sorts as weakest rather than throwing — defensive only,
 *  every real row's `source` is one of these five. */
const SOURCE_PRIORITY = ["studio_import", "business_api", "display_api", "vendor_scraping", "manual_entry"];
function sourceRank(source: string): number {
  const rank = SOURCE_PRIORITY.indexOf(source);
  return rank === -1 ? SOURCE_PRIORITY.length : rank;
}

/**
 * Merges one or more channels' `DailyRow`s into a single row per date — the Nhân sự detail page's
 * `DailyTable` shows one Creator's whole channel set as one timeline, not N side-by-side tables.
 * `channelCount` is the number of channels the caller expects a complete day to have data from (not
 * derived from `rows` itself — a day where every channel is silently missing wouldn't appear in
 * `rows` at all, so counting distinct channelIds present per day would never catch that case).
 *
 * Sums follow the same null-vs-0 rule as `sumViews`: a metric is `null` for a date only when NOT ONE
 * of that day's channel rows has a known value for it — never a bogus 0 standing in for "chưa có số
 *  đo". `source` takes the WEAKEST source among that day's rows (CLAUDE.md priority order) — a merged
 * day is only as trustworthy as its worst-covered channel. `isComplete` requires both every
 * contributing row to itself be complete AND every expected channel to have contributed a row that
 * day (a channel silently absent — e.g. rate-limited out of the sync — must not read as "đầy đủ").
 */
export function mergeDailyRowsByDate(rows: DailyRow[], channelCount: number): DailyRow[] {
  type Acc = {
    date: string;
    channelsPresent: number;
    videoViews: number | null;
    videoCount: number | null;
    followers: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    totalViewers: number | null;
    newViewers: number | null;
    returningViewers: number | null;
    profileViews: number | null;
    weakestSource: string;
    isComplete: boolean;
  };

  const byDate = new Map<string, Acc>();
  const addNullable = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));

  for (const row of rows) {
    const existing = byDate.get(row.date);
    const acc: Acc = existing ?? {
      date: row.date,
      channelsPresent: 0,
      videoViews: null,
      videoCount: null,
      followers: null,
      likes: null,
      comments: null,
      shares: null,
      totalViewers: null,
      newViewers: null,
      returningViewers: null,
      profileViews: null,
      weakestSource: row.source,
      isComplete: true,
    };

    acc.channelsPresent += 1;
    acc.videoViews = addNullable(acc.videoViews, row.videoViews);
    acc.videoCount = addNullable(acc.videoCount, row.videoCount);
    acc.followers = addNullable(acc.followers, row.followers);
    acc.likes = addNullable(acc.likes, row.likes);
    acc.comments = addNullable(acc.comments, row.comments);
    acc.shares = addNullable(acc.shares, row.shares);
    acc.totalViewers = addNullable(acc.totalViewers, row.totalViewers);
    acc.newViewers = addNullable(acc.newViewers, row.newViewers);
    acc.returningViewers = addNullable(acc.returningViewers, row.returningViewers);
    acc.profileViews = addNullable(acc.profileViews, row.profileViews);
    if (sourceRank(row.source) > sourceRank(acc.weakestSource)) acc.weakestSource = row.source;
    acc.isComplete = acc.isComplete && row.isComplete;

    byDate.set(row.date, acc);
  }

  return [...byDate.values()]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((acc) => ({
      channelId: "merged",
      date: acc.date,
      videoViews: acc.videoViews,
      videoCount: acc.videoCount,
      followers: acc.followers,
      likes: acc.likes,
      comments: acc.comments,
      shares: acc.shares,
      totalViewers: acc.totalViewers,
      newViewers: acc.newViewers,
      returningViewers: acc.returningViewers,
      profileViews: acc.profileViews,
      source: acc.weakestSource,
      isComplete: acc.isComplete && acc.channelsPresent === channelCount,
    }));
}

/** `value: null` = not one day this week has a known videoViews — the chart must render this as a
 *  gap, never as a plotted 0 (a flat "0 views for 5 weeks" line reads as a real crash, not as
 *  "chưa có số đo"). */
export type TrendPoint = {
  label: string;
  value: number | null;
  /**
   * Chỉ có mặt ở điểm CUỐI khi kỳ đó **chưa kết thúc** tính tới `now` (07/09/2026, theo yêu cầu —
   * xem `withUnfinishedMarks`). `days` = số ngày trong kỳ đã có thể có dữ liệu (tới `through`), `0`
   * nếu kỳ chưa chạm ngày nào; `totalDays` = độ dài trọn của kỳ (7 tuần, 28–31 tháng).
   *
   * Lý do: `bucketViewsBy` cộng mọi ngày có trong bucket rồi vẽ, không phân biệt kỳ đủ hay kỳ dở.
   * Sáng thứ Ba, cột "tuần này" mới có 1/7 ngày nhưng đứng cạnh 7 cột tuần đủ 7 ngày → vẽ ra một cột
   * thấp lè tè, đọc như "lượt xem sụp đổ". Cùng loại bug với `−90%` giả mà `viewsDeltaComparable`
   * sinh ra để chặn (27/08/2026), chỉ khác là ở tầng biểu đồ. Tháng còn nặng hơn tuần: mùng 7 mà so
   * với tháng 31 ngày liền trước thì hụt tới 4/5.
   *
   * KHÔNG giấu điểm đó đi — UI vẽ nét đứt + ghi rõ "mới có N/M ngày", đúng nguyên tắc sẵn có của dự
   * án: không giấu số, chỉ nói rõ độ tin cậy (giống nhãn *tạm tính*, badge độ phủ nguồn).
   */
  coverage?: { days: number; totalDays: number };
};

/** Số học kỳ (tuần / tháng) — cùng dạng khoá `keyOf` mà `bucketViewsBy` dùng: thứ Hai `YYYY-MM-DD`
 *  cho tuần, mùng 1 `YYYY-MM-01` cho tháng. `label`/`spanEnd` nhận khoá kỳ đó. */
type PeriodMath = {
  startOf: (dateStr: string) => string;
  prev: (key: string) => string;
  label: (key: string) => string;
  spanEnd: (key: string) => string;
};

const WEEK_MATH: PeriodMath = {
  startOf: isoWeekStart,
  prev: (key) => addDaysToDateString(key, -7),
  label: weekStartLabel,
  spanEnd: (key) => addDaysToDateString(key, 6),
};

const MONTH_MATH: PeriodMath = {
  startOf: (dateStr) => `${monthKey(dateStr)}-01`,
  prev: (key) => `${monthKey(addDaysToDateString(key, -1))}-01`,
  label: monthLabel,
  spanEnd: (key) => {
    const [y, m] = key.split("-").map(Number);
    return `${key.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  },
};

/** Mốc "ngày": kỳ = đúng 1 ngày, nên `startOf`/`spanEnd` là hàm đồng nhất. Hệ quả cố ý:
 *  `now >= spanEnd(startOf(now))` LUÔN đúng → `withUnfinishedMarks` không bao giờ đóng dấu `coverage`
 *  lên chuỗi ngày → hôm nay chưa sync vẽ thành lỗ trống trung thực, không phải nét đứt cắm xuống 0. */
const DAY_MATH: PeriodMath = {
  startOf: (dateStr) => dateStr,
  prev: (key) => addDaysToDateString(key, -1),
  label: dayLabel,
  spanEnd: (key) => key,
};

/**
 * Cửa sổ của biểu đồ NGÀY (14 ngày gần nhất). Truyền một lần cho cả 3 hàm `bucketDaily*`; mỗi hàm
 * đọc đúng phần nó cần (docstring từng hàm nói rõ). Chuỗi ngày phải **dày kín cửa sổ** — một ngày
 * thủng vẫn phải chiếm một cột (dạng lỗ trống), không được biến mất khỏi trục X.
 */
export type DayWindow = {
  /** `addDaysToDateString(to, -13)`. */
  from: string;
  /** `to` của bộ lọc trang (mặc định hôm nay). */
  to: string;
  /** `latestDateOf(rows)` — chỉ `bucketDailyVideoCounts` đọc, để không khẳng định "hôm nay chưa đăng
   *  video nào" khi cron chưa chạy (video hôm nay ghi lúc ~23:30). */
  through: string | null;
};

/** Chuỗi views theo NGÀY, dày kín `[w.from, w.to]`. Ngày không có row nào biết `videoViews` → `null`
 *  (lỗ trống, không phải 0). Cộng mọi kênh trong ngày — views là dòng chảy, thiếu 1 kênh 1 ngày là
 *  sai số nhỏ, KHÔNG gán cổng độ phủ như followers (xem `bucketDailyLastFollowers`). */
export function bucketDailyViews(rows: DailyRow[], w: DayWindow): TrendPoint[] {
  const sumByDate = new Map<string, number>();
  const seenByDate = new Set<string>();
  for (const row of rows) {
    if (row.date < w.from || row.date > w.to || row.videoViews === null) continue;
    sumByDate.set(row.date, (sumByDate.get(row.date) ?? 0) + row.videoViews);
    seenByDate.add(row.date);
  }
  return dateRangeInclusive(w.from, w.to).map((date) => ({
    label: dayLabel(date),
    value: seenByDate.has(date) ? (sumByDate.get(date) ?? 0) : null,
  }));
}

/**
 * Chuỗi followers theo NGÀY, dày kín cửa sổ. Followers là **tồn kho**: điểm mỗi ngày = tổng, qua các
 * kênh, **giá trị mới nhất mỗi kênh biết được TÍNH ĐẾN ngày đó** (kéo ngang trong cửa sổ — cùng cách
 * `bucketLastFollowersBy` xử lý mốc tuần: 12.300 follower hôm 5, không sync hôm 6 thì hôm 6 vẫn là
 * 12.300, follower không bốc hơi). Đây KHÔNG phải cái "bịa toạ độ Y" mà quyết định 07/09 cấm — cái
 * đó nói về chặng nối nét đứt tới kỳ dở dang, không phải lỗ giữa chuỗi tồn kho. Kéo ngang cũng chính
 * là thứ chặn "vách đá giả": một kênh hụt một ngày thì giữ nguyên mức, không tụt về 0.
 *
 * Kênh chưa có mốc follower nào tính đến ngày đó thì **không đóng góp** (không phải 0) — giống mốc
 * tuần. Ngày mà KHÔNG kênh nào có số → `null` (lỗ trống). Không có cổng "đủ N kênh": chuỗi tuần cũng
 * không có, và ở mốc ngày cổng đó làm biểu đồ team trắng trơn suốt vì cron follower chưa phủ đều mọi
 * kênh mọi ngày.
 */
export function bucketDailyLastFollowers(rows: DailyRow[], w: DayWindow): TrendPoint[] {
  const dates = dateRangeInclusive(w.from, w.to);
  const sumByDate = new Map<string, number>(dates.map((d) => [d, 0]));
  const contributorsByDate = new Map<string, number>(dates.map((d) => [d, 0]));

  for (const channelRows of groupByChannel(rows).values()) {
    const known = channelRows
      .filter((r) => r.followers !== null && r.date <= w.to)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (known.length === 0) continue;
    let i = 0;
    let carried: number | null = null;
    for (const date of dates) {
      while (i < known.length && known[i].date <= date) carried = known[i++].followers;
      if (carried === null) continue; // ngày này còn trước mốc follower đầu tiên của kênh
      sumByDate.set(date, sumByDate.get(date)! + carried);
      contributorsByDate.set(date, contributorsByDate.get(date)! + 1);
    }
  }

  return dates.map((date) => ({
    label: dayLabel(date),
    value: contributorsByDate.get(date)! > 0 ? sumByDate.get(date)! : null,
  }));
}

/** Chuỗi số video đăng theo NGÀY, dày kín cửa sổ. Ngày yên ắng → `0` (số 0 thật, có biết). **Trừ**
 *  ngày `> w.through` và mọi ngày khi `w.through === null` → `null`: `postedDates` đến từ
 *  `content_video` (bảng khác `data_snapshot`), cron ghi video hôm nay lúc ~23:30, nên `0` trần sẽ
 *  khẳng định sai "hôm nay chưa đăng video nào". */
export function bucketDailyVideoCounts(postedDates: string[], w: DayWindow): TrendPoint[] {
  const countByDate = new Map<string, number>();
  for (const date of postedDates) {
    if (date < w.from || date > w.to) continue;
    countByDate.set(date, (countByDate.get(date) ?? 0) + 1);
  }
  return dateRangeInclusive(w.from, w.to).map((date) => ({
    label: dayLabel(date),
    value: w.through !== null && date <= w.through ? (countByDate.get(date) ?? 0) : null,
  }));
}

/**
 * Hoàn thiện chuỗi tuần/tháng của biểu đồ xu hướng trước khi vẽ — 3 bước:
 *
 *  1. **Kéo dài tới kỳ hiện tại.** `bucketViewsBy` chỉ emit bucket cho kỳ CÓ dữ liệu, nên khi hôm nay
 *     chưa sync xong (cron chạy 23:30) thì cột cuối là tuần/tháng TRƯỚC — đọc như thể kỳ này chưa bắt
 *     đầu. Chèn thêm điểm `value: null` cho từng kỳ trống từ sau bucket cuối tới kỳ chứa `now`, để
 *     biểu đồ luôn có cột "kỳ này" (07/09/2026, theo yêu cầu). Kỳ trống chỉ hiện nhãn trục X + tooltip
 *     "chưa có số đo", không chấm, không tô nền. Cắt đệm ở `count − 1` để dữ liệu quá cũ (> count kỳ)
 *     vẫn còn ≥ 1 cột thật, không biến biểu đồ thành trống trơn.
 *  2. **Cắt còn `weekCount`/`monthCount` kỳ gần nhất** (mặc định 8 tuần / 6 tháng).
 *  3. **Đánh dấu `coverage`** cho điểm cuối (giờ luôn là kỳ chứa `now`) nếu kỳ đó chưa kết thúc tính
 *     tới `now`. `days` = số ngày trong kỳ ĐÃ có thể có dữ liệu (từ đầu kỳ tới `through` = ngày dữ
 *     liệu mới nhất); `0` nếu kỳ này chưa chạm ngày nào có dữ liệu. `totalDays` = độ dài trọn của kỳ.
 *     UI vẽ nét đứt + ghi "mới có N/M ngày" — không giấu số, chỉ nói rõ độ tin cậy.
 *
 * `now` = mốc phải của biểu đồ — `to` của bộ lọc trang (mặc định hôm nay, luôn ≤ hôm nay).
 * `through` = `latestDateOf(rows)`, `null` khi chưa có dữ liệu gì. Chuỗi rỗng → trả nguyên (chưa có
 * kênh/dữ liệu nào — không bịa cột).
 *
 * Nhận cả 3 mốc `day`/`week`/`month`. Chuỗi `day` (14 ngày) đã được `bucketDaily*` dựng dày kín tới
 * `now`, nên bước 1 không đệm gì; và `DAY_MATH.spanEnd` là hàm đồng nhất nên bước 3 không bao giờ
 * đóng dấu `coverage` — mốc ngày không có khái niệm "kỳ dở dang".
 */
export function withUnfinishedMarks(
  raw: { day: TrendPoint[]; week: TrendPoint[]; month: TrendPoint[] },
  opts: { now: string; through: string | null; dayCount?: number; weekCount?: number; monthCount?: number },
): { day: TrendPoint[]; week: TrendPoint[]; month: TrendPoint[] } {
  const { now, through, dayCount = 14, weekCount = 8, monthCount = 6 } = opts;

  const finish = (series: TrendPoint[], count: number, math: PeriodMath): TrendPoint[] => {
    if (series.length === 0) return series;

    // 1. Pad the tail up to (and including) the period containing `now`.
    const currentKey = math.startOf(now);
    const lastLabel = series[series.length - 1].label;
    const tail: TrendPoint[] = [];
    for (let key = currentKey; math.label(key) !== lastLabel && tail.length < count - 1; key = math.prev(key)) {
      tail.unshift({ label: math.label(key), value: null });
    }

    // 2. Keep the last `count` periods.
    const sliced = [...series, ...tail].slice(-count);

    // 3. The last point is now the period containing `now` — mark it if not fully elapsed.
    const spanEnd = math.spanEnd(currentKey);
    if (now >= spanEnd) return sliced; // kỳ đã trọn vẹn
    const coverage = {
      days: through && through >= currentKey ? daysBetweenDateStrings(currentKey, through) + 1 : 0,
      totalDays: daysBetweenDateStrings(currentKey, spanEnd) + 1,
    };
    return sliced.map((p, i) => (i === sliced.length - 1 ? { ...p, coverage } : p));
  };

  return {
    // Với chuỗi ngày `finish` gần như là no-op (nhãn cuối đã bằng `label(now)`, và `DAY_MATH` khiến
    // `now >= spanEnd` luôn đúng nên không stamp `coverage`). Vẫn cho chạy để cả 3 mốc đi chung một
    // đường ống — và nó có việc thật với chuỗi videos, vốn dừng dày ở `through` chứ không tới `now`.
    day: finish(raw.day, dayCount, DAY_MATH),
    week: finish(raw.week, weekCount, WEEK_MATH),
    month: finish(raw.month, monthCount, MONTH_MATH),
  };
}

/** Ngày mới nhất có dữ liệu trong tập rows — mốc `through` của `withUnfinishedMarks`. */
export function latestDateOf(rows: DailyRow[]): string | null {
  let latest: string | null = null;
  for (const row of rows) {
    if (latest === null || row.date > latest) latest = row.date;
  }
  return latest;
}

/** `YYYY-MM` of a VN calendar-date string — the month bucket key. Pure string slicing, same "no
 *  timezone conversion" rule as `isoWeekStart` (the input is already a VN date string). */
function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** "Th7", "Th8" — month label for the trend chart's tuần/tháng toggle (docs/TASKS.md Đợt 2 #2). */
function monthLabel(dateStr: string): string {
  return `Th${Number(dateStr.slice(5, 7))}`;
}

/** Shared core of `bucketWeeklyViews`/`bucketMonthlyViews` — the only difference between "theo
 *  tuần" and "theo tháng" is which (key, label) function buckets a date into, so this is
 *  parameterized rather than duplicated. */
function bucketViewsBy(rows: DailyRow[], keyOf: (date: string) => string, labelOf: (date: string) => string): TrendPoint[] {
  const byBucket = new Map<string, { label: string; value: number; hasData: boolean }>();
  for (const row of rows) {
    const key = keyOf(row.date);
    const entry = byBucket.get(key) ?? { label: labelOf(row.date), value: 0, hasData: false };
    if (row.videoViews !== null) {
      entry.value += row.videoViews;
      entry.hasData = true;
    }
    byBucket.set(key, entry);
  }
  return [...byBucket.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, e]) => ({ label: e.label, value: e.hasData ? e.value : null }));
}

/** Buckets rows (any number of channels, already date-filtered by the caller) into ISO-week sums
 *  of `videoViews` — the "Xu hướng toàn team" / "Diễn biến của kênh" chart series. */
export function bucketWeeklyViews(rows: DailyRow[]): TrendPoint[] {
  return bucketViewsBy(rows, isoWeekStart, weekStartLabel);
}

/** Same as `bucketWeeklyViews`, bucketed by calendar month instead — so sánh tháng 7 với tháng 8. */
export function bucketMonthlyViews(rows: DailyRow[]): TrendPoint[] {
  return bucketViewsBy(rows, monthKey, monthLabel);
}

/** Shared core of `bucketWeeklyLastFollowers`/`bucketMonthlyLastFollowers`. Followers is a stock,
 *  not a flow — each bucket's point is the SUM, across channels, of each channel's own last known
 *  value in that bucket. Must resolve "last known" per channel before summing: taking the last row
 *  in date order across the whole (possibly multi-channel) input would just pick whichever channel's
 *  row happens to sort last, not the team total. Buckets where a channel has no synced row
 *  contribute nothing for that channel, not a zero. */
function bucketLastFollowersBy(rows: DailyRow[], keyOf: (date: string) => string, labelOf: (date: string) => string): TrendPoint[] {
  const sumByBucket = new Map<string, number>();

  for (const channelRows of groupByChannel(rows).values()) {
    const lastByBucket = new Map<string, { asOfDate: string; followers: number }>();
    for (const row of channelRows) {
      if (row.followers === null) continue;
      const key = keyOf(row.date);
      const existing = lastByBucket.get(key);
      if (!existing || row.date >= existing.asOfDate) {
        lastByBucket.set(key, { asOfDate: row.date, followers: row.followers });
      }
    }
    for (const [bucket, { followers }] of lastByBucket) {
      sumByBucket.set(bucket, (sumByBucket.get(bucket) ?? 0) + followers);
    }
  }

  return [...sumByBucket.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([bucket, value]) => ({ label: labelOf(bucket), value }));
}

export function bucketWeeklyLastFollowers(rows: DailyRow[]): TrendPoint[] {
  return bucketLastFollowersBy(rows, isoWeekStart, weekStartLabel);
}

/** `labelOf` receives the bucket KEY here (already `YYYY-MM` for months, or a week's Monday date for
 *  weeks) — `monthLabel`/`weekStartLabel` both accept any date string within the bucket, so passing the
 *  key itself (not an original row date) still resolves to the right label either way. */
export function bucketMonthlyLastFollowers(rows: DailyRow[]): TrendPoint[] {
  return bucketLastFollowersBy(rows, monthKey, monthLabel);
}

/** Shared core of `bucketWeeklyVideoCounts`/`bucketMonthlyVideoCounts`. A post either happened in a
 *  bucket or didn't — always a fully-known count, never "no measurement" — so this accumulator
 *  (unlike the views one) stays plain `number`, not tracking a `hasData` flag. */
function bucketVideoCountsBy(postedDates: string[], keyOf: (date: string) => string, labelOf: (date: string) => string): TrendPoint[] {
  const byBucket = new Map<string, { label: string; value: number }>();
  for (const date of postedDates) {
    const key = keyOf(date);
    const entry = byBucket.get(key) ?? { label: labelOf(date), value: 0 };
    entry.value += 1;
    byBucket.set(key, entry);
  }
  return [...byBucket.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, point]) => point);
}

/** One point per posted video, already resolved to a VN calendar-date string
 *  (`nowVnDateString(new Date(video.posted_at))` at the call site) — counts videos per ISO week. */
export function bucketWeeklyVideoCounts(postedDates: string[]): TrendPoint[] {
  return bucketVideoCountsBy(postedDates, isoWeekStart, weekStartLabel);
}

export function bucketMonthlyVideoCounts(postedDates: string[]): TrendPoint[] {
  return bucketVideoCountsBy(postedDates, monthKey, monthLabel);
}

export type CreatorRank = "leader" | "growth" | "attention" | "stable";

/** Data-driven Creator-card badge — CLAUDE.md: "đừng lấy % KPI làm trục sắp xếp mặc định", so this
 *  ranks by view share and trend instead of a KPI cycle nothing has created yet.
 *  "leader": the single highest total-views creator, only when there's at least one OTHER creator
 *  with channels to actually be ahead of — "dẫn đầu" among a field of one is a badge with nothing
 *  behind it (bug caught 21/08/2026 dùng thử: a lone active Creator always got "Dẫn đầu view").
 *  "growth" / "attention": ±10-point average view-trend threshold, same as the health-color rule in
 *  docs/DESIGN_SYSTEM.md (`pct >= 70 cyan / >= 45 amber / < 45 red`) adapted to a delta instead of a
 *  percent-of-target. "stable" (no badge) otherwise, including creators with zero channels. */
export function rankCreatorPerformance(
  creators: { creatorId: string; totalViews: number | null; avgViewsDeltaPct: number | null; channelCount: number }[],
): Map<string, CreatorRank> {
  const ranked = new Map<string, CreatorRank>();
  const withChannels = creators.filter((c) => c.channelCount > 0);
  if (withChannels.length === 0) return ranked;

  // An unmeasured creator (`totalViews: null`) can never take the lead — `-1` keeps them below even
  // a genuine measured 0, and the `> 0` guard below still rules out an all-zero field having a
  // "leader" at all (lib/dashboard.ts `sumViewsOrNull`).
  const viewsOrUnmeasured = (c: { totalViews: number | null }) => c.totalViews ?? -1;
  const leader =
    withChannels.length >= 2
      ? withChannels.reduce((best, c) => (viewsOrUnmeasured(c) > viewsOrUnmeasured(best) ? c : best))
      : null;

  for (const c of withChannels) {
    if (leader && c.creatorId === leader.creatorId && viewsOrUnmeasured(leader) > 0) {
      ranked.set(c.creatorId, "leader");
    } else if (c.avgViewsDeltaPct !== null && c.avgViewsDeltaPct >= 10) {
      ranked.set(c.creatorId, "growth");
    } else if (c.avgViewsDeltaPct !== null && c.avgViewsDeltaPct <= -10) {
      ranked.set(c.creatorId, "attention");
    } else {
      ranked.set(c.creatorId, "stable");
    }
  }
  return ranked;
}

export type HashtagStat = { hashtag: string; videos: number; totalViews: number; avgViews: number };

/** Groups videos by hashtag and averages their latest known view count. A video with no view data
 *  yet (never synced) is excluded rather than silently counted as a 0-view video, which would drag
 *  every hashtag's average down for a reason that has nothing to do with content performance. */
export function aggregateHashtagStats(videos: { hashtags: string[]; views: number | null }[]): HashtagStat[] {
  const byTag = new Map<string, { videos: number; totalViews: number }>();
  for (const video of videos) {
    if (video.views === null) continue;
    for (const tag of video.hashtags) {
      const entry = byTag.get(tag) ?? { videos: 0, totalViews: 0 };
      entry.videos += 1;
      entry.totalViews += video.views;
      byTag.set(tag, entry);
    }
  }
  return [...byTag.entries()]
    .map(([hashtag, { videos: count, totalViews }]) => ({
      hashtag,
      videos: count,
      totalViews,
      avgViews: Math.round(totalViews / count),
    }))
    .sort((a, b) => b.avgViews - a.avgViews);
}

export type ActivityHeatmap = {
  dates: string[]; // ascending, oldest..newest
  hours: number[]; // 0..23
  grid: (number | null)[][]; // grid[hourIndex][dateIndex]
  max: number;
};

/** Pivots flat (date, hour, activeFollowers) rows from `follower_activity` into an hour × date grid
 *  for the "giờ vàng đăng bài" heatmap. `max` drives cell-color intensity in the UI. */
export function buildActivityHeatmap(
  cells: { date: string; hour: number; activeFollowers: number | null }[],
): ActivityHeatmap {
  const dates = [...new Set(cells.map((c) => c.date))].sort();
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const dateIndex = new Map(dates.map((d, i) => [d, i]));

  const grid: (number | null)[][] = hours.map(() => dates.map(() => null));
  let max = 0;
  for (const cell of cells) {
    const di = dateIndex.get(cell.date);
    if (di === undefined) continue;
    grid[cell.hour][di] = cell.activeFollowers;
    if (cell.activeFollowers !== null && cell.activeFollowers > max) max = cell.activeFollowers;
  }
  return { dates, hours, grid, max };
}

// ---------------------------------------------------------------------------
// Supabase-touching layer — thin wrappers that fetch rows and hand them to the pure helpers above.
// ---------------------------------------------------------------------------

const DAILY_SELECT =
  "channel_id, date, video_views, video_count, followers, likes, comments, shares, total_viewers, new_viewers, returning_viewers, profile_views, source, is_complete";

function toDailyRow(row: {
  channel_id: string;
  date: string;
  video_views: number | string | null;
  video_count: number | string | null;
  followers: number | string | null;
  likes: number | string | null;
  comments: number | string | null;
  shares: number | string | null;
  total_viewers: number | string | null;
  new_viewers: number | string | null;
  returning_viewers: number | string | null;
  profile_views: number | string | null;
  source: string;
  is_complete: boolean;
}): DailyRow {
  const num = (v: number | string | null) => (v === null ? null : Number(v));
  return {
    channelId: row.channel_id,
    date: row.date,
    videoViews: num(row.video_views),
    videoCount: num(row.video_count),
    followers: num(row.followers),
    likes: num(row.likes),
    comments: num(row.comments),
    shares: num(row.shares),
    totalViewers: num(row.total_viewers),
    newViewers: num(row.new_viewers),
    returningViewers: num(row.returning_viewers),
    profileViews: num(row.profile_views),
    source: row.source,
    isComplete: row.is_complete,
  };
}

/** Every screen's numbers come from this one query shape — `v_channel_daily`, never `data_snapshot`
 *  directly (docs/DATABASE_ERD.md "Chọn nguồn"). */
export async function fetchDailyRows(
  supabase: SupabaseServerClient,
  channelIds: string[],
  from: string,
  to: string,
): Promise<DailyRow[]> {
  if (channelIds.length === 0) return [];
  const { data, error } = await supabase
    .from("v_channel_daily")
    .select(DAILY_SELECT)
    .in("channel_id", channelIds)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toDailyRow);
}

/** One query, shared by `countVideosPosted` (per-channel count) and `fetchPostedVnDates` (flat VN
 *  date list) below, and reused directly by M5's `lib/kpi.ts` (`attachProgress`) — 3 separate copies
 *  of the same `content_video` query would otherwise exist. Bounds are VN calendar days converted to
 *  the timestamptz range Postgres compares against, matching lib/time.ts's `vnMidnightIso`. */
export async function fetchPostedVnDatesByChannel(
  supabase: SupabaseServerClient,
  channelIds: string[],
  from: string,
  to: string,
): Promise<Map<string, string[]>> {
  const byChannel = new Map<string, string[]>();
  if (channelIds.length === 0) return byChannel;

  const { data, error } = await supabase
    .from("content_video")
    .select("channel_id, posted_at")
    .in("channel_id", channelIds)
    .not("posted_at", "is", null)
    .gte("posted_at", vnMidnightIso(from))
    .lt("posted_at", vnMidnightIso(addDaysToDateString(to, 1)));
  if (error) throw error;

  for (const row of data ?? []) {
    const date = nowVnDateString(new Date(row.posted_at as string));
    const list = byChannel.get(row.channel_id);
    if (list) list.push(date);
    else byChannel.set(row.channel_id, [date]);
  }
  return byChannel;
}

/** `videosTrongKỳ` per CLAUDE.md: COUNT(content_video.posted_at in period), never a `video_count`
 *  difference (a deleted video would skew that). */
export async function countVideosPosted(
  supabase: SupabaseServerClient,
  channelIds: string[],
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const byChannel = await fetchPostedVnDatesByChannel(supabase, channelIds, from, to);
  const counts = new Map<string, number>();
  for (const [channelId, dates] of byChannel) counts.set(channelId, dates.length);
  return counts;
}

/** Same rows as `countVideosPosted`, flattened across channels instead of counted per-channel —
 *  feeds `bucketWeeklyVideoCounts` for the trend chart's "Video" series. */
export async function fetchPostedVnDates(
  supabase: SupabaseServerClient,
  channelIds: string[],
  from: string,
  to: string,
): Promise<string[]> {
  const byChannel = await fetchPostedVnDatesByChannel(supabase, channelIds, from, to);
  return [...byChannel.values()].flat();
}

export type DataFreshness = {
  latestDate: string | null;
  source: string | null;
  label: "tạm tính" | "đã đối chiếu" | null;
  /** The date EVERY channel in the set is reconciled through — the earliest of the per-channel
   *  "latest studio_import" dates, not the latest across all of them. Answers the question the
   *  finalize gate actually asks ("how far back is the whole set safe to close?"); a single
   *  well-imported channel must not speak for the rest. `null` when at least one channel has never
   *  been reconciled at all (`channelsNeverReconciled > 0`) — there is no such date yet. */
  reconciledThrough: string | null;
  /** Channels in the set with no `studio_import` row at any date. They cannot be finalized until
   *  someone imports a Studio export for them, so the count is surfaced rather than hidden behind
   *  a reassuring "đã đối chiếu tới …" (28/08/2026: 3 of 9 channels were in this state while the
   *  header claimed the whole system was reconciled through 21/08). */
  channelsNeverReconciled: number;
};

/** The single most recent (date, source) among the given channels, plus how far the WHOLE set is
 *  reconciled by Studio — "17-19/08 tạm tính · đã đối chiếu tới 16/08" in the mockups. */
export async function fetchDataFreshness(
  supabase: SupabaseServerClient,
  channelIds: string[],
): Promise<DataFreshness> {
  const empty: DataFreshness = {
    latestDate: null,
    source: null,
    label: null,
    reconciledThrough: null,
    channelsNeverReconciled: 0,
  };
  if (channelIds.length === 0) return empty;

  // One `limit(1)` query per channel instead of a single `.in()` fetch grouped in JS: the grouped
  // version would have to read every studio_import row (9 channels × 365 days blows past the 1000-row
  // cap PostgREST applies SILENTLY — the exact trap scripts/diagnose-data.mjs's fetchAll() exists to
  // avoid) and would still have to reduce it client-side. These all go out in one Promise.all batch,
  // so it costs one round-trip, not N. Deliberately not a Postgres view: same call made for
  // `sumLatestVideoLikes()` (docs/PROGRESS.md) — at ~9 channels a migration isn't worth it. If the
  // channel count reaches the dozens, this is the first place to swap in a grouped view.
  const [latestResult, ...reconciledResults] = await Promise.all([
    supabase
      .from("v_channel_daily")
      .select("date, source")
      .in("channel_id", channelIds)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    ...channelIds.map((channelId) =>
      supabase
        .from("data_snapshot")
        .select("date")
        .eq("channel_id", channelId)
        .eq("source", "studio_import")
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
  ]);
  if (latestResult.error) throw latestResult.error;
  for (const result of reconciledResults) {
    if (result.error) throw result.error;
  }

  const latest = latestResult.data;
  if (!latest) return empty;

  const perChannelLatest = reconciledResults.map((r) => r.data?.date ?? null);
  const channelsNeverReconciled = perChannelLatest.filter((date) => date === null).length;
  // ISO dates sort lexicographically, so a plain string compare is the min.
  const reconciledThrough =
    channelsNeverReconciled > 0
      ? null
      : perChannelLatest.reduce<string | null>((min, date) => (min === null || date! < min ? date! : min), null);

  const isReconciled = latest.source === "studio_import";
  return {
    latestDate: latest.date,
    source: latest.source,
    label: isReconciled ? "đã đối chiếu" : "tạm tính",
    reconciledThrough,
    channelsNeverReconciled,
  };
}

export type ChannelVideo = {
  id: string;
  videoLink: string;
  title: string | null;
  hashtags: string[];
  postedAt: string | null;
  /** Latest known cumulative view count (from the most recent `video_snapshot` row), or `null` if
   *  this video has never been synced by either M3a's Content.csv import or M3b's Display API. */
  latestViews: number | null;
};

/** One channel's known videos + their latest view count — the shared source for both "Video gần
 *  đây" (Chi tiết kênh) and the hashtag-effectiveness table (`aggregateHashtagStats` on the result),
 *  so they can never disagree about what a video's current view count is. */
export async function fetchChannelVideos(
  supabase: SupabaseServerClient,
  channelId: string,
): Promise<ChannelVideo[]> {
  const { data: videos, error } = await supabase
    .from("content_video")
    .select("id, video_link, title, hashtags, posted_at")
    .eq("channel_id", channelId)
    .order("posted_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  if (!videos || videos.length === 0) return [];

  const videoIds = videos.map((v) => v.id as string);
  const { data: snapshots, error: snapshotError } = await supabase
    .from("video_snapshot")
    .select("content_video_id, date, view_count")
    .in("content_video_id", videoIds)
    .order("date", { ascending: false });
  if (snapshotError) throw snapshotError;

  const latestViewByVideo = new Map<string, number>();
  for (const row of snapshots ?? []) {
    const id = row.content_video_id as string;
    if (latestViewByVideo.has(id)) continue; // sorted desc — first hit per video is the latest
    latestViewByVideo.set(id, row.view_count !== null ? Number(row.view_count) : 0);
  }

  return videos.map((v) => ({
    id: v.id as string,
    videoLink: v.video_link as string,
    title: v.title as string | null,
    hashtags: (v.hashtags as string[]) ?? [],
    postedAt: v.posted_at as string | null,
    latestViews: latestViewByVideo.get(v.id as string) ?? null,
  }));
}

/**
 * PostgREST/undici cap total request headers around 16KB — a `.in("content_video_id", videoIds)`
 * built from hundreds of UUIDs (each ~37 chars once comma-joined) can exceed that on a channel set
 * with many videos, failing the whole request with a hard-to-diagnose `HeadersOverflowError`
 * (discovered 25/08/2026 loading `/channels` against real production data, once video counts grew
 * past the threshold — this query predates M5, not something introduced by it). Splits the id list
 * into chunks and runs the same query per chunk in parallel instead of one unbounded IN clause.
 */
function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

const VIDEO_SNAPSHOT_IN_BATCH_SIZE = 150;

export type LatestVideoMetrics = { views: number; likes: number };

/** Every channel's total of its videos' most recently known view/like count — a current snapshot
 *  total like `followersNow`, not a period sum (per-video `view_count`/`like_count` are both
 *  cumulative-lifetime — docs/DATABASE_ERD.md). Same latest-per-video dedup as `fetchChannelVideos`,
 *  just grouped by channel and done for every channel in one pass instead of listed for one.
 *
 *  Two unrelated-looking callers share this because they're the same query shape:
 *  - `likes`: "Tổng số like" at every granularity in the app — one channel, one Creator's channels,
 *    one Team's channels, or the whole company (22/08/2026: replaced engagement rate everywhere,
 *    theo yêu cầu).
 *  - `views`: fallback for `getChannelPeriodStats`'s `views` field specifically when the period is
 *    "Toàn bộ thời gian" (`ALL_TIME_FROM`) — at that one period, "view trong kỳ" and "tổng view luỹ
 *    kế" are the same number by definition, and this is more robust than summing
 *    `data_snapshot.video_views` deltas day-by-day: it doesn't depend on every day since
 *    `ALL_TIME_FROM` having an unbroken `data_snapshot` row (which isn't true right now — a channel's
 *    older rows were deleted alongside other cleanup, 22/08/2026). CLAUDE.md's "view trong kỳ phải
 *    suy ra bằng chênh lệch theo từng video" rule is about SHORTER periods (7/14/30 ngày, tuỳ chỉnh)
 *    — summing raw cumulative `view_count` there would massively overcount (docs/DISPLAY_API.md bẫy
 *    #10's ~10x real example), so this fallback is deliberately gated to the one period where it's
 *    exact, not a general replacement for the delta computation.
 *
 *  Channels with no videos yet still get a `{views: 0, likes: 0}` entry, never a missing key —
 *  callers can `.get(id)` without a special case. */
export async function fetchLatestVideoMetricsByChannel(
  supabase: SupabaseServerClient,
  channelIds: string[],
): Promise<Map<string, LatestVideoMetrics>> {
  const totals = new Map<string, LatestVideoMetrics>(channelIds.map((id) => [id, { views: 0, likes: 0 }]));
  if (channelIds.length === 0) return totals;

  const { data: videos, error: videosError } = await supabase
    .from("content_video")
    .select("id, channel_id")
    .in("channel_id", channelIds);
  if (videosError) throw videosError;
  if (!videos || videos.length === 0) return totals;

  const channelByVideo = new Map(videos.map((v) => [v.id as string, v.channel_id as string]));
  const videoIds = [...channelByVideo.keys()];

  const snapshotBatches = await Promise.all(
    chunkArray(videoIds, VIDEO_SNAPSHOT_IN_BATCH_SIZE).map(async (batch) => {
      const { data, error } = await supabase
        .from("video_snapshot")
        .select("content_video_id, date, view_count, like_count")
        .in("content_video_id", batch)
        .order("date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    }),
  );
  const snapshots = snapshotBatches.flat();

  const seen = new Set<string>();
  for (const row of snapshots ?? []) {
    const videoId = row.content_video_id as string;
    if (seen.has(videoId)) continue; // sorted desc — first hit per video is the latest
    seen.add(videoId);
    const channelId = channelByVideo.get(videoId);
    if (!channelId) continue;
    const entry = totals.get(channelId) ?? { views: 0, likes: 0 };
    entry.views += row.view_count !== null ? Number(row.view_count) : 0;
    entry.likes += row.like_count !== null ? Number(row.like_count) : 0;
    totals.set(channelId, entry);
  }
  return totals;
}

export type RecentVideoView = { postedAt: string | null; views: number };

/** Each channel's `limit` most-recently-posted videos, oldest→newest, paired with that video's
 *  latest known cumulative `view_count` — feeds the "Xu hướng" sparkline on `/channels` (24/08/2026,
 *  theo yêu cầu: đổi từ "view theo ngày trong kỳ" — vốn phẳng lì khi kỳ đang chọn ít/không có ngày
 *  đăng video mới — sang view-của-từng-video, luôn có tín hiệu miễn kênh có video). Same
 *  latest-per-video dedup as `fetchLatestVideoMetricsByChannel`. A channel with fewer than `limit`
 *  known videos just gets fewer points; `Sparkline` already renders "—" under 2. */
export async function fetchRecentVideoViewsByChannel(
  supabase: SupabaseServerClient,
  channelIds: string[],
  limit = 5,
): Promise<Map<string, RecentVideoView[]>> {
  const result = new Map<string, RecentVideoView[]>(channelIds.map((id) => [id, []]));
  if (channelIds.length === 0) return result;

  const { data: videos, error: videosError } = await supabase
    .from("content_video")
    .select("id, channel_id, posted_at")
    .in("channel_id", channelIds)
    .order("posted_at", { ascending: false, nullsFirst: false });
  if (videosError) throw videosError;
  if (!videos || videos.length === 0) return result;

  // Query is newest→oldest per channel already — cap each channel's list at `limit` as we walk it.
  const recentByChannel = new Map<string, { id: string; postedAt: string | null }[]>();
  for (const v of videos) {
    const channelId = v.channel_id as string;
    const list = recentByChannel.get(channelId) ?? [];
    if (list.length < limit) list.push({ id: v.id as string, postedAt: v.posted_at as string | null });
    recentByChannel.set(channelId, list);
  }

  const videoIds = [...recentByChannel.values()].flat().map((v) => v.id);
  if (videoIds.length === 0) return result;

  const snapshotBatches = await Promise.all(
    chunkArray(videoIds, VIDEO_SNAPSHOT_IN_BATCH_SIZE).map(async (batch) => {
      const { data, error } = await supabase
        .from("video_snapshot")
        .select("content_video_id, date, view_count")
        .in("content_video_id", batch)
        .order("date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    }),
  );
  const snapshots = snapshotBatches.flat();

  const latestViewByVideo = new Map<string, number>();
  for (const row of snapshots ?? []) {
    const videoId = row.content_video_id as string;
    if (latestViewByVideo.has(videoId)) continue; // sorted desc — first hit per video is the latest
    latestViewByVideo.set(videoId, row.view_count !== null ? Number(row.view_count) : 0);
  }

  for (const [channelId, recent] of recentByChannel) {
    // Reverse to oldest→newest — the sparkline reads left-to-right as "older video" → "newer video".
    const points = [...recent].reverse().map((v) => ({
      postedAt: v.postedAt,
      views: latestViewByVideo.get(v.id) ?? 0,
    }));
    result.set(channelId, points);
  }
  return result;
}

/** Sum of `fetchLatestVideoMetricsByChannel`'s `likes` across a set of channels — the team-wide
 *  "Tổng số like" tile on Tổng quan doesn't need the per-channel breakdown, just the total. */
export async function sumLatestVideoLikes(supabase: SupabaseServerClient, channelIds: string[]): Promise<number> {
  const byChannel = await fetchLatestVideoMetricsByChannel(supabase, channelIds);
  return [...byChannel.values()].reduce((a, m) => a + m.likes, 0);
}

export async function fetchActivityHeatmap(
  supabase: SupabaseServerClient,
  channelId: string,
): Promise<ActivityHeatmap> {
  const { data, error } = await supabase
    .from("follower_activity")
    .select("date, hour, active_followers")
    .eq("channel_id", channelId);
  if (error) throw error;

  return buildActivityHeatmap(
    (data ?? []).map((r) => ({ date: r.date, hour: r.hour, activeFollowers: r.active_followers })),
  );
}

export type AudienceShare = { key: string; ratio: number };
export type AudienceSnapshot = { capturedOn: string; gender: AudienceShare[]; territories: AudienceShare[] };

/**
 * `audience_snapshot.gender_distribution` / `territory_distribution` là `jsonb` dạng
 * `Record<string, number>`, tỷ lệ thập phân ("0.55" = 55%). Hàm thuần, export để test.
 *
 * - Bỏ giá trị không hữu hạn và bỏ đúng `0` (cả 2 file mẫu đều có dòng `"Other","0"` — nhiễu).
 * - Ép chuỗi số ("0.55") về number — parser CSV đã ghi number nhưng jsonb round-trip có thể ra chuỗi.
 * - Sắp giảm dần theo `ratio`, hoà thì theo `key` tăng dần (đầu ra ổn định cho snapshot test).
 */
export function normalizeDistribution(raw: unknown): AudienceShare[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return [];
  const out: AudienceShare[] = [];
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const ratio = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(ratio) || ratio === 0) continue;
    out.push({ key, ratio });
  }
  return out.sort((a, b) => b.ratio - a.ratio || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * Bản chụp nhân khẩu học khán giả MỚI NHẤT của một kênh — chỉ `studio_import` ghi bảng này, và nó là
 * ảnh chụp tại thời điểm export, không có lịch sử (docs/CSV_FORMAT.md). Trả `null` khi không có row
 * nào hoặc cả 2 phân bố đều rỗng sau khi normalize → trang chỉ phải kiểm một điều kiện.
 *
 * `createSupabaseServerClient()` là đúng — RLS `audience_snapshot_select_authenticated` cho mọi role
 * đã đăng nhập select; không cần admin client, không cần `requireManager()`.
 */
export async function fetchAudienceSnapshot(
  supabase: SupabaseServerClient,
  channelId: string,
): Promise<AudienceSnapshot | null> {
  const { data, error } = await supabase
    .from("audience_snapshot")
    .select("captured_on, gender_distribution, territory_distribution")
    .eq("channel_id", channelId)
    .order("captured_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const gender = normalizeDistribution(data.gender_distribution);
  const territories = normalizeDistribution(data.territory_distribution);
  if (gender.length === 0 && territories.length === 0) return null;

  return { capturedOn: data.captured_on, gender, territories };
}

// ---------------------------------------------------------------------------
// Per-channel period stats — the one query shared by Tổng quan (team rollup), Kênh (table rows +
// sparkline), Chi tiết kênh (single channel), and Creator (grouped by creator). Carries both the raw
// current/previous sums (so a caller can re-aggregate across channels for a team total) and the
// derived per-channel numbers (so a caller showing one row doesn't have to redo that math).
// ---------------------------------------------------------------------------

/**
 * How many of one channel's measured days in a period came from each source tier.
 *
 * Lý do tồn tại (05/09/2026, theo yêu cầu — phương án "badge độ phủ nguồn" thay cho việc tách 2 tab
 * Display API / Studio): một kỳ trộn 2 nguồn thì tổng của nó đang CỘNG HAI ĐƠN VỊ ĐO KHÁC NHAU.
 * Display API cộng delta của những video nó lấy được; Studio báo tổng view thật của cả kênh, gồm cả
 * video cũ vẫn đang được xem. Đo trên dữ liệu thật 29/08→03/09 (những ngày `is_complete=true`, cron
 * chạy đúng, không thiếu gì): Studio cao hơn Display **ổn định 1,2–1,6×**, và ở 2 ngày sync đầu còn
 * lệch tới 10–76×. Vì `v_channel_daily` chọn Studio cho ngày này, Display cho ngày kia, chuỗi thời
 * gian nhảy bậc ngay tại ranh giới nguồn — Manager phải nhìn thấy tỷ lệ đó trước khi tin con số.
 *
 * "Đã đối chiếu" đếm ĐÚNG `studio_import` — tầng duy nhất CLAUDE.md cho phép chốt sổ. Ngày không có
 * row nào không được đếm ở đây: đó là lỗ thủng dữ liệu, không phải một nguồn (xem `SourceCoverage`).
 */
export type SourceBreakdown = {
  /** Ngày lấy từ `studio_import` — số đã đối chiếu, dùng được để chốt sổ. */
  reconciledDays: number;
  /** Ngày lấy từ `display_api` — số tạm tính, còn đổi khi Studio import về. */
  estimatedDays: number;
  /** `manual_entry` và mọi nguồn khác `source_rank()` xếp ở giữa (chưa nguồn nào trong số đó được
   *  code ghi dữ liệu hôm nay — xem `SourcePriorityInfo`). Gộp một ô để badge không phải kể tên
   *  từng nguồn Manager chưa từng thấy. */
  otherDays: number;
};

/** Đếm nguồn của các ngày ĐÃ RESOLVE qua `v_channel_daily` (mỗi (kênh, ngày) đúng một row, đã chọn
 *  nguồn ưu tiên nhất) — nên tổng 3 ô luôn bằng `rows.length`, không đếm trùng. */
export function computeSourceBreakdown(rows: DailyRow[]): SourceBreakdown {
  let reconciledDays = 0;
  let estimatedDays = 0;
  let otherDays = 0;
  for (const row of rows) {
    if (row.source === "studio_import") reconciledDays++;
    else if (row.source === "display_api") estimatedDays++;
    else otherDays++;
  }
  return { reconciledDays, estimatedDays, otherDays };
}

export type ChannelPeriodStat = {
  channelId: string;
  /** `null` = not one synced day this period has a known, COMPLETE videoViews (a channel that just
   *  connected with only a bootstrap sync, or a period where every day is missing / `isComplete=false`
   *  — CLAUDE.md: an incomplete snapshot isn't used to compute numbers). Render as "—", never "0 view". */
  views: number | null;
  previousViews: number | null;
  viewsDeltaPct: number | null;
  /** `true` when this period AND the comparison period both have some view data, but the current
   *  period covers materially fewer complete measured days (`viewsDeltaComparable` failed) — so
   *  `viewsDeltaPct` is null on purpose and the UI should show a "chưa đủ dữ liệu trong kỳ" note
   *  rather than a bare "—" that reads as "no history at all" (27/08/2026). */
  viewsDeltaInsufficientData: boolean;
  /** Days with a complete, known videoViews in this period / the comparison period — carried so a
   *  rollup (`aggregateChannelStats`) can re-apply `viewsDeltaComparable` across its channel set
   *  without re-fetching daily rows. */
  viewsMeasuredDays: number;
  previousViewsMeasuredDays: number;
  videos: number;
  previousVideos: number;
  viewsPerVideo: number | null;
  /** Current total of this channel's videos' latest known like count — not period-scoped (same shape
   *  as `followersNow`), so no "previous"/delta counterpart. Replaced `engagementRate` here and at
   *  every rollup built from this type (22/08/2026, theo yêu cầu) — CLAUDE.md's "engagement rate
   *  luôn hiển thị ngang hàng view/follower" rule updated to match; the underlying `engagementRate()`
   *  pure function/`data_snapshot.likes` column are untouched, just no longer surfaced by this path. */
  totalLikes: number;
  followersNow: number | null;
  followersBefore: number | null;
  followersGain: number | null;
  followersRatePct: number | null;
  /** This channel's 5 most-recently-posted videos' view counts, oldest→newest — "Xu hướng" sparkline
   *  input on `/channels` (24/08/2026, theo yêu cầu — trước đây là view theo ngày trong kỳ, xem
   *  `fetchRecentVideoViewsByChannel`). Independent of the selected date range/period. */
  spark: RecentVideoView[];
  /** Nguồn của từng ngày trong kỳ HIỆN TẠI (không tính kỳ so sánh) — xem `SourceBreakdown`. Đếm mọi
   *  ngày có row, kể cả `isComplete=false`: badge trả lời "số này lấy từ đâu", câu hỏi độc lập với
   *  "ngày này có được tính vào tổng không" (`viewsMeasuredDays` mới trả lời câu đó). */
  sourceBreakdown: SourceBreakdown;
};

/** Độ phủ nguồn của cả tập kênh trong một kỳ — đầu vào của badge "x/y đã đối chiếu" trên Tổng quan. */
export type SourceCoverage = {
  /** Số ô (kênh, ngày) CÓ dữ liệu trong kỳ. Mẫu số của badge. Không phải `số kênh × số ngày`: ngày
   *  không sync được không tính vào đâu cả (lỗ thủng là chuyện khác, `dataFreshness` nói việc đó). */
  measuredCells: number;
  /** Trong `measuredCells`, bao nhiêu ô là `studio_import`. Tử số của badge. */
  reconciledCells: number;
  /** Kênh có ít nhất 1 ngày dữ liệu trong kỳ và MỌI ngày đó đều `studio_import` — kênh "sạch" theo
   *  nghĩa chốt sổ được. Cùng nguyên tắc `DataFreshness.reconciledThrough`: một kênh import tốt
   *  không được nói thay cho cả tập. */
  fullyReconciledChannels: number;
  /** Kênh không có ô `studio_import` nào trong kỳ — gồm cả kênh trống hẳn. Đây là con số Manager
   *  hành động được: chính là danh sách cần đi đòi file Studio. */
  unreconciledChannels: number;
  totalChannels: number;
  /** Chi tiết từng kênh cho popover, sắp xếp kênh thiếu đối chiếu lên trước (việc cần làm nằm trên). */
  perChannel: {
    channelId: string;
    channelName: string;
    reconciledDays: number;
    estimatedDays: number;
    otherDays: number;
  }[];
};

/** Gộp `ChannelPeriodStat.sourceBreakdown` của cả tập kênh thành một `SourceCoverage`. Kênh không có
 *  entry trong `statsByChannel` vẫn được tính là một kênh chưa đối chiếu — im lặng bỏ qua nó sẽ làm
 *  badge đẹp lên đúng ở tình huống dữ liệu tệ nhất (kênh chưa từng import lần nào). */
export function aggregateSourceCoverage(
  channels: { id: string; name: string }[],
  statsByChannel: Map<string, ChannelPeriodStat>,
): SourceCoverage {
  const perChannel = channels.map((channel) => {
    const breakdown = statsByChannel.get(channel.id)?.sourceBreakdown ?? {
      reconciledDays: 0,
      estimatedDays: 0,
      otherDays: 0,
    };
    return { channelId: channel.id, channelName: channel.name, ...breakdown };
  });

  const cells = (c: (typeof perChannel)[number]) => c.reconciledDays + c.estimatedDays + c.otherDays;

  return {
    measuredCells: perChannel.reduce((acc, c) => acc + cells(c), 0),
    reconciledCells: perChannel.reduce((acc, c) => acc + c.reconciledDays, 0),
    fullyReconciledChannels: perChannel.filter((c) => cells(c) > 0 && c.reconciledDays === cells(c)).length,
    unreconciledChannels: perChannel.filter((c) => c.reconciledDays === 0).length,
    totalChannels: channels.length,
    // Kênh thiếu đối chiếu nhất lên đầu; hoà thì theo tên để thứ tự ổn định giữa các lần render.
    perChannel: perChannel.sort(
      (a, b) => a.reconciledDays - b.reconciledDays || a.channelName.localeCompare(b.channelName, "vi"),
    ),
  };
}

export type RollupStat = {
  /** `null` = not one channel in the set had a measurable view-day this period — render "—", never
   *  "0 view" (see `sumViewsOrNull`). A `0` here is a real, measured zero. */
  totalViews: number | null;
  viewsDeltaPct: number | null;
  /** Same meaning as `ChannelPeriodStat.viewsDeltaInsufficientData`, at rollup level — the channel
   *  set's current-period view coverage is too thin next to the comparison period to trust a %. */
  viewsDeltaInsufficientData: boolean;
  /** Current follower stock summed across the channel set — pairs with `followerGain` the same way
   *  `TeamStatsRow`'s "Follower toàn team" tile shows both (value = stock, delta = gain), just at
   *  Creator/Team rollup level instead of the whole company. */
  followersNow: number;
  followerGain: number;
  /** Current total across the channel set's videos' latest known like count — see
   *  `ChannelPeriodStat.totalLikes`, same "current total, no delta" shape. */
  totalLikes: number;
  /** Added for the Nhân sự detail page's "Video đã đăng" tile — same `countVideosPosted` numbers
   *  already summed per-channel by `getChannelPeriodStats`, just carried through the rollup instead
   *  of being dropped like before. */
  videos: number;
  previousVideos: number;
};

/**
 * Sums a set of channels' `ChannelPeriodStat` rows into one rollup — same math whether the set is
 * "one Creator's channels" or "one Team's channels" (a Team is just every Creator in it, transitively
 * — CLAUDE.md, 21/08/2026), so this is the one place that math lives instead of two copies drifting
 * apart. A channel id with no entry in `statsByChannel` contributes nothing to the total (unmeasured
 * channel doesn't count against it — same rule `getDashboard`'s team-level sum uses).
 */
export function aggregateChannelStats(channelIds: string[], statsByChannel: Map<string, ChannelPeriodStat>): RollupStat {
  const channelStats = channelIds
    .map((id) => statsByChannel.get(id))
    .filter((s): s is ChannelPeriodStat => s !== undefined);
  const sum = (pick: (s: ChannelPeriodStat) => number | null) =>
    channelStats.reduce((acc, s) => acc + (pick(s) ?? 0), 0);

  // `sumViewsOrNull`, not `sum` — an all-unmeasured set is "—", not a measured 0 (see its doc).
  // `previousViews` stays a plain sum: it is never rendered, it only feeds the % below, which is
  // already suppressed by its own coverage gate.
  const totalViews = sumViewsOrNull(channelStats.map((s) => s.views));
  const previousViews = sum((s) => s.previousViews);
  // Same coverage gate as per-channel (`getChannelPeriodStats`), re-applied on the channel set's
  // summed measured-day counts — a rollup % is only as trustworthy as the days behind it.
  const currentMeasuredDays = sum((s) => s.viewsMeasuredDays);
  const previousMeasuredDays = sum((s) => s.previousViewsMeasuredDays);
  const comparable = viewsDeltaComparable(currentMeasuredDays, previousMeasuredDays);

  return {
    totalViews,
    viewsDeltaPct: comparable && totalViews !== null ? pctChange(totalViews, previousViews) : null,
    viewsDeltaInsufficientData: previousMeasuredDays > 0 && !comparable,
    followersNow: sum((s) => s.followersNow),
    followerGain: sum((s) => s.followersGain),
    totalLikes: sum((s) => s.totalLikes),
    videos: sum((s) => s.videos),
    previousVideos: sum((s) => s.previousVideos),
  };
}

/** One Creator/Team member's channel, as shown in the Nhân sự detail page's "Kênh phụ trách" table —
 *  the per-channel numbers a `CreatorSummary.channels` entry doesn't carry on its own (that type is
 *  just id/name/handle; the metrics live in `ChannelPeriodStat`, keyed separately). */
export type CreatorPerformanceChannel = {
  id: string;
  name: string;
  tiktokHandle: string;
  /** `null` (render "—", not "0") when the channel has no complete view measurement this period —
   *  same rule as the `/channels` table's `views` column. */
  views: number | null;
  viewsDeltaPct: number | null;
  /** See `ChannelPeriodStat.viewsDeltaInsufficientData` — drives the "chưa đủ dữ liệu" note. */
  viewsDeltaInsufficientData: boolean;
  followersNow: number | null;
  followersGain: number | null;
  videos: number;
  totalLikes: number;
};

export type CreatorPerformance = RollupStat & { channels: CreatorPerformanceChannel[] };

/**
 * Builds each creator's rollup + per-channel breakdown in one pass — the loop `/creators` and (until
 * now) `/creators/team/[id]` each wrote inline, byte-for-byte identical apart from which `creators`
 * array they looped over. Kept here instead of a page component so `/creators` and `/creators/[id]`
 * can't drift on the math (same reasoning as `aggregateChannelStats` itself).
 */
export function buildCreatorPerformance(
  creators: { id: string; channels: { id: string; name: string; tiktokHandle: string }[] }[],
  statsByChannel: Map<string, ChannelPeriodStat>,
): Map<string, CreatorPerformance> {
  const result = new Map<string, CreatorPerformance>();
  for (const creator of creators) {
    const channelIds = creator.channels.map((ch) => ch.id);
    const rollup = aggregateChannelStats(channelIds, statsByChannel);
    result.set(creator.id, {
      ...rollup,
      channels: creator.channels.map((channel) => {
        const stat = statsByChannel.get(channel.id);
        return {
          id: channel.id,
          name: channel.name,
          tiktokHandle: channel.tiktokHandle,
          views: stat?.views ?? null,
          viewsDeltaPct: stat?.viewsDeltaPct ?? null,
          viewsDeltaInsufficientData: stat?.viewsDeltaInsufficientData ?? false,
          followersNow: stat?.followersNow ?? null,
          followersGain: stat?.followersGain ?? null,
          videos: stat?.videos ?? 0,
          totalLikes: stat?.totalLikes ?? 0,
        };
      }),
    });
  }
  return result;
}

export async function getChannelPeriodStats(
  supabase: SupabaseServerClient,
  params: { channelIds: string[]; from: string; to: string; comparedFrom: string; comparedTo: string },
): Promise<Map<string, ChannelPeriodStat>> {
  const { channelIds, from, to, comparedFrom, comparedTo } = params;
  const result = new Map<string, ChannelPeriodStat>();
  if (channelIds.length === 0) return result;

  const [allRows, videosCurrent, videosPrevious, metricsByChannel, recentVideoViews] = await Promise.all([
    fetchDailyRows(supabase, channelIds, comparedFrom, to),
    countVideosPosted(supabase, channelIds, from, to),
    countVideosPosted(supabase, channelIds, comparedFrom, comparedTo),
    fetchLatestVideoMetricsByChannel(supabase, channelIds),
    fetchRecentVideoViewsByChannel(supabase, channelIds),
  ]);

  // "Toàn bộ thời gian" is the one period where "view trong kỳ" and "tổng view luỹ kế" are the same
  // number — fall back to summing each video's current cumulative view_count (fetchLatestVideoMetrics-
  // ByChannel, above), which doesn't depend on an unbroken data_snapshot history the way the delta sum
  // below does. Any other period keeps the delta sum — see that function's doc comment for why summing
  // raw view_count there would badly overcount.
  const isAllTime = from === ALL_TIME_FROM;

  const byChannel = groupByChannel(allRows);

  for (const channelId of channelIds) {
    const rows = byChannel.get(channelId) ?? [];
    const currentRows = rows.filter((r) => r.date >= from && r.date <= to);
    const previousRows = rows.filter((r) => r.date >= comparedFrom && r.date <= comparedTo);

    // View sums count only days with a COMPLETE, known videoViews — a truncated/rate-limited read
    // (`isComplete=false`) is excluded here the same way lib/kpi.ts drops it from KPI actuals
    // (CLAUDE.md: "không dùng snapshot đó tính KPI"). The `.length`s also feed the coverage gate.
    const currentViewDays = currentRows.filter((r) => r.isComplete && r.videoViews !== null);
    const previousViewDays = previousRows.filter((r) => r.isComplete && r.videoViews !== null);

    const views = isAllTime ? (metricsByChannel.get(channelId)?.views ?? 0) : sumViews(currentViewDays);
    const previousViews = sumViews(previousViewDays);
    // "so với kỳ trước" only when both periods have view data AND the current one isn't so much
    // thinner that the % would just be measuring missing days (27/08/2026 — see viewsDeltaComparable).
    const bothMeasured = views !== null && previousViews !== null;
    const coverageComparable = bothMeasured && viewsDeltaComparable(currentViewDays.length, previousViewDays.length);
    const viewsDeltaPct = coverageComparable ? pctChange(views, previousViews) : null;
    const viewsDeltaInsufficientData = bothMeasured && !coverageComparable;
    const videos = videosCurrent.get(channelId) ?? 0;
    const previousVideos = videosPrevious.get(channelId) ?? 0;

    // A gap day (no row synced) must not read as "dropped to zero" — fall back to the previous
    // period's last known value so a currently-empty tail (today-anchored windows, M4 decision
    // 2026-08-21) doesn't make a channel with real history look like it has none.
    const followersNow = latestFollowers(currentRows) ?? latestFollowers(previousRows);
    const followersBefore = latestFollowers(previousRows);
    const followersGain =
      followersNow !== null && followersBefore !== null ? followersNow - followersBefore : null;

    result.set(channelId, {
      channelId,
      views,
      previousViews,
      viewsDeltaPct,
      viewsDeltaInsufficientData,
      viewsMeasuredDays: currentViewDays.length,
      previousViewsMeasuredDays: previousViewDays.length,
      videos,
      previousVideos,
      viewsPerVideo: views !== null && videos > 0 ? Math.round(views / videos) : null,
      totalLikes: metricsByChannel.get(channelId)?.likes ?? 0,
      followersNow,
      followersBefore,
      followersGain,
      followersRatePct:
        followersGain !== null && followersBefore ? Math.round((followersGain / followersBefore) * 1000) / 10 : null,
      spark: recentVideoViews.get(channelId) ?? [],
      sourceBreakdown: computeSourceBreakdown(currentRows),
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// GET /api/dashboard — docs/API_SPEC.md. Same shape for both roles; `myChannels` is the only
// role-branch (creator-only), per docs/USER_FLOW.md "teamStats/trend/growth/viewShare/efficiency:
// Có (giống hệt)".
// ---------------------------------------------------------------------------

export type DashboardRole = "manager" | "creator";

export type DashboardResponse = {
  role: DashboardRole;
  /** Active channels included in every number below — not in docs/API_SPEC.md's original example,
   *  added so the UI's "N kênh" header doesn't have to infer a count from a slice like `growth`
   *  (top 5) or `viewShare` (top 6). */
  channelCount: number;
  /** id+name of every channel counted above — added 25/08/2026 (M5) so `lib/kpi.ts`'s
   *  `buildDashboardKpiSummary()` can scope its own KPI-cycle query to the exact same
   *  role/creatorId/teamId-filtered channel set this function already resolved, without a second
   *  near-duplicate query. `lib/kpi.ts` can't import this function directly (it already imports
   *  FROM this module for `attachProgress`'s query primitives — the reverse import would be
   *  circular), so the two are composed by the caller instead; see app/(app)/page.tsx or
   *  app/api/dashboard/route.ts for the merge. */
  channels: { id: string; name: string }[];
  /** `comparedFrom`/`comparedTo` used to ship as one slash-joined string — no screen ever rendered
   *  it, so "so với kỳ trước" meant something different on every date-range/mode combination with
   *  nothing telling the viewer which days it actually was (CLAUDE.md — vấn đề #1, 21/08/2026). Two
   *  plain date fields so a caller can't forget to show them. */
  period: { from: string; to: string; comparedFrom: string; comparedTo: string };
  teamStats: {
    /** `value: null` = no channel in the set had a measurable view-day this period — render "—",
     *  never "0 view" (see `sumViewsOrNull`). `0` is a real, measured zero. */
    views: { value: number | null; deltaPct: number | null };
    followers: { value: number; deltaAbs: number };
    videos: { value: number; deltaPct: number | null };
    /** `null` whenever `views.value` is — a per-video average of an unknown is still unknown. */
    viewsPerVideo: { value: number | null; deltaPct: number | null };
    /** Current total of every video's latest known like count — not period-scoped, same shape as
     *  `followers`. Replaces the old `engagementRate` tile on the Tổng quan overview specifically
     *  (22/08/2026, theo yêu cầu) — engagement rate itself is unchanged everywhere else (kênh/Creator
     *  detail still show it; CLAUDE.md's "chỉ số dẫn báo duy nhất" rule still holds there). */
    totalLikes: { value: number };
  };
  /** Fixed "tuần này" window (Monday VN → today VN, see `thisWeekRangeVn`) — independent of `period`
   *  above, so these numbers don't move when someone filters the page to a different range
   *  (04/09/2026, theo yêu cầu). `growth` below is sourced from this same window. */
  weekStats: {
    /** `null` = not one channel has a measured view-day yet this week (e.g. Monday before the
     *  nightly cron has run) — same "—", never "0 view" rule as `teamStats.views` (`sumViewsOrNull`). */
    views: number | null;
    followers: number;
    videos: number;
    /** Raw sum of `data_snapshot.likes` (studio_import only — Display API never writes likes) across
     *  the week, no coverage gate. Days without a Studio import yet just contribute 0, so this reads
     *  low until the weekly upload lands (theo yêu cầu 04/09/2026: hiện số hiện có, không chặn bằng
     *  "chưa đủ dữ liệu" như `views` — likes chỉ cập nhật 1 lần/tuần nên gate sẽ luôn treo giữa tuần). */
    likes: number;
  };
  dataFreshness: DataFreshness;
  /** Độ phủ nguồn của KỲ ĐANG CHỌN (`period` ở trên) — khác `dataFreshness`, vốn chỉ nói về ngày mới
   *  nhất. Xem `SourceBreakdown` để biết vì sao Manager cần con số này. */
  sourceCoverage: SourceCoverage;
  /** Deviates from docs/API_SPEC.md's original `{ metric, series }` (one series at a time) — the
   *  mockups' trend chart has a Lượt xem/Follower/Video tab-switcher, so all three are computed
   *  server-side instead of adding a `?metric=` param the client would have to refetch on every
   *  tab click. docs/API_SPEC.md updated to match (M4). */
  /** Cả 3 mốc ngày/tuần/tháng computed server-side, same reasoning as bundling all 3 metrics below —
   *  the mockups' ngày/tuần/tháng toggle (docs/TASKS.md Đợt 2 #2, "so tháng 7 với tháng 8") switches
   *  client-side with no refetch, exactly like the Lượt xem/Follower/Video metric tabs already do.
   *  `day` = 14 ngày gần nhất, dày kín cửa sổ; điểm ngày không bao giờ mang `coverage`. */
  trend: {
    day: { views: TrendPoint[]; followers: TrendPoint[]; videos: TrendPoint[] };
    week: { views: TrendPoint[]; followers: TrendPoint[]; videos: TrendPoint[] };
    month: { views: TrendPoint[]; followers: TrendPoint[]; videos: TrendPoint[] };
  };
  /** Per-channel follower gain over `weekStats`'s fixed "tuần này" window, NOT `period`
   *  (04/09/2026, theo yêu cầu) — see `thisWeekRangeVn`. */
  growth: { channelId: string; channelName: string; followers: number; gain: number; ratePct: number | null }[];
  viewShare: { channelId: string; channelName: string; views: number; sharePct: number }[];
  efficiency: { channelId: string; channelName: string; videos: number; viewsPerVideo: number }[];
  /** `getDashboard()` trả `{0,0,0,[]}`; số thật do `spliceDashboardKpi()` (lib/kpi.ts) ghép vào sau
   *  — xem API_SPEC "Tại sao 2 lệnh gọi". Shape phải khớp `DashboardKpiSummary` ở lib/kpi.ts (không
   *  import chéo được vì kpi.ts đã import runtime từ đây). `attention` = mọi kênh KHÔNG đạt tiến độ,
   *  `red` trước `yellow`. */
  kpiSummary: {
    onTrack: number;
    atRisk: number;
    behind: number;
    attention: { channelId: string; channelName: string; reason: string; health: "red" | "yellow" }[];
  };
  /** Non-null only for `role: "creator"`. `hasActiveKpi` is a documented M4 addition (see
   *  docs/API_SPEC.md) — the original shape assumed a cycle always exists; today none do. */
  myChannels:
    | {
        channelId: string;
        channelName: string;
        handle: string;
        followers: number | null;
        overallStatus: "green" | "yellow" | "red" | null;
        metrics: { name: string; pct: number; text: string; hint: string }[];
        hasActiveKpi: boolean;
      }[]
    | null;
};

export async function getDashboard(
  supabase: SupabaseServerClient,
  params: {
    role: DashboardRole;
    userId: string;
    from: string;
    to: string;
    creatorId?: string | null;
    /** Filters down to channels whose current Creator belongs to this team. Team is purely an
     *  organizational grouping (CLAUDE.md, 21/08/2026) — a channel has no team_id of its own, so
     *  this always resolves through `creator.team_id`, never a stored/cached copy. */
    teamId?: string | null;
  },
): Promise<DashboardResponse> {
  const { role, userId, from, to, creatorId, teamId } = params;
  const { comparedFrom, comparedTo } = previousPeriod(from, to);
  const { from: weekFrom, to: weekTo } = thisWeekRangeVn();
  const { comparedFrom: weekComparedFrom, comparedTo: weekComparedTo } = previousPeriod(weekFrom, weekTo);
  const dayTrendFrom = addDaysToDateString(to, -13); // 14 ngày gần nhất cho mốc "ngày"
  const weekTrendFrom = isoWeekStart(addDaysToDateString(to, -55)); // ~8 full ISO weeks, snapped to Monday
  // ~6 months back — enough to compare "tháng 7 với tháng 8" (docs/TASKS.md Đợt 2 #2), same 180-day
  // window channels/[id]/page.tsx's DailyTable already uses (HISTORY_DAYS), so this superset covers
  // the week + day windows above too — one fetch serves all three granularities, not three.
  const monthTrendFrom = addDaysToDateString(to, -179);

  let channelsQuery = supabase
    .from("channel")
    .select("id, name, tiktok_handle, current_creator_id")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (creatorId) channelsQuery = channelsQuery.eq("current_creator_id", creatorId);
  if (teamId) {
    const { data: teamCreators, error: teamCreatorsError } = await supabase
      .from("creator")
      .select("id")
      .eq("team_id", teamId);
    if (teamCreatorsError) throw teamCreatorsError;
    channelsQuery = channelsQuery.in(
      "current_creator_id",
      (teamCreators ?? []).map((c) => c.id as string),
    );
  }
  const { data: channels, error: channelsError } = await channelsQuery;
  if (channelsError) throw channelsError;

  const activeChannels = channels ?? [];
  const channelIds = activeChannels.map((c) => c.id);
  const nameById = new Map(activeChannels.map((c) => [c.id, c.name]));

  const [periodStats, trendRows, trendPostedDates, freshness, totalLikes, weekPeriodStats, weekRows] =
    await Promise.all([
      getChannelPeriodStats(supabase, { channelIds, from, to, comparedFrom, comparedTo }),
      fetchDailyRows(supabase, channelIds, monthTrendFrom, to),
      fetchPostedVnDates(supabase, channelIds, monthTrendFrom, to),
      fetchDataFreshness(supabase, channelIds),
      sumLatestVideoLikes(supabase, channelIds),
      // Independent of the page's own period filter — always the fixed "tuần này" window (see
      // `thisWeekRangeVn`'s doc comment for why `period`'s comparedFrom/comparedTo isn't reused here).
      getChannelPeriodStats(supabase, {
        channelIds,
        from: weekFrom,
        to: weekTo,
        comparedFrom: weekComparedFrom,
        comparedTo: weekComparedTo,
      }),
      fetchDailyRows(supabase, channelIds, weekFrom, weekTo),
    ]);
  // Week + day granularities are subsets of the 180-day fetch above — filtering in memory instead of
  // second/third near-duplicate queries.
  const weekTrendRows = trendRows.filter((r) => r.date >= weekTrendFrom);
  const weekTrendPostedDates = trendPostedDates.filter((d) => d >= weekTrendFrom);
  const dayTrendRows = trendRows.filter((r) => r.date >= dayTrendFrom);
  const dayTrendPostedDates = trendPostedDates.filter((d) => d >= dayTrendFrom);

  const stats = [...periodStats.values()];
  // A channel with no measurement this period (views: null) contributes nothing to the team total —
  // standard rollup semantics — but stays "—" at its own row (see growth/viewShare/efficiency below,
  // which filter it out of those lists instead of silently showing it at 0%).
  const sum = (pick: (s: ChannelPeriodStat) => number | null) => stats.reduce((acc, s) => acc + (pick(s) ?? 0), 0);

  // `sumViewsOrNull`, not `sum` — see its doc: every channel unmeasured must stay "—", not become
  // a "0 view" tile that reads as a real, measured zero.
  const teamViews = sumViewsOrNull(stats.map((s) => s.views));
  const teamPreviousViews = sum((s) => s.previousViews);
  const teamVideos = sum((s) => s.videos);
  const teamPreviousVideos = sum((s) => s.previousVideos);
  // Derived from an unknown is still unknown — "0 view/video" would be the same lie as "0 view".
  const teamViewsPerVideo = teamViews === null ? null : teamVideos > 0 ? Math.round(teamViews / teamVideos) : 0;
  const teamPreviousViewsPerVideo = teamPreviousVideos > 0 ? teamPreviousViews / teamPreviousVideos : 0;
  const teamFollowersNow = sum((s) => s.followersNow ?? 0);
  const teamFollowersGain = sum((s) => s.followersGain ?? 0);
  // Same coverage gate as per-channel: a view % (and the viewsPerVideo % derived from it) isn't
  // shown when the current period's measured view-days are too thin next to the comparison period.
  const teamViewDeltaComparable = viewsDeltaComparable(
    sum((s) => s.viewsMeasuredDays),
    sum((s) => s.previousViewsMeasuredDays),
  );

  const weekStatsList = [...weekPeriodStats.values()];
  const weekViews = sumViewsOrNull(weekStatsList.map((s) => s.views));
  const weekFollowersGain = weekStatsList.reduce((acc, s) => acc + (s.followersGain ?? 0), 0);
  const weekVideos = weekStatsList.reduce((acc, s) => acc + s.videos, 0);
  const weekLikes = sumEngagementParts(weekRows).likes;

  // `withUnfinishedMarks` lo cả 3 việc: kéo dài chuỗi tới kỳ chứa `to` (luôn có cột "tuần này" dù
  // hôm nay chưa sync), cắt còn 8 tuần / 6 tháng, và đánh dấu cột cuối dở dang để UI vẽ nét đứt thay
  // vì đọc như một cú tụt thật. `trendThrough` = ngày dữ liệu mới nhất để tính "mới có N/M ngày".
  const trendThrough = latestDateOf(trendRows);
  const trendOpts = { now: to, through: trendThrough };
  const dayWindow: DayWindow = { from: dayTrendFrom, to, through: trendThrough };
  const viewsTrend = withUnfinishedMarks(
    {
      day: bucketDailyViews(dayTrendRows, dayWindow),
      week: bucketWeeklyViews(weekTrendRows),
      month: bucketMonthlyViews(trendRows),
    },
    trendOpts,
  );
  const followersTrend = withUnfinishedMarks(
    {
      day: bucketDailyLastFollowers(dayTrendRows, dayWindow),
      week: bucketWeeklyLastFollowers(weekTrendRows),
      month: bucketMonthlyLastFollowers(trendRows),
    },
    trendOpts,
  );
  const videosTrend = withUnfinishedMarks(
    {
      day: bucketDailyVideoCounts(dayTrendPostedDates, dayWindow),
      week: bucketWeeklyVideoCounts(weekTrendPostedDates),
      month: bucketMonthlyVideoCounts(trendPostedDates),
    },
    trendOpts,
  );

  // No `.slice()` here — every channel, not just a top-N (24/08/2026, theo yêu cầu: xem hết mọi
  // kênh, sẽ có nhiều kênh về sau). `ListCard` (dashboard-widgets.tsx) scrolls internally instead of
  // the page growing unbounded. Sourced from `weekStatsList` (fixed "tuần này"), not `stats` (the
  // page's own filter) — see `thisWeekRangeVn`'s doc comment.
  const growth = weekStatsList
    .filter((s) => s.followersNow !== null)
    .map((s) => ({
      channelId: s.channelId,
      channelName: nameById.get(s.channelId) ?? "",
      followers: s.followersNow ?? 0,
      gain: s.followersGain ?? 0,
      ratePct: s.followersRatePct,
    }))
    .sort((a, b) => b.gain - a.gain);

  // Filtered like `growth` above (which already drops `followersNow === null`) — a channel with no
  // view measurement this period must not appear in a ranking at a misleading "0%"/"0 view".
  const viewShare = stats
    .filter((s) => s.views !== null)
    .map((s) => ({
      channelId: s.channelId,
      channelName: nameById.get(s.channelId) ?? "",
      views: s.views!,
      // teamViews can only be null when nothing was measured, in which case `.filter` above already
      // emptied this list — the guard is for the type, not a reachable branch.
      sharePct: teamViews !== null && teamViews > 0 ? Math.round((s.views! / teamViews) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.views - a.views);

  const efficiency = stats
    .filter((s) => s.videos > 0 && s.viewsPerVideo !== null)
    .map((s) => ({
      channelId: s.channelId,
      channelName: nameById.get(s.channelId) ?? "",
      videos: s.videos,
      viewsPerVideo: s.viewsPerVideo!,
    }))
    .sort((a, b) => b.viewsPerVideo - a.viewsPerVideo);

  const myChannels =
    role === "creator"
      ? activeChannels
          .filter((c) => c.current_creator_id === userId)
          .map((c) => ({
            channelId: c.id,
            channelName: c.name,
            handle: c.tiktok_handle,
            followers: periodStats.get(c.id)?.followersNow ?? null,
            overallStatus: null,
            metrics: [],
            hasActiveKpi: false,
          }))
      : null;

  return {
    role,
    channelCount: activeChannels.length,
    channels: activeChannels.map((c) => ({ id: c.id, name: c.name })),
    period: { from, to, comparedFrom, comparedTo },
    teamStats: {
      views: {
        value: teamViews,
        deltaPct: teamViewDeltaComparable && teamViews !== null ? pctChange(teamViews, teamPreviousViews) : null,
      },
      followers: { value: teamFollowersNow, deltaAbs: teamFollowersGain },
      videos: { value: teamVideos, deltaPct: pctChange(teamVideos, teamPreviousVideos) },
      viewsPerVideo: {
        value: teamViewsPerVideo,
        deltaPct:
          teamViewDeltaComparable && teamViewsPerVideo !== null
            ? pctChange(teamViewsPerVideo, teamPreviousViewsPerVideo)
            : null,
      },
      totalLikes: { value: totalLikes },
    },
    weekStats: {
      views: weekViews,
      followers: weekFollowersGain,
      videos: weekVideos,
      likes: weekLikes,
    },
    dataFreshness: freshness,
    // Từ `periodStats` (kỳ đang chọn), KHÔNG phải `weekPeriodStats` — badge phải mô tả đúng con số
    // người dùng đang nhìn, và con số đó chạy theo bộ lọc kỳ trên trang.
    sourceCoverage: aggregateSourceCoverage(activeChannels, periodStats),
    trend: {
      day: {
        views: viewsTrend.day,
        followers: followersTrend.day,
        videos: videosTrend.day,
      },
      week: {
        views: viewsTrend.week,
        followers: followersTrend.week,
        videos: videosTrend.week,
      },
      month: {
        views: viewsTrend.month,
        followers: followersTrend.month,
        videos: videosTrend.month,
      },
    },
    growth,
    viewShare,
    efficiency,
    kpiSummary: { onTrack: 0, atRisk: 0, behind: 0, attention: [] },
    myChannels,
  };
}
