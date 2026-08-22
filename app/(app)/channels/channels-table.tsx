"use client";

import { useMemo, useState } from "react";

import type { ChannelSummary } from "@/lib/channels";
import type { ChannelPeriodStat } from "@/lib/dashboard";

import { ExportCsvButton } from "../export-csv-button";
import { CHANNEL_TABLE_COLUMNS, ChannelRow } from "./channel-form";

type CreatorOption = { id: string; name: string };
type Row = { channel: ChannelSummary; stat: ChannelPeriodStat | undefined };

type QuickFilter = "all" | "declining" | "unassigned" | "inactive";
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
}: {
  rows: Row[];
  creators: CreatorOption[];
  isManager: boolean;
  currentUserId: string;
}) {
  const [search, setSearch] = useState("");
  const [creatorId, setCreatorId] = useState("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [sort, setSort] = useState<SortKey>("views");

  const counts = useMemo(
    () => ({
      all: rows.length,
      declining: rows.filter((r) => (r.stat?.viewsDeltaPct ?? 0) < 0).length,
      unassigned: rows.filter((r) => !r.channel.currentCreator).length,
      inactive: rows.filter((r) => !r.channel.isActive).length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const q = normalize(search);
    let list = rows.filter(({ channel }) => {
      if (q && !normalize(channel.name).includes(q) && !normalize(channel.tiktokHandle).includes(q)) return false;
      if (creatorId !== "all" && channel.currentCreator?.id !== creatorId) return false;
      return true;
    });

    if (quickFilter === "declining") list = list.filter((r) => (r.stat?.viewsDeltaPct ?? 0) < 0);
    else if (quickFilter === "unassigned") list = list.filter((r) => !r.channel.currentCreator);
    else if (quickFilter === "inactive") list = list.filter((r) => !r.channel.isActive);

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
  }, [rows, search, creatorId, quickFilter, sort]);

  const chips: { key: QuickFilter; label: string }[] = [
    { key: "all", label: "Tất cả" },
    { key: "declining", label: "Đang giảm view" },
    { key: "unassigned", label: "Chưa gán Creator" },
    { key: "inactive", label: "Ngừng hoạt động" },
  ];

  return (
    <div>
      <div className="mb-3.5 rounded-card border border-line p-3.5">
        <div className="mb-3 flex items-center gap-2.5">
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

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-ink-3">Lọc nhanh</span>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setQuickFilter(chip.key)}
              className={`rounded-pill px-3 py-1.5 text-[12.5px] font-semibold ${
                quickFilter === chip.key ? "bg-ink text-white" : "bg-line-soft text-ink hover:opacity-80"
              }`}
            >
              {chip.label} <span className="opacity-60">{counts[chip.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-2.5 flex items-center justify-between">
        <ExportCsvButton
          filename={`kenh_${new Date().toISOString().slice(0, 10)}.csv`}
          headers={["Kênh", "Handle", "Creator", "Follower", "Follower tăng", "Lượt xem", "Thay đổi view (%)", "Video", "View/video"]}
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
              <div className="text-right">Follower</div>
              <div className="text-right">Lượt xem</div>
              <div className="text-right">Video</div>
              <div className="text-right">View / video</div>
              <div className="text-center">7 ngày</div>
              <div>Tiến độ KPI</div>
              <div />
            </div>

            {visible.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-ink-3">Không có kênh nào khớp bộ lọc.</div>
            ) : (
              visible.map((row) => (
                <ChannelRow
                  key={row.channel.id}
                  channel={row.channel}
                  stat={row.stat}
                  creators={creators}
                  isManager={isManager}
                  currentUserId={currentUserId}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
