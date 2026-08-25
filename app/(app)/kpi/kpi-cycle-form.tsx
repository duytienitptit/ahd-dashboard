"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { avatarPalette, formatFullDate, formatNumber, initialsFromStart } from "@/lib/format";
import type { KpiCycleWithProgress } from "@/lib/kpi";
import { addDaysToDateString } from "@/lib/time";

import { createKpiCycleAction, updateKpiCycleAction, type KpiFormState } from "./actions";
import { KpiHealthBadge } from "./kpi-widgets";

const initialState: KpiFormState = { error: null };

type ChannelInfo = {
  id: string;
  name: string;
  tiktokHandle: string;
  currentCreator: { id: string; name: string } | null;
};

/** Monday of `dateStr`'s ISO week — same calendar-date math as lib/dashboard.ts's `isoWeekStart`,
 *  kept local rather than imported so this client component doesn't pull that much larger,
 *  Supabase-oriented module into the browser bundle for one small pure helper. */
function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum);
  return date.toISOString().slice(0, 10);
}

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-input bg-red-bg px-3 py-2 text-[12.5px] font-medium text-red-dark">
      {error}
    </div>
  );
}

function ChevronDown() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

const TARGET_FIELDS = [
  { key: "targetViews", label: "Lượt xem", hint: "View mới cần đạt trong chu kỳ", unit: "view", bg: "bg-blue-bg", fg: "text-blue" },
  { key: "targetVideos", label: "Video", hint: "Số video cần xuất bản", unit: "video", bg: "bg-orange-bg", fg: "text-orange" },
  { key: "targetFollowers", label: "Follower", hint: "Mốc follower cần chạm tới", unit: "follower", bg: "bg-purple-bg", fg: "text-purple" },
] as const;

/**
 * Create/edit, one component (docs/PRODUCT_SPEC.md, `design/KpiForm.dc.html`) — one channel, one
 * cycle, 3 targets, exactly like the mockup, not a batch table (25/08/2026, theo yêu cầu). The
 * channel is always fixed by the time this renders — `/kpi/new`'s page resolves `?channelId=` (via
 * its own picker step) before rendering this, so there is no in-form channel dropdown, matching the
 * mockup's static (non-interactive-looking) channel box.
 */
