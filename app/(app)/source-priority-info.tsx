"use client";

import { useState } from "react";

// Thứ tự ưu tiên thật đang dùng: Studio import > Display API > Nhập tay — đúng 3 nguồn hệ thống này
// thực sự ghi vào data_snapshot. (source_rank() trong DB xếp thêm business_api/vendor_scraping ở
// giữa cho tương lai — docs/DATABASE_ERD.md — nhưng chưa nguồn nào trong 2 cái đó được code ghi dữ
// liệu, nhắc tới ở đây chỉ gây rối cho Manager đang đọc.)
const ROWS: { label: string; bg: string; fg: string; dot: string; meaning: string }[] = [
  { label: "đã đối chiếu", bg: "bg-green-bg", fg: "text-green-dark", dot: "bg-green", meaning: "Từ Studio import — nguồn chính thức, dùng để chốt sổ" },
  { label: "tạm tính", bg: "bg-amber-bg", fg: "text-amber-dark", dot: "bg-amber", meaning: "Từ Display API tự động hằng ngày — có thể lệch tới khi Studio import về" },
  { label: "chưa xác thực", bg: "bg-line-soft", fg: "text-ink-2", dot: "bg-ink-3", meaning: "Manager nhập tay khi API lỗi — tự bị thay ngay khi có nguồn cao hơn cho đúng ngày đó" },
];

/** Explains docs/DATA_SOURCES.md's source-priority mechanism directly in the UI, not just in docs —
 *  a Manager looking at a "tạm tính"/"đã đối chiếu" badge should be able to find out what it means
 *  and why without leaving the page. Used on Tổng quan (DataFreshnessLine) and Chi tiết kênh
 *  (DailyTable) — anywhere a source-confidence badge is shown. */
export function SourcePriorityInfo() {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Giải thích cách chọn nguồn dữ liệu"
        className="flex h-4 w-4 items-center justify-center rounded-pill text-ink-3 hover:text-ink-2"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 8h.01" />
        </svg>
      </button>

      {open ? (
        <>
          <button type="button" aria-label="Đóng" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-6 z-20 w-72 rounded-card border border-line bg-bg p-3.5 text-left shadow-lg">
            <div className="mb-2 text-[12.5px] font-bold">Cùng 1 ngày có nhiều nguồn số liệu?</div>
            <p className="mb-3 text-[11.5px] leading-relaxed text-ink-3">
              Hệ thống luôn hiển thị đúng 1 nguồn — nguồn <b>đáng tin nhất</b> hiện có cho ngày đó, theo
              thứ tự ưu tiên cố định <b>Studio import → Display API → Nhập tay</b>, không phải nguồn
              mới nhất và không cộng gộp nhiều nguồn.
            </p>
            <div className="flex flex-col gap-2">
              {ROWS.map((r) => (
                <div key={r.label} className="flex items-start gap-2">
                  <span className={`mt-[3px] inline-flex items-center gap-1.5 rounded-pill px-2 py-[3px] text-[11px] font-semibold ${r.bg} ${r.fg}`}>
                    <span className={`h-1.5 w-1.5 rounded-pill ${r.dot}`} />
                    {r.label}
                  </span>
                  <span className="flex-1 text-[11px] leading-snug text-ink-3">{r.meaning}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </span>
  );
}
