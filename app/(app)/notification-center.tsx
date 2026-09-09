"use client";

import Link from "next/link";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import type { AppNotification } from "@/lib/notification-log";
import { mergeIntoLog, markRead, parseLog, rawLogSnapshot, serverLogSnapshot, subscribeLog } from "@/lib/notification-log";

/**
 * Hộp thoại thông báo GIỮA MÀN HÌNH — "bắt buộc phải xem" (08/09/2026, theo yêu cầu). Chạy ở Tổng
 * quan (`/`): gộp danh sách server vừa tính vào nhật ký `localStorage`, rồi bày từng thông báo CHƯA
 * ĐỌC một cái một. "Đã xem" đánh dấu đã đọc và sang cái tiếp; hết thì đóng.
 *
 * Cố ý không đóng bằng bấm nền / Esc — phải bấm nút. `<Link>` CTA cũng đánh dấu đã đọc trước khi đi.
 */
export function NotificationCenter({ notifications }: { notifications: AppNotification[] }) {
  // Side-effect thuần: nạp danh sách server vào nhật ký. `mergeIntoLog` idempotent + tự bắn sự kiện
  // → `useSyncExternalStore` bên dưới tự cập nhật, không setState trong effect.
  useEffect(() => {
    mergeIntoLog(notifications);
  }, [notifications]);

  const raw = useSyncExternalStore(subscribeLog, rawLogSnapshot, serverLogSnapshot);
  const queue = useMemo(() => parseLog(raw).filter((n) => n.readAt === null), [raw]);

  if (queue.length === 0) return null;

  const current = queue[0];
  const remaining = queue.length - 1;
  const advance = () => markRead([current.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-[420px] rounded-card border border-line bg-bg p-6 text-center shadow-lg"
      >
        <div className="mx-auto mb-3 text-[44px] leading-none">{current.icon}</div>
        <p className="text-[15px] font-semibold leading-snug text-ink">{current.message}</p>

        <div className="mt-5 flex flex-col gap-2">
          {current.cta ? (
            <Link
              href={current.cta.href}
              onClick={advance}
              className="inline-flex items-center justify-center gap-1.5 rounded-btn bg-red px-4 py-2.5 text-[13px] font-bold text-white hover:opacity-90"
            >
              {current.cta.label}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          ) : null}
          <button
            type="button"
            onClick={advance}
            className="rounded-btn border border-line px-4 py-2 text-[13px] font-semibold text-ink-2 hover:bg-surface"
          >
            {current.cta ? "Để sau" : "Đã xem"}
          </button>
        </div>

        {remaining > 0 ? (
          <div className="mt-3 text-[11px] text-ink-3">Còn {remaining} thông báo nữa</div>
        ) : null}
      </div>
    </div>
  );
}
