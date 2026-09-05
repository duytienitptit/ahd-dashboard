import Link from "next/link";

import type { DashboardResponse } from "@/lib/dashboard";
import {
  avatarPalette,
  formatCompact,
  formatFullDate,
  formatSignedCompact,
  formatSignedNumber,
  initialsFromStart,
} from "@/lib/format";
import type { KpiHealthValue } from "@/lib/kpi";
import { METRIC_TEXT_CLASS, METRIC_TONE } from "@/lib/metric-tone";

import { KPI_HEALTH_LABEL } from "./kpi/kpi-widgets";
import { SourcePriorityInfo } from "./source-priority-info";

const KPI_DOT: Record<KpiHealthValue, string> = { green: "bg-green", yellow: "bg-amber", red: "bg-red" };
const KPI_TEXT: Record<KpiHealthValue, string> = { green: "text-green-dark", yellow: "text-amber-dark", red: "text-red-dark" };
const METRIC_NAME_LABEL: Record<string, string> = { views: "Lượt xem", videos: "Video", followers: "Follower" };

function DeltaArrow({ down }: { down: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: down ? "rotate(180deg)" : undefined }}
      aria-hidden="true"
    >
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}

function DeltaPill({ text, good }: { text: string; good: boolean | null }) {
  if (good === null) {
    return <span className="text-[11.5px] text-ink-3">{text}</span>;
  }
  return (
    <span
      className={`inline-flex items-center gap-[3px] rounded-pill px-2 py-[3px] text-[11.5px] font-bold ${
        good ? "bg-green-bg text-green-dark" : "bg-red-bg text-red-dark"
      }`}
    >
      <DeltaArrow down={!good} />
      {text}
    </span>
  );
}

type StatTone = "cyan" | "red" | "green" | "amber" | "blue" | "purple" | "orange" | "crimson";

// blue/purple/orange/crimson = the 4-metric palette (view/follower/video/like), kept in sync with
// lib/metric-tone.ts — StatTile needs its own map too because it also renders the icon-box BG, which
// that shared module doesn't carry. `crimson` (not `red`) for Like — `red` is the brand/button/link
// colour used everywhere else, kept separate so Like's tint doesn't borrow that meaning.
const STAT_TONE_TEXT: Record<StatTone, string> = {
  cyan: "text-cyan-ink",
  red: "text-red",
  green: "text-green-dark",
  amber: "text-amber-dark",
  blue: "text-blue",
  purple: "text-purple",
  orange: "text-orange",
  crimson: "text-crimson",
};

const STAT_TONE_BG: Record<StatTone, string> = {
  cyan: "bg-cyan-bg",
  red: "bg-red-bg",
  green: "bg-green-bg",
  amber: "bg-amber-bg",
  blue: "bg-blue-bg",
  purple: "bg-purple-bg",
  orange: "bg-orange-bg",
  crimson: "bg-crimson-bg",
};

