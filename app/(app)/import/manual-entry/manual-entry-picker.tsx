"use client";

import { useState } from "react";

import { ManualEntryForm } from "../../channels/[id]/manual-entry-form";

type ChannelOption = { id: string; name: string; tiktokHandle: string };

/** Channel picker wrapping the same `ManualEntryForm` channel-detail already uses (CLAUDE.md vấn
 *  đề #5, 21/08/2026 — nút "+ Nhập tay" trước đây chỉ có ở Chi tiết kênh, dưới cùng danh sách video,
 *  không ai tìm ra). One shared component, two entry points — chỗ cũ ở Chi tiết kênh vẫn giữ
 *  nguyên (đúng ngữ cảnh khi đang xem một kênh), đây chỉ thêm lối vào thứ hai. */
export function ManualEntryPicker({ channels, todayVn }: { channels: ChannelOption[]; todayVn: string }) {
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");

  if (channels.length === 0) {
    return <p className="text-[13px] text-ink-3">Chưa có kênh nào.</p>;
  }

  return (
    <div>
      <label className="mb-3 block max-w-xs">
        <span className="mb-1.5 block text-[12.5px] font-bold">Chọn kênh</span>
        <select
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          className="h-[40px] w-full rounded-input border border-line bg-bg px-3 text-sm outline-none focus:border-ink"
        >
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.tiktokHandle})
            </option>
          ))}
        </select>
      </label>

      {/* key= forces a remount on channel change so ManualEntryForm's internal open/closed state
          doesn't leak between channels. */}
      <ManualEntryForm key={channelId} channelId={channelId} todayVn={todayVn} />
    </div>
  );
}