export function KpiCycleForm({
  mode,
  channel,
  followersAtStart,
  cycle,
  recentCycles,
}: {
  mode: "create" | "edit";
  channel: ChannelInfo;
  /** `null` in create mode blocks the whole form — a cycle can never be created without this
   *  (lib/kpi.ts: `followers_at_start` is `NOT NULL`, captured once, never editable). Always a real
   *  number in edit mode (the cycle already exists, so it was captured successfully back then). */
  followersAtStart: number | null;
  cycle?: KpiCycleWithProgress;
  /** Up to 3 of the channel's other cycles, most recent first — "Chu kỳ gần nhất của kênh". Already
   *  excludes `cycle` itself in edit mode (filtered by the page before this renders). */
  recentCycles: KpiCycleWithProgress[];
}) {
  const boundAction =
    mode === "create" ? createKpiCycleAction : updateKpiCycleAction.bind(null, cycle!.id, channel.id);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  const [periodType, setPeriodType] = useState<"weekly" | "custom">(cycle?.periodType ?? "weekly");
  const [periodStart, setPeriodStart] = useState(cycle?.periodStart ?? "");
  const [periodEnd, setPeriodEnd] = useState(cycle?.periodEnd ?? "");
  const [targetFollowersInput, setTargetFollowersInput] = useState(
    cycle?.targetFollowers !== undefined && cycle?.targetFollowers !== null ? String(cycle.targetFollowers) : "",
  );

  const blocked = mode === "create" && followersAtStart === null;
  const locked = mode === "edit" && cycle?.status === "final";

  function onFromChange(value: string) {
    if (periodType === "weekly" && value) {
      const monday = mondayOf(value);
      setPeriodStart(monday);
      setPeriodEnd(addDaysToDateString(monday, 6));
    } else {
      setPeriodStart(value);
    }
  }

  function onPeriodTypeChange(next: "weekly" | "custom") {
    setPeriodType(next);
    if (next === "weekly" && periodStart) {
      const monday = mondayOf(periodStart);
      setPeriodStart(monday);
      setPeriodEnd(addDaysToDateString(monday, 6));
    }
  }

  const targetFollowersNum = targetFollowersInput.trim() === "" ? null : Number(targetFollowersInput);
  const exampleMid =
    followersAtStart !== null && targetFollowersNum !== null && targetFollowersNum !== followersAtStart
      ? Math.round(followersAtStart + (targetFollowersNum - followersAtStart) * 0.6)
      : null;
  const examplePct =
    exampleMid !== null && followersAtStart !== null && targetFollowersNum !== null
      ? Math.round(((exampleMid - followersAtStart) / (targetFollowersNum - followersAtStart)) * 100)
      : null;

  if (locked) {
    return (
      <div className="rounded-card border border-line px-6 py-10 text-center">
        <p className="text-[14px] font-semibold text-ink">Chu kỳ KPI này đã chốt sổ.</p>
        <p className="mt-1.5 text-[13px] text-ink-3">Số liệu đã khoá — không thể sửa (CLAUDE.md).</p>
        <Link href="/kpi" className="mt-4 inline-block text-[13px] font-semibold text-red hover:opacity-80">
          ← Quay lại danh sách KPI
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <form action={formAction} className="rounded-card border border-line">
        <input type="hidden" name="channelId" value={channel.id} />
        <input type="hidden" name="periodType" value={periodType} />
        <input type="hidden" name="periodStart" value={periodStart} />
        <input type="hidden" name="periodEnd" value={periodEnd} />

        <div className="border-b border-line-soft px-6 py-[18px]">
          <div className="text-xl font-extrabold tracking-[-0.5px]">
            {mode === "create" ? "Đặt chỉ tiêu cho kênh" : "Sửa chu kỳ KPI"}
          </div>
          <div className="mt-1 text-[13px] text-ink-3">Chọn chu kỳ và ba chỉ tiêu cần đạt — cần ít nhất một.</div>
        </div>

        <div className="flex flex-col gap-[26px] px-6 py-6">
          <div>
            <div className="mb-[9px] text-[13.5px] font-bold">Kênh</div>
            <div className="flex h-[52px] items-center justify-between rounded-input border border-ink px-4">
              <div className="flex items-center gap-[11px]">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-pill text-[11.5px] font-extrabold"
                  style={{ background: avatarPalette(0).bg, color: avatarPalette(0).fg }}
                >
                  {initialsFromStart(channel.name)}
                </span>
                <div>
                  <div className="text-sm font-semibold">{channel.name}</div>
                  <div className="text-[11.5px] text-ink-3">
                    {channel.tiktokHandle}
                    {channel.currentCreator ? ` · ${channel.currentCreator.name} phụ trách` : " · Chưa gán nhân sự"}
                  </div>
                </div>
              </div>
              {mode === "create" ? (
                <Link href="/kpi/new" className="text-ink-2 hover:text-ink" title="Đổi kênh khác">
                  <ChevronDown />
                </Link>
              ) : null}
            </div>
          </div>

          {blocked ? (
            <div className="rounded-input border border-amber bg-amber-bg px-4 py-3.5 text-[13px] text-amber-dark">
              <p className="font-bold">Kênh này chưa có số follower nào được ghi nhận.</p>
              <p className="mt-1.5 leading-relaxed">
                Follower đầu kỳ bắt buộc phải có để tính % tiến độ, và không thể sửa sau khi tạo — chưa thể tạo chu
                kỳ KPI cho kênh này. Nhập tay 1 ngày dữ liệu, hoặc chờ đồng bộ Display API rồi quay lại.
              </p>
              <Link
                href="/import/manual-entry"
                className="mt-2.5 inline-block text-[12.5px] font-bold text-amber-dark underline underline-offset-2"
              >
                Sang màn Nhập tay →
              </Link>
            </div>
          ) : (
            <>
              <div>
                <div className="mb-[9px] text-[13.5px] font-bold">Chu kỳ</div>
                <div className="mb-3 flex gap-0 rounded-input bg-line-soft p-1">
                  {(["weekly", "custom"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onPeriodTypeChange(value)}
                      className={`flex-grow rounded-[4px] py-[9px] text-center text-[13.5px] ${
                        periodType === value ? "bg-bg font-bold shadow-sm" : "font-medium text-ink-2"
                      }`}
                    >
                      {value === "weekly" ? "Theo tuần" : "Tuỳ chọn ngày"}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs text-ink-3">Từ ngày</span>
                    <div className="flex h-11 items-center gap-2 rounded-input border border-line bg-surface px-3.5">
                      <CalendarIcon />
                      <input
                        type="date"
                        required
                        value={periodStart}
                        onChange={(e) => onFromChange(e.target.value)}
                        className="w-full bg-transparent text-sm font-medium outline-none"
                      />
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs text-ink-3">Đến ngày</span>
                    <div className="flex h-11 items-center gap-2 rounded-input border border-line bg-surface px-3.5">
                      <CalendarIcon />
                      <input
                        type="date"
                        required
                        readOnly={periodType === "weekly"}
                        value={periodEnd}
                        onChange={(e) => setPeriodEnd(e.target.value)}
                        min={periodStart || undefined}
                        className="w-full bg-transparent text-sm font-medium outline-none disabled:text-ink-3"
                      />
                    </div>
                  </label>
                </div>
                {periodType === "weekly" ? (
                  <p className="mt-1.5 text-[11.5px] text-ink-3">Chọn 1 ngày — tự lấy trọn tuần đó (Thứ Hai → Chủ Nhật).</p>
                ) : null}
              </div>

              <div>
                <div className="mb-1 text-[13.5px] font-bold">Chỉ tiêu</div>
                <p className="mb-3 text-xs text-ink-3">
                  Follower nhập theo <strong className="text-ink">mốc tuyệt đối</strong> — số cần chạm tới, không phải
                  số tăng thêm. Cần ít nhất một chỉ tiêu.
                </p>
                <div className="flex flex-col gap-3">
                  {TARGET_FIELDS.map((field) => (
                    <div key={field.key} className="flex items-center gap-3.5">
                      <span className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-card ${field.bg} ${field.fg}`}>
                        <span className="h-[15px] w-[15px] rounded-[4px] bg-current opacity-70" />
                      </span>
                      <div className="flex-grow">
                        <div className="text-[13.5px] font-semibold">{field.label}</div>
                        <div className="text-[11.5px] text-ink-3">{field.hint}</div>
                      </div>
                      <div className="flex h-[46px] w-[190px] shrink-0 items-center gap-2 rounded-input border border-line px-3.5">
                        {field.key === "targetFollowers" ? (
                          <input
                            type="number"
                            min={0}
                            step={1}
                            name={field.key}
                            value={targetFollowersInput}
                            onChange={(e) => setTargetFollowersInput(e.target.value)}
                            placeholder="—"
                            className="w-full bg-transparent text-[16px] font-bold tracking-[-0.3px] outline-none"
                          />
                        ) : (
                          <input
                            type="number"
                            min={0}
                            step={1}
                            name={field.key}
                            defaultValue={cycle?.[field.key] ?? ""}
                            placeholder="—"
                            className="w-full bg-transparent text-[16px] font-bold tracking-[-0.3px] outline-none"
                          />
                        )}
                        <span className="ml-auto shrink-0 text-[12px] text-ink-3">{field.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <ErrorBox error={state.error} />
        </div>

        <div className="flex justify-end gap-2.5 border-t border-line-soft bg-surface px-6 py-[18px]">
          <Link
            href="/kpi"
            className="flex h-10 items-center rounded-btn border border-line bg-bg px-5 text-sm font-semibold hover:bg-surface"
          >
            Huỷ
          </Link>
          <button
            type="submit"
            disabled={pending || blocked}
            className="flex h-10 items-center rounded-btn bg-red px-6 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Đang lưu…" : mode === "create" ? "Tạo chu kỳ KPI" : "Lưu thay đổi"}
          </button>
        </div>
      </form>

      <div className="flex flex-col gap-3.5">
        <div className="rounded-card border border-cyan bg-cyan-bg px-5 py-[18px]">
          <div className="mb-3 flex items-center gap-2 text-[13.5px] font-bold text-cyan-ink">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            Follower đầu kỳ
          </div>
          {followersAtStart !== null ? (
            <>
              <div className="mb-2.5 flex items-baseline gap-2">
                <div className="text-[30px] font-extrabold tracking-[-1px] text-cyan-ink">{formatNumber(followersAtStart)}</div>
                <div className="text-[12.5px] text-cyan-ink-2">
                  {mode === "edit" && cycle ? `chụp lúc tạo chu kỳ (${formatFullDate(cycle.createdAt.slice(0, 10))})` : "số hiện tại"}
                </div>
              </div>
              <div className="text-[12.5px] leading-relaxed text-cyan-ink">
                Hệ thống tự lấy số follower {mode === "create" ? "tại thời điểm tạo chu kỳ" : "lúc tạo chu kỳ"} và{" "}
                <strong>khoá lại</strong>. Đây là mốc gốc để tính % tiến độ — không sửa được sau khi tạo.
              </div>
            </>
          ) : (
            <div className="text-[12.5px] text-cyan-ink">Chưa có số nào để chụp.</div>
          )}
        </div>

        <div className="rounded-card border border-line px-5 py-[18px]">
          <div className="mb-3 text-[13.5px] font-bold">Cách tính % follower</div>
          <div className="mb-3 rounded-input bg-line-soft p-3.5 text-center text-[12.5px] leading-[1.7] text-ink-2">
            (hiện tại − đầu kỳ)
            <br />
            <span className="my-0.5 inline-block w-[150px] border-t border-line" />
            <br />
            (mục tiêu − đầu kỳ)
          </div>
          {examplePct !== null && followersAtStart !== null && targetFollowersNum !== null ? (
            <div className="text-[12.5px] leading-relaxed text-ink-2">
              Ví dụ: đầu kỳ <strong className="text-ink">{formatNumber(followersAtStart)}</strong>, mục tiêu{" "}
              <strong className="text-ink">{formatNumber(targetFollowersNum)}</strong>. Khi đạt{" "}
              <strong className="text-ink">{formatNumber(exampleMid!)}</strong> → tiến độ{" "}
              <strong className="text-cyan-ink-2">{examplePct}%</strong>.
            </div>
          ) : (
            <div className="text-[12.5px] leading-relaxed text-ink-2">Nhập chỉ tiêu Follower để xem ví dụ minh hoạ.</div>
          )}
        </div>

        {recentCycles.length > 0 ? (
          <div className="rounded-card border border-line px-5 py-[18px]">
            <div className="mb-2.5 text-[13.5px] font-bold">Chu kỳ gần nhất của kênh</div>
            <div className="flex flex-col gap-2.5">
              {recentCycles.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[13px] font-semibold">
                      {formatFullDate(c.periodStart)} – {formatFullDate(c.periodEnd)}
                    </div>
                    <div className="text-[11.5px] text-ink-3">{c.status === "final" ? "Đã chốt sổ" : "Đang chạy / nháp"}</div>
                  </div>
                  <KpiHealthBadge health={c.health} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
