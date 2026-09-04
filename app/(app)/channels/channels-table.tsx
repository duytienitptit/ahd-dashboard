"use client";

import { useMemo, useState } from "react";

import type { ChannelSummary } from "@/lib/channels";
import type { ChannelPeriodStat } from "@/lib/dashboard";
import type { KpiCycleWithProgress } from "@/lib/kpi";
import { METRIC_TEXT_CLASS, METRIC_TONE } from "@/lib/metric-tone";

import { ExportCsvButton } from "../export-csv-button";
import { CHANNEL_TABLE_COLUMNS, ChannelRow } from "./channel-form";

type CreatorOption = { id: string; name: string };
type Row = { channel: ChannelSummary; stat: ChannelPeriodStat | undefined };

type SortKey = "views" | "followers" | "growth" | "name";

const SORT_LABELS: Record<SortKey, string> = {
  views: "Lượt xem cao nhất",
  followers: "Follower cao nhất",
  growth: "Tăng trưởng follower",
  name: "Tên A-Z",
};

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export function ChannelsTable({
  rows,
  creators,
  isManager,
  currentUserId,
  kpiByChannel,
}: {
  rows: Row[];
  creators: CreatorOption[];
  isManager: boolean;
  /** `undefined` disables the Creator-owned rename in `ChannelRow` — that is how the TikTok
   *  reviewer's demo account gets a read-only /channels (app/(app)/channels/page.tsx). */
  currentUserId: string | undefined;
  /** This channel's active KPI cycle, keyed by channelId (M5) — `undefined` map/entry both render
   *  ChannelRow's original "Chưa đặt KPI" chip. */
  kpiByChannel?: Map<string, KpiCycleWithProgress>;
}) {
  const [search, setSearch] = useState("");
  const [creatorId, setCreatorId] = useState("all");
  const [sort, setSort] = useState<SortKey>("views");

  const visible = useMemo(() => {
    const q = normalize(search);
    const list = rows.filter(({ channel }) => {
      if (q && !normalize(channel.name).includes(q) && !normalize(channel.tiktokHandle).includes(q)) return false;
      if (creatorId !== "all" && channel.currentCreator?.id !== creatorId) return false;
      return true;
    });

    const sorted = [...list];
    switch (sort) {
      case "views":
        sorted.sort((a, b) => (b.stat?.views ?? 0) - (a.stat?.views ?? 0));
        break;
      case "followers":
        sorted.sort((a, b) => (b.stat?.followersNow ?? 0) - (a.stat?.followersNow ?? 0));
        break;
      case "growth":
        sorted.sort((a, b) => (b.stat?.followersGain ?? 0) - (a.stat?.followersGain ?? 0));
        break;
      case "name":
        sorted.sort((a, b) => a.channel.name.localeCompare(b.channel.name, "vi"));
        break;
    }
    return sorted;
  }, [rows, search, creatorId, sort]);

  return (
    <div>
      <div className="mb-3.5 rounded-card border border-line p-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-[38px] flex-grow items-center gap-2 rounded-input border border-line px-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-3)" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên kênh hoặc @handle…"
              className="w-full text-sm outline-none placeholder:text-ink-3"
            />
          </div>

          {creators.length > 0 ? (
            <select
              value={creatorId}
              onChange={(e) => setCreatorId(e.target.value)}
              className="h-[38px] shrink-0 rounded-input border border-line bg-bg px-3 text-[13px] font-semibold outline-none"
            >
              <option value="all">Tất cả Creator</option>
              {creators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : null}

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-[38px] shrink-0 rounded-input border border-line bg-bg px-3 text-[13px] font-semibold outline-none"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-2.5 flex items-center justify-between">
        <ExportCsvButton
          filename={`kenh_${new Date().toISOString().slice(0, 10)}.csv`}
          headers={["Kênh", "Handle", "Creator", "Follower", "Follower tăng", "Lượt xem", "Thay đổi view (%)", "Video", "ViewTB/video"]}
          rows={visible.map((r) => [
            r.channel.name,
            r.channel.tiktokHandle,
            r.channel.currentCreator?.name ?? "",
            r.stat?.followersNow ?? "",
            r.stat?.followersGain ?? "",
            r.stat?.views ?? "",
            r.stat?.viewsDeltaPct ?? "",
            r.stat?.videos ?? "",
            r.stat?.viewsPerVideo ?? "",
          ])}
        />
        <p className="text-[12.5px] text-ink-3">
          Hiển thị {visible.length} / {rows.length} kênh
        </p>
      </div>

      <div className="overflow-hidden rounded-card border border-line">
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div
              className="grid gap-3 bg-line-soft px-5 py-3 text-xs font-bold text-ink-2"
              style={{ gridTemplateColumns: CHANNEL_TABLE_COLUMNS }}
            >
              <div>Kênh</div>
              <div className={`text-right ${METRIC_TEXT_CLASS[METRIC_TONE.followers]}`}>Follower</div>
              <div className={`text-right ${METRIC_TEXT_CLASS[METRIC_TONE.views]}`}>Lượt xem</div>
              <div className={`text-right ${METRIC_TEXT_CLASS[METRIC_TONE.videos]}`}>Video</div>
              <div className={`text-right ${METRIC_TEXT_CLASS[METRIC_TONE.views]}`}>ViewTB/video</div>
              <div className="text-center">Xu hướng</div>
              <div>Tiến độ KPI</div>
              <div />
            </div>

            {visible.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-ink-3">Không có kênh nào khớp bộ lọc.</div>
            ) : (
              visible.map((row, i) => (
                <ChannelRow
                  key={row.channel.id}
                  channel={row.channel}
                  stat={row.stat}
                  creators={creators}
                  isManager={isManager}
                  currentUserId={currentUserId}
                  index={i}
                  kpi={kpiByChannel?.get(row.channel.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
