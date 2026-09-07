"use client";

import Link from "next/link";
import { useState } from "react";

import { avatarPalette, initialsFromStart } from "@/lib/format";

/**
 * Một dòng kênh gập/mở được trên `/kpi` (07/09/2026, theo yêu cầu — "1 nút dropdown click vào thì
 * hiện ra các kpi"). Trước đó mỗi kênh CÓ chu kỳ KPI đều bung hết nội dung, nên chỉ 1-2 kênh đã đẩy
 * các kênh còn lại xuống dưới màn hình, trong khi 7/9 kênh chỉ là dòng "Chưa có KPI" một hàng.
 *
 * Trạng thái (badge % + sức khoẻ) nằm NGOÀI phần gập — mở ra chỉ để xem chi tiết, không phải để biết
 * kênh đang thế nào. Đúng tinh thần CLAUDE.md "trả lời 'dữ liệu các kênh đang thế nào' trước": gập
 * lại vẫn đọc được ngay 9 kênh đang ra sao, không phải bấm 9 lần.
 *
 * Nút bấm là phần tử duy nhất toggle, KHÔNG phải cả hàng — tên kênh là `<Link>` sang `/channels/[id]`,
 * để cả hàng toggle thì bấm vào tên vừa điều hướng vừa gập, đọc như lỗi.
 */
export function KpiChannelDisclosure({
  channelId,
  channelName,
  tiktokHandle,
  avatarIndex,
  badge,
  note,
  children,
}: {
  channelId: string;
  channelName: string;
  /** Đã kèm `@` sẵn trong DB (`channel.tiktok_handle`) — render trần, đừng thêm `@` nữa. */
  tiktokHandle: string;
  avatarIndex: number;
  /** Pill trạng thái render sẵn ở server (`KpiHealthBadge`) — hiện cả khi đang gập. */
  badge?: React.ReactNode;
  /** Dòng ngữ cảnh ngắn cạnh badge — chỉ set khi kênh KHÔNG có kỳ đang chạy: "N kỳ trước".
   *  Có kỳ đang chạy thì badge đã đủ, để `undefined`. */
  note?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = `kpi-panel-${channelId}`;

  return (
    <div className="mb-3 rounded-card border border-line">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-[12px] font-extrabold"
            style={{ background: avatarPalette(avatarIndex).bg, color: avatarPalette(avatarIndex).fg }}
          >
            {initialsFromStart(channelName)}
          </span>
          <div className="min-w-0">
            <Link href={`/channels/${channelId}`} className="text-sm font-bold hover:underline">
              {channelName}
            </Link>
            <div className="truncate text-[11.5px] text-ink-3">{tiktokHandle}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {badge}
          {note ? <span className="text-[11.5px] text-ink-3">{note}</span> : null}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={panelId}
            className="inline-flex items-center gap-1.5 rounded-btn border border-line px-3 py-1.5 text-[12.5px] font-bold text-ink-2 hover:bg-line-soft"
          >
            {open ? "Ẩn KPI" : "Xem KPI"}
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: open ? "rotate(180deg)" : undefined }}
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Nội dung render sẵn ở server và truyền xuống làm `children` — gập/mở chỉ là ẩn/hiện, không
          phải tải thêm, nên mở ra là thấy ngay, không có trạng thái chờ. */}
      {open ? (
        <div id={panelId} className="border-t border-line-soft">
          {children}
        </div>
      ) : null}
    </div>
  );
}
