"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { AppNotification } from "@/lib/notification-log";
import { mergeIntoLog, markRead, NOTIF_STYLE, parseLog, rawLogSnapshot, serverLogSnapshot, subscribeLog } from "@/lib/notification-log";

/**
 * Hộp thoại thông báo GIỮA MÀN HÌNH — "bắt buộc phải xem" (08/09/2026, theo yêu cầu). Chạy ở Tổng
 * quan (`/`), bày từng thông báo một; "Đã xem" sang cái tiếp.
 *
 * Hai kiểu:
 *  • `repeat: true` (thông báo Creator) — lấy từ danh sách server LIVE, hiện lại MỖI lần vào Tổng
 *    quan; "Đã xem" chỉ tắt cho lần tải trang này (`dismissedThisLoad`), vào lại là hiện tiếp.
 *  • còn lại (Manager) — lấy từ nhật ký, `readAt === null`; "Đã xem" ghi `markRead` vĩnh viễn.
 *
 * Cố ý không đóng bằng bấm nền / Esc — phải bấm nút.
 */
export function NotificationCenter({ notifications }: { notifications: AppNotification[] }) {
  const [dismissedThisLoad, setDismissedThisLoad] = useState<string[]>([]);

  // Side-effect thuần: nạp danh sách server vào nhật ký (cho chuông "gần đây"). `mergeIntoLog`
  // idempotent + tự bắn sự kiện → `useSyncExternalStore` bên dưới tự cập nhật.
  useEffect(() => {
    mergeIntoLog(notifications);
  }, [notifications]);

  const raw = useSyncExternalStore(subscribeLog, rawLogSnapshot, serverLogSnapshot);
  const logged = useMemo(() => parseLog(raw), [raw]);

  const queue = useMemo(() => {
    const seen = new Set<string>();
    const q: AppNotification[] = [];
    // repeat: từ danh sách server live, chỉ bỏ qua cái đã tắt trong lần tải trang này.
    for (const n of notifications) {
      if (n.repeat && !dismissedThisLoad.includes(n.id) && !seen.has(n.id)) {
        q.push(n);
        seen.add(n.id);
      }
    }
    // one-shot: từ nhật ký, chưa đọc, không phải repeat. Ưu tiên bản live nếu server còn gửi.
    const liveById = new Map(notifications.map((n) => [n.id, n]));
    for (const n of logged) {
      if (!n.repeat && n.readAt === null && !seen.has(n.id)) {
        q.push(liveById.get(n.id) ?? n);
        seen.add(n.id);
      }
    }
    return q;
  }, [notifications, logged, dismissedThisLoad]);

  if (queue.length === 0) return null;

  const current = queue[0];
  const remaining = queue.length - 1;
  const style = NOTIF_STYLE[current.kind];
  const advance = () => {
    if (current.repeat) setDismissedThisLoad((d) => [...d, current.id]);
    else markRead([current.id]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-[420px] overflow-hidden rounded-card border border-line bg-bg text-center shadow-lg"
      >
        <div className={`h-1.5 w-full ${style.bar}`} />
        <div className="p-6 pt-5">
          <div className={`mx-auto mb-3.5 flex h-[68px] w-[68px] items-center justify-center rounded-pill text-[36px] leading-none ${style.bubble}`}>
            {current.icon}
          </div>
          <p className="text-[15px] font-semibold leading-snug text-ink">{current.message}</p>

          <div className="mt-5 flex flex-col gap-2">
            {current.cta ? (
              <Link
                href={current.cta.href}
                onClick={advance}
                className={`inline-flex items-center justify-center gap-1.5 rounded-btn px-4 py-2.5 text-[13px] font-bold text-white ${style.btn}`}
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
              Đã xem
            </button>
          </div>

          {remaining > 0 ? (
            <div className="mt-3 text-[11px] text-ink-3">Còn {remaining} thông báo nữa</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
