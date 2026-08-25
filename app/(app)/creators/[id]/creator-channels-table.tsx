import Link from "next/link";

import type { CreatorPerformanceChannel } from "@/lib/dashboard";
import { avatarPalette, formatCompact, formatDeltaPct, formatSignedNumber, initialsFromStart } from "@/lib/format";
import { METRIC_TEXT_CLASS, METRIC_TONE } from "@/lib/metric-tone";

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
            <div className={`text-right ${METRIC_TEXT_CLASS[METRIC_TONE.followers]}`}>Follower</div>
            <div className={`text-right ${METRIC_TEXT_CLASS[METRIC_TONE.views]}`}>Lượt xem</div>
            <div className={`text-right ${METRIC_TEXT_CLASS[METRIC_TONE.videos]}`}>Video</div>
            <div className={`text-right ${METRIC_TEXT_CLASS[METRIC_TONE.likes]}`}>Lượt tim</div>
          </div>

          {channels.map((channel, i) => {
            const avatar = avatarPalette(i);
            return (
            <div
              key={channel.id}
              className="grid items-center gap-3 border-t border-line-soft px-5 py-3.5"
              style={{ gridTemplateColumns: COLUMNS }}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-xs font-extrabold"
                  style={{ background: avatar.bg, color: avatar.fg }}
                >
                  {initialsFromStart(channel.name)}
                </div>
                <div className="min-w-0">
                  <Link href={`/channels/${channel.id}`} className="block truncate text-sm font-bold tracking-[-0.2px] hover:underline">
                    {channel.name}
                  </Link>
                  <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
                    <span className="truncate">{channel.tiktokHandle}</span>
                    <a
                      href={`https://www.tiktok.com/${channel.tiktokHandle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Xem kênh trên TikTok"
                      className="shrink-0 text-ink-3 hover:text-ink"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <path d="M15 3h6v6" />
                        <path d="M10 14 21 3" />
                      </svg>
                    </a>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className={`text-sm font-bold ${METRIC_TEXT_CLASS[METRIC_TONE.followers]}`}>
                  {channel.followersNow !== null ? formatCompact(channel.followersNow) : "—"}
                </div>
                {channel.followersGain !== null ? (
                  <div className="mt-0.5 text-[11.5px] font-semibold text-green-dark">{formatSignedNumber(channel.followersGain)}</div>
                ) : null}
              </div>

              <div className="text-right">
                <div className={`text-sm font-bold ${METRIC_TEXT_CLASS[METRIC_TONE.views]}`}>{formatCompact(channel.views)}</div>
                <div className={`mt-0.5 text-[11.5px] font-semibold ${channel.viewsDeltaPct !== null && channel.viewsDeltaPct < 0 ? "text-red-dark" : "text-green-dark"}`}>
                  {formatDeltaPct(channel.viewsDeltaPct)}
                </div>
              </div>

              <div className={`text-right text-sm font-bold ${METRIC_TEXT_CLASS[METRIC_TONE.videos]}`}>{channel.videos}</div>

              <div className={`text-right text-sm font-bold ${METRIC_TEXT_CLASS[METRIC_TONE.likes]}`}>{formatCompact(channel.totalLikes)}</div>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
