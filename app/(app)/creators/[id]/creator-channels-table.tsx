import Link from "next/link";

import type { CreatorPerformanceChannel } from "@/lib/dashboard";
import { formatCompact, formatDeltaPct, formatSignedNumber, initialsFromStart } from "@/lib/format";

const COLUMNS = "2fr 1fr 1fr 0.7fr 0.9fr";

/**
 * "Kênh phụ trách" table on the Nhân sự detail page — each row links to `/channels/[id]`, the drill-
 * down the old `CreatorCard`'s channel list never had (it rendered plain `<span>`s, a dead end this
 * whole redesign exists to fix). Server component: no interaction of its own, so no `"use client"`.
 */
export function CreatorChannelsTable({ channels }: { channels: CreatorPerformanceChannel[] }) {
  if (channels.length === 0) {
    return (
      <div className="rounded-card border border-line px-5 py-8 text-center text-[12.5px] text-ink-3">
        Chưa phụ trách kênh nào.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-line">
      <div className="border-b border-line-soft px-5 py-4 text-[15px] font-bold">Kênh phụ trách ({channels.length})</div>
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid gap-3 bg-line-soft px-5 py-2.5 text-xs font-bold text-ink-2" style={{ gridTemplateColumns: COLUMNS }}>
            <div>Kênh</div>
            <div className="text-right">Follower</div>
            <div className="text-right">Lượt xem</div>
            <div className="text-right">Video</div>
            <div className="text-right">Lượt tim</div>
          </div>

          {channels.map((channel) => (
            <Link
              key={channel.id}
              href={`/channels/${channel.id}`}
              className="grid items-center gap-3 border-t border-line-soft px-5 py-3.5 hover:bg-surface"
              style={{ gridTemplateColumns: COLUMNS }}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-line-soft text-xs font-extrabold text-ink-2">
                  {initialsFromStart(channel.name)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold tracking-[-0.2px]">{channel.name}</div>
                  <div className="truncate text-[11.5px] text-ink-3">{channel.tiktokHandle}</div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm font-bold">{channel.followersNow !== null ? formatCompact(channel.followersNow) : "—"}</div>
                {channel.followersGain !== null ? (
                  <div className="mt-0.5 text-[11.5px] font-semibold text-green-dark">{formatSignedNumber(channel.followersGain)}</div>
                ) : null}
              </div>

              <div className="text-right">
                <div className="text-sm font-bold">{formatCompact(channel.views)}</div>
                <div className={`mt-0.5 text-[11.5px] font-semibold ${channel.viewsDeltaPct !== null && channel.viewsDeltaPct < 0 ? "text-red-dark" : "text-green-dark"}`}>
                  {formatDeltaPct(channel.viewsDeltaPct)}
                </div>
              </div>

              <div className="text-right text-sm font-bold">{channel.videos}</div>

              <div className="text-right text-sm font-bold">{formatCompact(channel.totalLikes)}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
