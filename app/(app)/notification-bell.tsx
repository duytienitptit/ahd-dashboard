"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";

import { markAllRead, parseLog, rawLogSnapshot, serverLogSnapshot, subscribeLog } from "@/lib/notification-log";

/**
 * Chuông thông báo ở header — "danh sách thông báo gần đây" (08/09/2026, theo yêu cầu). Đọc thẳng
 * nhật ký `localStorage` (`lib/notification-log.ts`) qua `useSyncExternalStore`, tự cập nhật khi nhật
 * ký đổi (cùng tab lẫn khác tab). Số badge = số chưa đọc. Panel liệt kê ~30 cái gần nhất, cái đã đọc
 * mờ đi.
 *
 * Nhật ký chỉ được BỔ SUNG khi vào Tổng quan (`NotificationCenter` gộp danh sách server) — chuông ở
 * đây thuần hiển thị, không tự gọi server.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const raw = useSyncExternalStore(subscribeLog, rawLogSnapshot, serverLogSnapshot);
  const log = useMemo(() => parseLog(raw), [raw]);

  const unread = log.filter((n) => n.readAt === null).length;
  const recent = useMemo(() => [...log].sort((a, b) => b.firstSeenAt - a.firstSeenAt), [log]);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `${unread} thông báo chưa đọc` : "Thông báo"}
        className="relative flex h-8 w-8 items-center justify-center rounded-btn text-ink-2 hover:bg-line-soft hover:text-ink"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-pill bg-red px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button type="button" aria-label="Đóng" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-40 w-[320px] overflow-hidden rounded-card border border-line bg-bg text-left shadow-lg">
            <div className="flex items-center justify-between border-b border-line-soft px-4 py-2.5">
              <span className="text-[13px] font-bold">Thông báo gần đây</span>
              {unread > 0 ? (
                <button type="button" onClick={markAllRead} className="text-[11.5px] font-semibold text-red hover:opacity-80">
                  Đánh dấu đã đọc
                </button>
              ) : null}
            </div>

            {recent.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12px] text-ink-3">Chưa có thông báo nào.</p>
            ) : (
              <div className="max-h-[360px] overflow-y-auto">
                {recent.map((n) => {
                  const body = (
                    <div className={`flex gap-2.5 px-4 py-3 ${n.readAt === null ? "" : "opacity-55"}`}>
                      <span className="text-[18px] leading-none">{n.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] leading-snug text-ink">{n.message}</p>
                        {n.cta ? <span className="mt-1 inline-block text-[11px] font-bold text-red">{n.cta.label} →</span> : null}
                      </div>
                      {n.readAt === null ? <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-pill bg-red" /> : null}
                    </div>
                  );
                  return n.cta ? (
                    <Link key={n.id} href={n.cta.href} onClick={() => setOpen(false)} className="block border-b border-line-soft last:border-0 hover:bg-surface">
                      {body}
                    </Link>
                  ) : (
                    <div key={n.id} className="border-b border-line-soft last:border-0">
                      {body}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}
    </span>
  );
}