function StatIcon({ tone, children }: { tone: StatTone; children: React.ReactNode }) {
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-card ${STAT_TONE_BG[tone]} ${STAT_TONE_TEXT[tone]}`}
    >
      {children}
    </div>
  );
}

export function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function VideoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="5" width="15" height="14" rx="2" />
      <path d="m17 10 5-3v10l-5-3" />
    </svg>
  );
}

export function HeartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8Z" />
    </svg>
  );
}

export function StatTile({
  label,
  value,
  unit,
  deltaText,
  deltaGood,
  note,
  icon,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  /** Omit all three to render a plain total with no comparison row — the Tổng quan "Tổng số like"
   *  tile has nothing period-over-period to compare (22/08/2026, theo yêu cầu: bỏ badge so kỳ trước
   *  trên các thẻ tổng, xem xu hướng qua biểu đồ bên dưới thay vì lặp lại ở từng thẻ). */
  deltaText?: string;
  deltaGood?: boolean | null;
  note?: string;
  /** Colored icon badge top-right of the label, and the value text tinted to match — Tổng quan's
   *  4 headline tiles only (24/08/2026, theo yêu cầu, kể cả 2 tone mới `blue`/`purple` — xem
   *  docs/DESIGN_SYSTEM.md mục "Icon-box màu"). Omit on every other StatTile caller (Kênh/Creator
   *  chi tiết) — layout/màu chữ giữ nguyên `ink` mặc định khi absent. */
  icon?: React.ReactNode;
  tone?: StatTone;
}) {
  return (
    <div className="rounded-card border border-line px-[18px] py-4">
      <div className="mb-[11px] flex items-start justify-between gap-2">
        <div className="text-[12.5px] font-semibold text-ink-3">{label}</div>
        {icon ? <StatIcon tone={tone ?? "cyan"}>{icon}</StatIcon> : null}
      </div>
      <div className={deltaText || note ? "mb-[9px] flex items-baseline gap-2" : "flex items-baseline gap-2"}>
        <div className={`text-[30px] font-extrabold leading-none tracking-[-1.1px] ${tone ? STAT_TONE_TEXT[tone] : ""}`}>
          {value}
        </div>
        {unit ? <div className="text-xs font-medium text-ink-3">{unit}</div> : null}
      </div>
      {/* `note` also renders on its own (no deltaText) — a tile showing "—" has no delta to pair
          with but still needs to say WHY it's empty (28/08/2026). */}
      {deltaText || note ? (
        <div className="flex items-center gap-1.5">
          {deltaText ? <DeltaPill text={deltaText} good={deltaGood ?? null} /> : null}
          {note ? <span className="text-[11.5px] text-ink-3">{note}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/** The 4-tile row shared by the Manager and Creator "Tổng quan" headers — same data, same math.
 *  Value = the page's selected filter (`teamStats`); the small badge underneath is always "tuần
 *  này" (`weekStats`, fixed Monday VN → today VN) regardless of that filter — reversed 22/08/2026's
 *  "no per-tile delta, see trend chart instead" for this one fixed number (04/09/2026, theo yêu cầu).
 */
export function TeamStatsRow({
  teamStats,
  weekStats,
}: {
  teamStats: DashboardResponse["teamStats"];
  weekStats: DashboardResponse["weekStats"];
}) {
  return (
    <div className="mb-3.5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {/* "—" + a reason, never "0 view": a null total means no day could be measured, not that the
          channels earned nothing (28/08/2026 — see lib/dashboard.ts `sumViewsOrNull`). */}
      <StatTile
        label="Lượt xem"
        value={teamStats.views.value !== null ? formatCompact(teamStats.views.value) : "—"}
        unit={teamStats.views.value !== null ? "view" : undefined}
        note={teamStats.views.value === null ? "chưa có số liệu kỳ này" : undefined}
        deltaText={weekStats.views !== null ? `${formatSignedCompact(weekStats.views)} tuần này` : undefined}
        deltaGood={weekStats.views !== null ? true : undefined}
        icon={<EyeIcon />}
        tone="blue"
      />
      <StatTile
        label="Follower toàn team"
        value={formatCompact(teamStats.followers.value)}
        unit="follower"
        deltaText={`${formatSignedNumber(weekStats.followers)} tuần này`}
        deltaGood={true}
        icon={<UsersIcon />}
        tone="purple"
      />
      <StatTile
        label="Video đã đăng"
        value={String(teamStats.videos.value)}
        unit="video"
        deltaText={`${formatSignedNumber(weekStats.videos)} tuần này`}
        deltaGood={true}
        icon={<VideoIcon />}
        tone="orange"
      />
      <StatTile
        label="Tổng số like"
        value={formatCompact(teamStats.totalLikes.value)}
        unit="like"
        // `0` ẩn hẳn badge thay vì hiện "+0 tuần này" — likes chỉ nhảy số khi Manager upload file
        // Studio (1 lần/tuần), nên đầu tuần gần như luôn ra 0 và một badge "+0" ở đây đọc như "tuần
        // này không có tương tác" trong khi sự thật là "chưa có dữ liệu" (theo yêu cầu 04/09/2026).
        deltaText={weekStats.likes > 0 ? `${formatSignedCompact(weekStats.likes)} tuần này` : undefined}
        deltaGood={weekStats.likes > 0 ? true : undefined}
        icon={<HeartIcon />}
        tone="crimson"
      />
    </div>
  );
}

export function DataFreshnessLine({
  channelCount,
  freshness,
}: {
  channelCount: number;
  freshness: DashboardResponse["dataFreshness"];
}) {
  if (!freshness.latestDate) {
    return (
      <div className="mt-1.5 flex items-center gap-2 text-[13px] text-ink-3">
        <span>{channelCount} kênh</span>
        <span className="h-[3px] w-[3px] rounded-pill bg-line" />
        <span>Chưa có dữ liệu nào được đồng bộ hoặc import.</span>
      </div>
    );
  }

  const isFresh = freshness.label === "đã đối chiếu";
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
      <span>{channelCount} kênh</span>
      <span className="h-[3px] w-[3px] rounded-pill bg-line" />
      <span>Dữ liệu gần nhất {formatFullDate(freshness.latestDate)}</span>
      <span
        className={`inline-flex items-center gap-[5px] rounded-pill px-[9px] py-[2px] text-[11.5px] font-semibold ${
          isFresh ? "bg-green-bg text-green-dark" : "bg-amber-bg text-amber-dark"
        }`}
      >
        <span className={`h-[5px] w-[5px] rounded-pill ${isFresh ? "bg-green" : "bg-amber"}`} />
        {freshness.label}
      </span>
      {/* `reconciledThrough` is the date the WHOLE set is reconciled through, so it only shows when
          every channel has been imported at least once. Otherwise the honest thing to report is how
          many channels have never been reconciled — those can't be finalized at all (28/08/2026). */}
      {!isFresh && freshness.reconciledThrough ? (
        <span className="text-[12.5px]">đã đối chiếu tới {formatFullDate(freshness.reconciledThrough)}</span>
      ) : null}
      {freshness.channelsNeverReconciled > 0 ? (
        <span
          className="text-[12.5px] font-semibold text-amber-dark"
          title="Kênh chưa có lần import file Studio nào — chưa đối chiếu được ngày nào và chưa chốt sổ KPI được."
        >
          {freshness.channelsNeverReconciled} kênh chưa đối chiếu lần nào
        </span>
      ) : null}
      <SourcePriorityInfo />
    </div>
  );
}

export function KpiSummaryCard({ kpiSummary }: { kpiSummary: DashboardResponse["kpiSummary"] }) {
  const total = kpiSummary.onTrack + kpiSummary.atRisk + kpiSummary.behind;
  return (
    <div className="rounded-card border border-line px-5 py-[18px]">
      <div className="mb-4 text-[15px] font-bold">Tình hình KPI</div>
      {total === 0 ? (
        <div className="flex h-[150px] flex-col items-center justify-center gap-1.5 text-center">
          <p className="text-[13px] font-semibold text-ink-2">Chưa có chu kỳ KPI nào đang chạy</p>
          <Link href="/kpi/new" className="text-[11.5px] font-semibold text-red hover:opacity-80">
            + Đặt KPI mới
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-1.5 flex items-baseline gap-2">
            <div className="text-[34px] font-extrabold leading-none tracking-[-1.2px]">
              {kpiSummary.onTrack}/{total}
            </div>
            <div className="text-[13px] text-ink-3">kênh đạt tiến độ</div>
          </div>
          <div className="mb-3.5 flex items-center gap-3 text-[11.5px] text-ink-3">
            <span>
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-pill bg-amber" />
              {kpiSummary.atRisk} cần chú ý
            </span>
            <span>
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-pill bg-red" />
              {kpiSummary.behind} tụt lại
            </span>
          </div>
          {kpiSummary.attention.length > 0 ? (
            <div className="scroll-thin flex max-h-[140px] flex-col gap-2 overflow-y-auto border-t border-line-soft pt-3">
              {kpiSummary.attention.map((a) => (
                <Link
                  key={a.channelId}
                  href={`/channels/${a.channelId}`}
                  className="block text-[11.5px] text-ink-2 hover:underline"
                >
                  <span className="font-semibold">{a.channelName}</span> — {a.reason}
                </Link>
              ))}
            </div>
          ) : null}
          <Link href="/kpi" className="mt-3 inline-block text-[11.5px] font-semibold text-red hover:opacity-80">
            Xem tất cả →
          </Link>
        </>
      )}
    </div>
  );
}

type ChannelListItem = { channelId: string; channelName: string };

/** "Tăng trưởng follower" card — always "tuần này" (fixed Monday VN → today VN), independent of the
 *  page's period filter (04/09/2026, theo yêu cầu — xem lib/dashboard.ts `thisWeekRangeVn`). */
export function GrowthCard({ growth }: { growth: DashboardResponse["growth"] }) {
  return (
    <ListCard title="Tăng trưởng follower" subtitle="Số follower tăng thêm trong tuần" empty={growth.length === 0}>
      {growth.map((g, i) => (
        <ChannelRow key={g.channelId} channel={g} index={i}>
          <div className="text-right">
            <div className="text-[13.5px] font-bold text-green-dark">{formatSignedNumber(g.gain)}</div>
            <div className={`text-[11px] ${METRIC_TEXT_CLASS[METRIC_TONE.followers]}`}>{formatCompact(g.followers)} follower</div>
          </div>
        </ChannelRow>
      ))}
    </ListCard>
  );
}

/** "Đóng góp lượt xem" card. */
export function ViewShareCard({ viewShare }: { viewShare: DashboardResponse["viewShare"] }) {
  const maxShare = Math.max(1, ...viewShare.map((s) => s.sharePct));
  return (
    <ListCard title="Đóng góp lượt xem" subtitle="Tỷ trọng trong tổng view của team" empty={viewShare.length === 0}>
      {viewShare.map((s, i) => (
        <div key={s.channelId}>
          <div className="mb-[5px] flex items-baseline justify-between">
            <Link href={`/channels/${s.channelId}`} className="text-[12.5px] font-semibold text-ink hover:underline">
              {s.channelName}
            </Link>
            <span className={`text-[12.5px] font-bold ${i === 0 ? METRIC_TEXT_CLASS[METRIC_TONE.views] : "text-ink-2"}`}>
              {s.sharePct.toLocaleString("vi-VN")}%
            </span>
          </div>
          <div className="h-[5px] overflow-hidden rounded-pill bg-line-soft">
            <div
              className={`h-[5px] rounded-pill ${i === 0 ? "bg-blue" : "bg-blue/40"}`}
              style={{ width: `${(s.sharePct / maxShare) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </ListCard>
  );
}

