"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import type { ChannelSummary } from "@/lib/channels";
import type { ChannelPeriodStat } from "@/lib/dashboard";
import { avatarPalette, formatCompact, formatDeltaPct, formatSignedNumber, initialsFromStart } from "@/lib/format";
import type { KpiCycleWithProgress } from "@/lib/kpi";
import { METRIC_TEXT_CLASS, METRIC_TONE } from "@/lib/metric-tone";

import { ConfirmDeleteForm } from "../confirm-delete-form";
import { KpiProgressPill } from "../kpi/kpi-widgets";
import { createChannelAction, deleteChannelAction, updateChannelAction, updateChannelNameAction, type ChannelFormState } from "./actions";

const initialState: ChannelFormState = { error: null };

type CreatorOption = { id: string; name: string };

/** Inline sparkline — view count of the channel's 5 most-recently-posted videos, oldest→newest
 *  (24/08/2026, theo yêu cầu; trước đây là view theo ngày trong kỳ — xem
 *  lib/dashboard.ts `fetchRecentVideoViewsByChannel`), matching design/Channels.dc.html's hand-built
 *  `spark()` for the line-drawing math itself. Flat/empty input renders a flat mid-line rather than
 *  an error. */
function Sparkline({ points, good }: { points: { views: number }[]; good: boolean }) {
  const W = 68;
  const H = 20;
  const PAD = 3;
  const values = points.map((p) => p.views);
  const lo = Math.min(...values);
  const hi = Math.max(...values);

  const coords = points.map((p, i) => {
    const x = Math.round(PAD + (i * (W - PAD * 2)) / Math.max(1, points.length - 1)) + 2;
    const y = Math.round(PAD + (1 - (p.views - lo) / (hi - lo || 1)) * H);
    return { x, y };
  });
  const color = good ? "var(--color-cyan)" : "var(--color-red)";
  const last = coords[coords.length - 1];

  return (
    <svg width="72" height="26" viewBox="0 0 72 26" className="block" role="img" aria-label="Xu hướng 5 video gần nhất">
      <polyline
        points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {last ? <circle cx={last.x} cy={last.y} r={2.4} fill={color} /> : null}
    </svg>
  );
}

function CreatorSelect({ creators, defaultValue }: { creators: CreatorOption[]; defaultValue?: string }) {
  return (
    <select
      name="creatorId"
      defaultValue={defaultValue ?? ""}
      className="h-[40px] w-full rounded-input border border-line bg-bg px-3 text-sm outline-none focus:border-ink"
    >
      <option value="">— Chưa gán —</option>
      {creators.map((creator) => (
        <option key={creator.id} value={creator.id}>
          {creator.name}
        </option>
      ))}
    </select>
  );
}

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-input bg-red-bg px-3 py-2 text-[12.5px] font-medium text-red-dark">
      {error}
    </div>
  );
}

export function CreateChannelForm({ creators }: { creators: CreatorOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createChannelAction, initialState);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state.error]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-[38px] items-center rounded-btn bg-red px-[18px] text-sm font-bold text-white hover:opacity-90"
      >
        + Thêm kênh
      </button>
    );
  }

  return (
    <form action={formAction} className="mb-4 rounded-card border border-line p-4">
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-bold">Tên kênh</span>
          <input
            name="name"
            required
            placeholder="Tên hiển thị"
            className="h-[40px] w-full rounded-input border border-line px-3 text-sm outline-none focus:border-ink"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-bold">Handle TikTok</span>
          <input
            name="tiktokHandle"
            required
            placeholder="@ten_kenh"
            className="h-[40px] w-full rounded-input border border-line px-3 text-sm outline-none focus:border-ink"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-bold">Creator phụ trách</span>
          <CreatorSelect creators={creators} />
        </label>
      </div>

      <ErrorBox error={state.error} />

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-[38px] rounded-btn bg-red px-4 text-[13.5px] font-bold text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Đang lưu…" : "Lưu kênh"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-[38px] rounded-btn border border-line px-4 text-[13.5px] font-semibold hover:bg-surface"
        >
          Huỷ
        </button>
      </div>
    </form>
  );
}

/** Real CSS grid-template-columns (not a Tailwind class) so the header in page.tsx, this row, and
 *  loading.tsx's skeleton all reference the exact same layout — one source of truth per
 *  docs/DESIGN_SYSTEM.md "khối skeleton phải khớp kích thước thật". */
export const CHANNEL_TABLE_COLUMNS = "2fr 0.95fr 1.05fr 0.6fr 0.85fr 0.8fr 1.1fr 96px";

