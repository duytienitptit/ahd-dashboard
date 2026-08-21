import Link from "next/link";

import type { DashboardResponse } from "@/lib/dashboard";
import { avatarPalette, formatCompact, formatDeltaPct, formatFullDate, formatSignedNumber, initialsFromStart } from "@/lib/format";

import { SourcePriorityInfo } from "./source-priority-info";

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

export function StatTile({
  label,
  value,
  unit,
  deltaText,
  deltaGood,
  note,
}: {
  label: string;
  value: string;
  unit?: string;
  deltaText: string;
  deltaGood: boolean | null;
  note: string;
}) {
  return (
    <div className="rounded-card border border-line px-[18px] py-4">
      <div className="mb-[11px] text-[12.5px] font-semibold text-ink-3">{label}</div>
      <div className="mb-[9px] flex items-baseline gap-2">
        <div className="text-[30px] font-extrabold leading-none tracking-[-1.1px]">{value}</div>
        {unit ? <div className="text-xs font-medium text-ink-3">{unit}</div> : null}
      </div>
      <div className="flex items-center gap-1.5">
        <DeltaPill text={deltaText} good={deltaGood} />
        <span className="text-[11.5px] text-ink-3">{note}</span>
      </div>
    </div>
  );
}

/** The 4-tile row shared by the Manager and Creator "Tổng quan" headers — same data, same math. */
export function TeamStatsRow({ teamStats }: { teamStats: DashboardResponse["teamStats"] }) {
  return (
    <div className="mb-3.5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        label="Lượt xem"
        value={formatCompact(teamStats.views.value)}
        unit="view"
        deltaText={formatDeltaPct(teamStats.views.deltaPct)}
        deltaGood={teamStats.views.deltaPct === null ? null : teamStats.views.deltaPct >= 0}
        note="so với kỳ trước"
      />
      <StatTile
        label="Follower toàn team"
        value={formatCompact(teamStats.followers.value)}
        unit="follower"
        deltaText={formatSignedNumber(teamStats.followers.deltaAbs)}
        deltaGood={teamStats.followers.deltaAbs >= 0}
        note="tăng trong kỳ"
      />
      <StatTile
        label="Video đã đăng"
        value={String(teamStats.videos.value)}
        unit="video"
        deltaText={formatDeltaPct(teamStats.videos.deltaPct)}
        deltaGood={teamStats.videos.deltaPct === null ? null : teamStats.videos.deltaPct >= 0}
        note="so với kỳ trước"
      />
      <StatTile
        label="Tỷ lệ tương tác"
        value={teamStats.engagementRate.value === null ? "—" : (teamStats.engagementRate.value * 100).toFixed(2).replace(".", ",") + "%"}
        deltaText={formatDeltaPct(teamStats.engagementRate.deltaPct)}
        deltaGood={teamStats.engagementRate.deltaPct === null ? null : teamStats.engagementRate.deltaPct >= 0}
        note="chỉ số dẫn báo"
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
      {!isFresh && freshness.reconciledThrough ? (
        <span className="text-[12.5px]">đã đối chiếu tới {formatFullDate(freshness.reconciledThrough)}</span>
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
          <p className="text-[13px] font-semibold text-ink-2">Chưa có chu kỳ KPI nào</p>
          <p className="max-w-[200px] text-[11.5px] text-ink-3">Tính năng đặt KPI sẽ có ở bản sau.</p>
        </div>
      ) : (
        <>
          <div className="mb-1.5 flex items-baseline gap-2">
            <div className="text-[34px] font-extrabold leading-none tracking-[-1.2px]">
              {kpiSummary.onTrack}/{total}
            </div>
            <div className="text-[13px] text-ink-3">kênh đạt tiến độ</div>
          </div>
        </>
      )}
    </div>
  );
}

type ChannelListItem = { channelId: string; channelName: string };

/** "Tăng trưởng follower" card. */
export function GrowthCard({ growth }: { growth: DashboardResponse["growth"] }) {
  return (
    <ListCard title="Tăng trưởng follower" subtitle="Số follower tăng thêm trong kỳ" empty={growth.length === 0}>
      {growth.map((g, i) => (
        <ChannelRow key={g.channelId} channel={g} index={i}>
          <div className="text-right">
            <div className="text-[13.5px] font-bold text-green-dark">{formatSignedNumber(g.gain)}</div>
            <div className="text-[11px] text-ink-3">{formatCompact(g.followers)} follower</div>
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
            <span className={`text-[12.5px] font-bold ${i === 0 ? "text-cyan-ink" : "text-ink-2"}`}>
              {s.sharePct.toLocaleString("vi-VN")}%
            </span>
          </div>
          <div className="h-[5px] overflow-hidden rounded-pill bg-line-soft">
            <div
              className={`h-[5px] rounded-pill ${i === 0 ? "bg-cyan" : "bg-cyan/40"}`}
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
          <div className="text-right text-[13.5px] font-bold">{formatCompact(e.viewsPerVideo)}</div>
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
        <div className="flex flex-col gap-3">{children}</div>
      )}
    </div>
  );
}

/** Creator-only "Kênh của tôi" block pinned atop the Tổng quan page. `metrics` is always `[]` right
 *  now — no `kpi_cycle` exists yet (M5) — so this renders the honest empty state per channel
 *  instead of the mockups' progress bars, which need an active cycle to mean anything. */
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
          {myChannels.map((channel) => (
            <div key={channel.channelId} className="overflow-hidden rounded-card border border-line">
              <div className="flex items-center justify-between gap-3 border-b border-line-soft px-[18px] py-3.5">
                <div className="flex items-center gap-[11px]">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-cyan-bg text-xs font-extrabold text-cyan-ink-2">
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
              <div className="px-[18px] py-4 text-[12.5px] text-ink-3">
                Chưa có KPI cho kênh này — tính năng đặt KPI sẽ có ở bản sau.
              </div>
            </div>
          ))}
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
