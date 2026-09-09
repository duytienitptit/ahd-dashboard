"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { AppNotification } from "@/lib/notifications";

const STORAGE_KEY = "ahd:dismissed-notifications";

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function persistDismissed(ids: string[]) {
  try {
    // Chỉ giữ 50 id gần nhất — không để localStorage phình vô hạn qua nhiều đời top-1.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-50)));
  } catch {
    // localStorage bị chặn (chế độ riêng tư…) — thông báo sẽ hiện lại lần sau, chấp nhận được.
  }
}

/**
 * Hiện thông báo (`lib/notifications.ts`) — mỗi lần một cái, góc dưới phải, tắt được. "Đã tắt" nhớ
 * trong `localStorage` theo `id`, nên "vào lần đầu thì show, tắt rồi thì thôi" (08/09/2026, theo yêu
 * cầu). Cơ chế tối giản — thêm loại thông báo mới chỉ cần thêm vào `buildNotifications`.
 */
export function NotificationHost({ notifications }: { notifications: AppNotification[] }) {
  // `null` = chưa đọc localStorage (server render + first paint) → chưa hiện gì, tránh nháy.
  const [dismissed, setDismissed] = useState<string[] | null>(null);

  useEffect(() => {
    // localStorage chỉ đọc được ở client, sau khi mount — đồng bộ 1 lần từ đó vào state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(readDismissed());
  }, []);

  if (dismissed === null) return null;

  const current = notifications.find((n) => !dismissed.includes(n.id));
  if (!current) return null;

  const dismiss = () => {
    const next = [...dismissed, current.id];
    setDismissed(next);
    persistDismissed(next);
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(360px,calc(100vw-2rem))]">
      <div className="flex gap-3 rounded-card border border-line bg-bg p-3.5 shadow-lg">
        <div className="text-[26px] leading-none">{current.icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-snug text-ink">{current.message}</p>
          {current.cta ? (
            <Link
              href={current.cta.href}
              onClick={dismiss}
              className="mt-2 inline-flex items-center gap-1 rounded-btn bg-red px-3 py-1.5 text-[12px] font-bold text-white hover:opacity-90"
            >
              {current.cta.label}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          ) : null}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Đóng thông báo"
          className="-mr-1 -mt-1 h-6 w-6 shrink-0 rounded-btn text-ink-3 hover:bg-line-soft hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="mx-auto" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
