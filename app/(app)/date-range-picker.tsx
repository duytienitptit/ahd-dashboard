"use client";

import { useState } from "react";

import { ALL_TIME_FROM, addDaysToDateString, nowVnDateString } from "@/lib/time";
import { formatShortDate } from "@/lib/format";
import { useFilterTransition } from "./filter-transition";
import { Spinner } from "./spinner";

const PRESETS = [
  { label: "7 ngày qua", days: 7 },
  { label: "14 ngày qua", days: 14 },
  { label: "30 ngày qua", days: 30 },
];

/** Reads/writes `?from=&to=` through `useFilterTransition` (see filter-transition.tsx for why a
 *  shared context, not a local `useTransition`, is what actually makes the loading feedback show).
 *  Shared by Tổng quan and Kênh — both must render this inside a `FilterTransitionProvider`. */
export function DateRangePicker({ from, to }: { from: string; to: string }) {
  const { isPending, setParams } = useFilterTransition();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  const today = nowVnDateString();
  const isAllTime = from === ALL_TIME_FROM && to === today;
  const matchedPreset = PRESETS.find((p) => from === addDaysToDateString(today, -(p.days - 1)) && to === today);

  function navigate(newFrom: string, newTo: string) {
    setOpen(false);
    setParams({ from: newFrom, to: newTo });
  }

  return (
    // shrink-0: khi ngồi cùng hàng flex với 1 nút "+ Tạo..." mở ra thành form rộng (Kênh, Nhân sự),
    // flexbox mặc định co hết các item lại thay vì để item này giữ nguyên độ rộng — chữ "7 ngày qua"
    // bị bóp xuống 3 dòng. Xem thêm flex-wrap ở hàng cha (channels/page.tsx, creators/page.tsx).
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={isPending}
        className="flex h-[38px] items-center gap-2 rounded-btn border border-line px-3.5 text-sm font-semibold disabled:opacity-60"
      >
        {isPending ? (
          <Spinner />
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M8 3v4M16 3v4M3 10h18" />
          </svg>
        )}
        {isAllTime ? "Toàn bộ thời gian" : matchedPreset ? matchedPreset.label : `${formatShortDate(from)} – ${formatShortDate(to)}`}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-2)" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <>
          <button type="button" aria-label="Đóng" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-64 rounded-card border border-line bg-bg p-3 shadow-lg">
            <div className="flex flex-col gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => navigate(addDaysToDateString(today, -(p.days - 1)), today)}
                  className={`rounded-input px-2.5 py-2 text-left text-[13px] font-medium hover:bg-surface ${
                    matchedPreset?.days === p.days ? "bg-line-soft font-bold" : ""
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => navigate(ALL_TIME_FROM, today)}
                className={`rounded-input px-2.5 py-2 text-left text-[13px] font-medium hover:bg-surface ${
                  isAllTime ? "bg-line-soft font-bold" : ""
                }`}
              >
                Toàn bộ thời gian
              </button>
            </div>

            <div className="mt-2 border-t border-line-soft pt-2.5">
              <div className="mb-2 text-[11.5px] font-bold text-ink-3">Tuỳ chỉnh</div>
              <div className="flex flex-col gap-2">
                <label className="block text-[12px]">
                  <span className="mb-1 block text-ink-3">Từ ngày</span>
                  <input
                    type="date"
                    value={customFrom}
                    max={customTo}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-[34px] w-full rounded-input border border-line px-2 text-[13px] outline-none focus:border-ink"
                  />
                </label>
                <label className="block text-[12px]">
                  <span className="mb-1 block text-ink-3">Đến ngày</span>
                  <input
                    type="date"
                    value={customTo}
                    min={customFrom}
                    max={today}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-[34px] w-full rounded-input border border-line px-2 text-[13px] outline-none focus:border-ink"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => navigate(customFrom, customTo)}
                  className="mt-1 h-[34px] rounded-btn bg-red text-[13px] font-bold text-white hover:opacity-90"
                >
                  Áp dụng
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
