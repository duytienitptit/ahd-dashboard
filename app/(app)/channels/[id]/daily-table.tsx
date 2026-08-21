"use client";

import { useState } from "react";

import type { DailyRow } from "@/lib/dashboard";
import { formatCompact, formatFullDate, formatSignedNumber } from "@/lib/format";

import { ExportCsvButton } from "../../export-csv-button";
import { SourcePriorityInfo } from "../../source-priority-info";

const SOURCE_LABEL: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  studio_import: { label: "đã đối chiếu", bg: "bg-green-bg", fg: "text-green-dark", dot: "bg-green" },
  display_api: { label: "tạm tính", bg: "bg-amber-bg", fg: "text-amber-dark", dot: "bg-amber" },
  manual_entry: { label: "chưa xác thực", bg: "bg-line-soft", fg: "text-ink-2", dot: "bg-ink-3" },
  business_api: { label: "đã đối chiếu", bg: "bg-green-bg", fg: "text-green-dark", dot: "bg-green" },
  vendor_scraping: { label: "tạm tính", bg: "bg-amber-bg", fg: "text-amber-dark", dot: "bg-amber" },
};

type DailyDisplayRow = DailyRow & { followersChange: number | null };

function withChange(rows: DailyRow[]): DailyDisplayRow[] {
  const out: DailyDisplayRow[] = [];
  let prevFollowers: number | null = null;
  for (const row of rows) {
    out.push({
      ...row,
      followersChange: row.followers !== null && prevFollowers !== null ? row.followers - prevFollowers : null,
    });
    if (row.followers !== null) prevFollowers = row.followers;
  }
  return out;
}

const DAILY_COLUMNS = "1.1fr 1fr 1fr 1fr 0.8fr 1.2fr";
const PAGE_SIZE = 10;

/** The only client component on the Chi tiết kênh page — "Xem thêm N bản ghi trước đó" needs local
 *  expand state; everything else on the page is server-rendered. Rows arrive ascending (oldest
 *  first, same order the rest of the page uses for chart bucketing) and are reversed here for
 *  display, newest first, matching design/ChannelDetail.dc.html. */
export function DailyTable({ rows, channelHandle }: { rows: DailyRow[]; channelHandle: string }) {
  const [expanded, setExpanded] = useState(false);
  const withDelta = withChange(rows).slice().reverse();
  const visible = expanded ? withDelta : withDelta.slice(0, PAGE_SIZE);
  const remaining = withDelta.length - visible.length;

  return (
    <div className="overflow-hidden rounded-card border border-line">
      <div className="flex items-center justify-between border-b border-line-soft px-5 py-4">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-bold">Số liệu đã lưu theo ngày</span>
            <SourcePriorityInfo />
          </div>
          <div className="mt-[3px] text-xs text-ink-3">Mỗi ngày một bản ghi, nguồn ưu tiên cao nhất hiện có</div>
        </div>
        {withDelta.length > 0 ? (
          <ExportCsvButton
            filename={`${channelHandle.replace(/^@/, "")}_${new Date().toISOString().slice(0, 10)}.csv`}
            headers={["Ngày", "Follower", "Thay đổi", "Lượt xem", "Video", "Nguồn", "Đầy đủ"]}
            rows={withDelta.map((row) => [
              row.date,
              row.followers ?? "",
              row.followersChange ?? "",
              row.videoViews ?? "",
              row.videoCount ?? "",
              row.source,
              row.isComplete ? "có" : "không",
            ])}
          />
        ) : null}
      </div>

      {withDelta.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-ink-3">Chưa có số liệu ngày nào cho kênh này.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div
                className="grid gap-3.5 bg-line-soft px-5 py-2.5 text-xs font-bold text-ink-2"
                style={{ gridTemplateColumns: DAILY_COLUMNS }}
              >
                <div>Ngày</div>
                <div className="text-right">Follower</div>
                <div className="text-right">Thay đổi</div>
                <div className="text-right">Lượt xem</div>
                <div className="text-right">Video</div>
                <div>Nguồn dữ liệu</div>
              </div>

              {visible.map((row) => {
                const source = SOURCE_LABEL[row.source] ?? SOURCE_LABEL.manual_entry;
                return (
                  <div
                    key={row.date}
                    className="grid items-center gap-3.5 border-t border-line-soft px-5 py-3"
                    style={{ gridTemplateColumns: DAILY_COLUMNS }}
                  >
                    <div className="text-[13px] font-semibold">{formatFullDate(row.date)}</div>
                    <div className="text-right text-[13px] font-semibold">
                      {row.followers !== null ? formatCompact(row.followers) : "—"}
                    </div>
                    <div
                      className={`text-right text-[12.5px] font-bold ${
                        row.followersChange === null
                          ? "text-ink-3"
                          : row.followersChange >= 0
                            ? "text-green-dark"
                            : "text-red-dark"
                      }`}
                    >
                      {row.followersChange !== null ? formatSignedNumber(row.followersChange) : "—"}
                    </div>
                    <div className="text-right text-[13px] font-semibold">
                      {row.videoViews !== null ? formatCompact(row.videoViews) : "—"}
                    </div>
                    <div className="text-right text-[13px] text-ink-2">{row.videoCount ?? "—"}</div>
                    <div>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-semibold ${source.bg} ${source.fg}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-pill ${source.dot}`} />
                        {source.label}
                        {!row.isComplete ? " · thiếu dữ liệu" : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {remaining > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex w-full items-center justify-center border-t border-line-soft py-3.5 text-[13px] font-semibold text-ink-2 hover:bg-surface"
            >
              Xem thêm {remaining} bản ghi trước đó
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
