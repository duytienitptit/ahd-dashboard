"use client";

import { useState } from "react";

import type { SourceCoverage } from "@/lib/dashboard";

// Badge độ phủ nguồn cho KỲ ĐANG CHỌN (05/09/2026, theo yêu cầu — phương án thay cho việc tách 2 tab
// Display API / Studio ở màn báo cáo). Vấn đề nó giải: `v_channel_daily` chọn Studio cho ngày này,
// Display API cho ngày kia, mà hai nguồn đo hai thứ khác nhau — Display cộng delta của những video nó
// lấy được, Studio báo tổng view thật cả kênh. Đo trên dữ liệu thật 29/08→03/09 (ngày is_complete=true,
// cron chạy đúng): Studio cao hơn Display ổn định 1,2–1,6×. Nên một con số tổng của kỳ trộn nguồn là
// tổng của hai đơn vị đo — Manager phải thấy tỷ lệ trước khi tin nó.
//
// Cố tình KHÔNG đo bằng "số kênh đã đối chiếu đủ kỳ": Studio trễ 2 ngày cố định nên ngày mới nhất luôn
// là display_api, chỉ số đó sẽ đứng ở 0/9 vĩnh viễn và không nói lên điều gì.

/** Ngưỡng xanh: dưới mức này thì kỳ vẫn còn phần đáng kể là số tạm tính, không nên đọc như số chốt. */
const RECONCILED_GREEN_PCT = 90;

export function SourceCoverageBadge({ coverage }: { coverage: SourceCoverage }) {
  const [open, setOpen] = useState(false);

  // Không có ô nào có dữ liệu thì không có gì để nói về nguồn — `DataFreshnessLine` đã lo trạng thái
  // "chưa có dữ liệu nào" rồi, thêm badge 0% ở đây chỉ là tiếng ồn.
  if (coverage.measuredCells === 0) return null;

  const pct = Math.round((coverage.reconciledCells / coverage.measuredCells) * 100);
  const tone =
    pct >= RECONCILED_GREEN_PCT
      ? { bg: "bg-green-bg", fg: "text-green-dark", dot: "bg-green" }
      : pct > 0
        ? { bg: "bg-amber-bg", fg: "text-amber-dark", dot: "bg-amber" }
        : { bg: "bg-line-soft", fg: "text-ink-2", dot: "bg-ink-3" };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Chi tiết nguồn số liệu của kỳ này"
        className={`inline-flex items-center gap-[5px] rounded-pill px-[9px] py-[2px] text-[11.5px] font-semibold ${tone.bg} ${tone.fg}`}
      >
        <span className={`h-[5px] w-[5px] rounded-pill ${tone.dot}`} />
        {pct}% kỳ này đã đối chiếu
      </button>

      {open ? (
        <>
          <button type="button" aria-label="Đóng" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-6 z-20 w-[22rem] rounded-card border border-line bg-bg p-3.5 text-left shadow-lg">
            <div className="mb-2 text-[12.5px] font-bold">Nguồn số liệu của kỳ đang xem</div>
            <p className="mb-3 text-[11.5px] leading-relaxed text-ink-3">
              <b>
                {coverage.reconciledCells}/{coverage.measuredCells} ngày
              </b>{" "}
              trong kỳ lấy từ Studio import (số đã đối chiếu, dùng để chốt sổ); phần còn lại là số{" "}
              <b>tạm tính</b> từ Display API. Hai nguồn đo khác nhau — Display API chỉ cộng lượt xem
              của những video nó lấy được, nên thường <b>thấp hơn Studio</b>. Kỳ càng nhiều ngày tạm
              tính thì tổng càng nên đọc như ước lượng.
            </p>

            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="text-ink-3">
                    <th className="pb-1 text-left font-semibold">Kênh</th>
                    <th className="pb-1 text-right font-semibold">Đối chiếu</th>
                    <th className="pb-1 text-right font-semibold">Tạm tính</th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.perChannel.map((c) => {
                    const cells = c.reconciledDays + c.estimatedDays + c.otherDays;
                    return (
                      <tr key={c.channelId} className="border-t border-line-soft">
                        <td className="py-1 pr-2">
                          {c.channelName}
                          {cells === 0 ? <span className="text-ink-3"> — chưa có dữ liệu</span> : null}
                        </td>
                        <td
                          className={`py-1 text-right tabular-nums ${
                            c.reconciledDays === 0 && cells > 0 ? "font-semibold text-amber-dark" : ""
                          }`}
                        >
                          {c.reconciledDays}
                        </td>
                        <td className="py-1 text-right tabular-nums text-ink-3">
                          {c.estimatedDays + c.otherDays}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {coverage.unreconciledChannels > 0 ? (
              <p className="mt-3 border-t border-line-soft pt-2.5 text-[11px] leading-snug text-amber-dark">
                <b>
                  {coverage.unreconciledChannels}/{coverage.totalChannels} kênh
                </b>{" "}
                chưa có ngày nào đối chiếu trong kỳ này — chưa chốt sổ KPI được. Cần người phụ trách
                export file Studio và import cho các kênh đó.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </span>
  );
}