export function ChannelRow({
  channel,
  stat,
  creators,
  isManager,
  currentUserId,
  index,
  kpi,
}: {
  channel: ChannelSummary;
  stat: ChannelPeriodStat | undefined;
  creators: CreatorOption[];
  isManager: boolean;
  /** Lets a Creator rename the channel they're currently assigned to (CLAUDE.md vấn đề #11) —
   *  `undefined` when the caller doesn't need this (e.g. no signed-in-user context available). */
  currentUserId?: string;
  /** Row position in the visible list — picks the avatar colour from `avatarPalette()` (24/08/2026,
   *  theo yêu cầu, lan từ Tổng quan sang /channels, xem docs/DESIGN_SYSTEM.md "Avatar kênh nhiều
   *  màu"). Defaults to 0 (cyan) so callers that don't track position still render fine. */
  index?: number;
  /** This channel's currently-active KPI cycle (M5) — `undefined` when none exists, which keeps the
   *  original "Chưa đặt KPI" chip. CLAUDE.md: đừng lấy % KPI làm trục sắp xếp mặc định — this column
   *  stays purely informational, `/channels`' default sort/filter is unaffected by it. */
  kpi?: KpiCycleWithProgress;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const canEditName = isManager || (currentUserId !== undefined && channel.currentCreator?.id === currentUserId);

  const boundAction = updateChannelAction.bind(null, channel.id);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const wasPending = useRef(false);

  const boundNameAction = updateChannelNameAction.bind(null, channel.id);
  const [nameState, nameFormAction, namePending] = useActionState(boundNameAction, initialState);
  const wasNamePending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) setEditing(false);
    wasPending.current = pending;
  }, [pending, state.error]);

  useEffect(() => {
    if (wasNamePending.current && !namePending && !nameState.error) setEditing(false);
    wasNamePending.current = namePending;
  }, [namePending, nameState.error]);

  if (editing && !isManager) {
    // Creator's own channel — name only. Handle TikTok, Creator phụ trách, Đang hoạt động are all
    // Manager-only (handle especially: it's the OAuth wrong-account guard's anchor).
    return (
      <form action={nameFormAction} className="border-t border-line-soft px-5 py-4">
        <div className="flex items-end gap-3">
          <label className="block flex-grow">
            <span className="mb-1.5 block text-[12.5px] font-bold">Tên kênh</span>
            <input
              name="name"
              required
              defaultValue={channel.name}
              className="h-[40px] w-full rounded-input border border-line px-3 text-sm outline-none focus:border-ink"
            />
          </label>
          <button
            type="submit"
            disabled={namePending}
            className="h-[38px] rounded-btn bg-red px-4 text-[13.5px] font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            {namePending ? "Đang lưu…" : "Lưu"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="h-[38px] rounded-btn border border-line px-4 text-[13.5px] font-semibold hover:bg-surface"
          >
            Huỷ
          </button>
        </div>
        <div className="mt-2">
          <ErrorBox error={nameState.error} />
        </div>
      </form>
    );
  }

  if (deleting) {
    return (
      <div className="border-t border-line-soft px-5 py-4">
        <ConfirmDeleteForm
          action={deleteChannelAction.bind(null, channel.id)}
          entityName={channel.name}
          fieldLabel="tên kênh"
          warning={`Xoá vĩnh viễn kênh "${channel.name}" — mất toàn bộ số liệu đã lưu theo ngày, video, và lịch sử phụ trách của kênh này. Không thể hoàn tác.`}
          onCancel={() => setDeleting(false)}
        />
      </div>
    );
  }

  if (editing) {
    return (
      <form action={formAction} className="border-t border-line-soft px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-bold">Tên kênh</span>
            <input
              name="name"
              required
              defaultValue={channel.name}
              className="h-[40px] w-full rounded-input border border-line px-3 text-sm outline-none focus:border-ink"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-bold">Handle TikTok</span>
            <input
              name="tiktokHandle"
              required
              defaultValue={channel.tiktokHandle}
              className="h-[40px] w-full rounded-input border border-line px-3 text-sm outline-none focus:border-ink"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-bold">Creator phụ trách</span>
            <CreatorSelect creators={creators} defaultValue={channel.currentCreator?.id} />
          </label>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={pending}
              className="h-[38px] rounded-btn bg-red px-4 text-[13.5px] font-bold text-white hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Đang lưu…" : "Lưu"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="h-[38px] rounded-btn border border-line px-4 text-[13.5px] font-semibold hover:bg-surface"
            >
              Huỷ
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <ErrorBox error={state.error} />
          <button
            type="button"
            onClick={() => setDeleting(true)}
            className="ml-auto text-[12px] font-semibold text-red-dark underline underline-offset-2 hover:opacity-80"
          >
            Xoá kênh
          </button>
        </div>
      </form>
    );
  }

  const sparkPoints = stat?.spark ?? [];
  const hasSpark = sparkPoints.length >= 2;
  // "Good" (cyan) vs "bad" (red) now compares the newest of the 5 videos against the oldest —
  // there's no period-over-period `viewsDeltaPct` to borrow anymore now that this line is per-video,
  // not per-day (24/08/2026, theo yêu cầu).
  const sparkGood = hasSpark ? sparkPoints[sparkPoints.length - 1].views >= sparkPoints[0].views : true;
  const avatar = avatarPalette(index ?? 0);

  return (
    <div
      className="grid items-center gap-3 border-t border-line-soft px-5 py-3.5"
      style={{ gridTemplateColumns: CHANNEL_TABLE_COLUMNS }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-pill text-xs font-extrabold"
          style={{ background: avatar.bg, color: avatar.fg }}
        >
          {initialsFromStart(channel.name)}
        </div>
        <div className="min-w-0">
          <Link href={`/channels/${channel.id}`} className="block truncate text-sm font-bold tracking-[-0.2px] hover:underline">
            {channel.name}
          </Link>
          <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
            <span className="truncate">{channel.tiktokHandle}</span>
            <span className="shrink-0">· {channel.currentCreator ? channel.currentCreator.name : "chưa gán"}</span>
          </div>
        </div>
      </div>

      <div className="text-right">
        <div className={`text-sm font-bold ${METRIC_TEXT_CLASS[METRIC_TONE.followers]}`}>
          {stat?.followersNow !== null && stat?.followersNow !== undefined ? formatCompact(stat.followersNow) : "—"}
        </div>
        {stat?.followersGain !== null && stat?.followersGain !== undefined ? (
          <div className="mt-0.5 text-[11.5px] font-semibold text-green-dark">{formatSignedNumber(stat.followersGain)}</div>
        ) : null}
      </div>

      <div className="text-right">
        <div className={`text-sm font-bold ${METRIC_TEXT_CLASS[METRIC_TONE.views]}`}>
          {stat?.views !== null && stat?.views !== undefined ? formatCompact(stat.views) : "—"}
        </div>
        {/* Three distinct states, and the bare "—" used to swallow the worst of them:
            no number at all → say so; a number that can't be compared → the existing note; a real %. */}
        {stat?.views === null || stat?.views === undefined ? (
          <div
            className="mt-0.5 text-[11px] font-medium leading-tight text-ink-3"
            title="Không ngày nào trong kỳ có số liệu lượt xem đầy đủ — kênh chưa đồng bộ, hoặc dữ liệu lấy về bị cắt (is_complete = false) nên không được dùng để tính."
          >
            chưa có số liệu kỳ này
          </div>
        ) : stat.viewsDeltaPct !== null ? (
          <div className={`mt-0.5 text-[11.5px] font-semibold ${stat.viewsDeltaPct < 0 ? "text-red-dark" : "text-green-dark"}`}>
            {formatDeltaPct(stat.viewsDeltaPct)}
          </div>
        ) : stat.viewsDeltaInsufficientData ? (
          <div
            className="mt-0.5 text-[11px] font-medium leading-tight text-ink-3"
            title="Kỳ đang chọn chưa có đủ ngày số liệu để so với kỳ trước — số này sẽ hiện lại khi dữ liệu về đủ."
          >
            chưa đủ dữ liệu kỳ này
          </div>
        ) : null}
      </div>

      <div className={`text-right text-sm font-bold ${METRIC_TEXT_CLASS[METRIC_TONE.videos]}`}>{stat?.videos ?? "—"}</div>

      <div className={`text-right text-sm font-bold ${METRIC_TEXT_CLASS[METRIC_TONE.views]}`}>
        {stat?.viewsPerVideo !== null && stat?.viewsPerVideo !== undefined ? formatCompact(stat.viewsPerVideo) : "—"}
      </div>

      <div className="flex justify-center">
        {hasSpark ? (
          <Sparkline points={sparkPoints} good={sparkGood} />
        ) : (
          <span className="text-xs text-ink-3">—</span>
        )}
      </div>

      <div>
        {kpi ? (
          <Link href={`/channels/${channel.id}`}>
            <KpiProgressPill health={kpi.health} />
          </Link>
        ) : (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-pill bg-line-soft px-2.5 py-1 text-[11.5px] font-semibold text-ink-3">
            Chưa đặt KPI
          </span>
        )}
      </div>

      <div className="flex flex-col items-end gap-1.5">
        {/* Link RA NGOÀI hệ thống (tiktok.com) → mở tab mới, `<a>` thường + rel noopener
            (CLAUDE.md quy ước link). Có nhãn chữ thay cho icon ↗ trần để người dùng biết nó dẫn đi đâu. */}
        <a
          href={`https://www.tiktok.com/${channel.tiktokHandle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-pill border border-line-soft px-2 py-0.5 text-[10.5px] font-semibold text-ink-3 hover:border-line hover:text-ink"
        >
          TikTok
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 17 17 7M8 7h9v9" />
          </svg>
        </a>
        {canEditName ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[12.5px] font-semibold text-red hover:opacity-80"
          >
            Sửa
          </button>
        ) : null}
      </div>
    </div>
  );
}