/** "Hiệu quả nội dung" card. */
export function EfficiencyCard({ efficiency }: { efficiency: DashboardResponse["efficiency"] }) {
  return (
    <ListCard title="Hiệu quả nội dung" subtitle="View trung bình mỗi video đăng lên" empty={efficiency.length === 0}>
      {efficiency.map((e, i) => (
        <ChannelRow key={e.channelId} channel={e} index={i}>
          <div className={`text-right text-[13.5px] font-bold ${METRIC_TEXT_CLASS[METRIC_TONE.views]}`}>{formatCompact(e.viewsPerVideo)}</div>
        </ChannelRow>
      ))}
    </ListCard>
  );
}

function ListCard({
  title,
  subtitle,
  empty,
  children,
}: {
  title: string;
  subtitle: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-line px-5 py-[18px]">
      <div className="text-[15px] font-bold">{title}</div>
      <div className="mb-4 mt-[3px] text-xs text-ink-3">{subtitle}</div>
      {empty ? (
        <p className="text-[12.5px] text-ink-3">Chưa có dữ liệu.</p>
      ) : (
        // max-h + overflow-y-auto — hiện toàn bộ kênh (không cắt top-N nữa), nhưng thẻ không phình
        // vô hạn khi hệ thống có nhiều kênh (24/08/2026, theo yêu cầu). ~5-6 dòng vừa khung trước khi
        // cuộn, giữ chiều cao thẻ gần như cũ lúc còn ít kênh.
        <div className="scroll-thin flex max-h-[320px] flex-col gap-3 overflow-y-auto pr-1">{children}</div>
      )}
    </div>
  );
}

