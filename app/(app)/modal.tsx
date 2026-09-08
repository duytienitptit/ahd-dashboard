"use client";

import { useEffect, useRef } from "react";

/**
 * Hộp thoại giữa màn hình + lớp phủ mờ. Dùng khi nội dung sửa/thao tác quá cao để nhét inline mà
 * không tràn bố cục (vd. `CreatorEditForm` trong một cột kanban hẹp — 08/09/2026, theo yêu cầu).
 *
 * Đóng khi: bấm nút X, bấm ra ngoài panel, hoặc Esc. Khoá cuộn `body` khi mở. Không dùng portal —
 * `position: fixed` + `z-50` là đủ trong app này (các popover khác dùng `z-10`).
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      {/* Lớp bắt click ra ngoài — phủ hết, panel nằm trên nhờ đứng sau trong DOM + z ngầm. */}
      <button type="button" aria-label="Đóng" className="fixed inset-0 cursor-default" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative z-10 my-auto w-full max-w-lg rounded-card border border-line bg-bg shadow-lg outline-none"
      >
        <div className="flex items-center justify-between border-b border-line-soft px-5 py-3.5">
          <div className="text-[15px] font-bold">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-btn p-1 text-ink-3 hover:bg-line-soft hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