/** Creator-only "Kênh của tôi" block pinned atop the Tổng quan page — progress bars per channel
 *  once M5's `mergeDashboardKpi()` has filled in `hasActiveKpi`/`metrics`, the honest "chưa có KPI"
 *  line otherwise. */
export function MyChannelsBlock({ myChannels }: { myChannels: NonNullable<DashboardResponse["myChannels"]> }) {
  return (
    <div className="mb-[22px] rounded-card border border-line px-5 py-[18px]">
      <div className="mb-4 text-[15px] font-bold">
        Kênh của tôi <span className="font-normal text-ink-3">({myChannels.length})</span>
      </div>

      {myChannels.length === 0 ? (
        <p className="text-[13px] text-ink-3">Bạn chưa được gán phụ trách kênh nào.</p>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2">
          {myChannels.map((channel, i) => {
            const palette = avatarPalette(i);
            return (
            <div key={channel.channelId} className="overflow-hidden rounded-card border border-line">
              <div className="flex items-center justify-between gap-3 border-b border-line-soft px-[18px] py-3.5">
                <div className="flex items-center gap-[11px]">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-xs font-extrabold"
                    style={{ background: palette.bg, color: palette.fg }}
                  >
                    {initialsFromStart(channel.channelName)}
                  </div>
                  <div>
                    <Link href={`/channels/${channel.channelId}`} className="text-[15px] font-bold tracking-[-0.2px] hover:underline">
                      {channel.channelName}
                    </Link>
                    <div className="flex items-center gap-[7px] text-[11.5px] text-ink-3">
                      <span>{channel.handle}</span>
                      {channel.followers !== null ? (
                        <>
                          <span className="h-[2px] w-[2px] rounded-pill bg-line" />
                          <span>{formatCompact(channel.followers)} follower</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-[18px] py-4">
                {!channel.hasActiveKpi ? (
                  <p className="text-[12.5px] text-ink-3">Chưa có KPI cho kênh này.</p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {channel.overallStatus ? (
                      <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold">
                        <span className={`h-1.5 w-1.5 rounded-pill ${KPI_DOT[channel.overallStatus]}`} />
                        <span className={KPI_TEXT[channel.overallStatus]}>{KPI_HEALTH_LABEL[channel.overallStatus]}</span>
                      </div>
                    ) : null}
                    {channel.metrics.length === 0 ? (
                      <p className="text-[12.5px] text-ink-3">Chưa có số liệu để tính tiến độ.</p>
                    ) : (
                      channel.metrics.map((m) => (
                        <div key={m.name}>
                          <div className="mb-1 flex items-baseline justify-between text-[11.5px]">
                            <span className="font-semibold text-ink-2">{METRIC_NAME_LABEL[m.name] ?? m.name}</span>
                            <span className="text-ink-3">
                              {m.text} · <strong className="text-ink">{m.pct}%</strong>
                            </span>
                          </div>
                          <div className="h-[5px] overflow-hidden rounded-pill bg-line-soft">
                            <div
                              className="h-[5px] rounded-pill bg-cyan"
                              style={{ width: `${Math.min(100, Math.max(0, m.pct))}%` }}
                            />
                          </div>
                          {m.hint ? <p className="mt-1 text-[11px] text-ink-3">{m.hint}</p> : null}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChannelRow({
  channel,
  index,
  children,
}: {
  channel: ChannelListItem;
  index: number;
  children: React.ReactNode;
}) {
  const palette = avatarPalette(index);
  return (
    <div className="flex items-center gap-[11px]">
      <div
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-pill text-[11px] font-extrabold"
        style={{ background: palette.bg, color: palette.fg }}
      >
        {initialsFromStart(channel.channelName)}
      </div>
      <Link href={`/channels/${channel.channelId}`} className="min-w-0 flex-grow text-[13px] font-semibold hover:underline">
        {channel.channelName}
      </Link>
      {children}
    </div>
  );
}
