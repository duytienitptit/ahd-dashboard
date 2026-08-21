"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import type { ChannelSummary } from "@/lib/channels";
import type { ChannelPeriodStat } from "@/lib/dashboard";
import { formatCompact, formatDeltaPct, formatSignedNumber, initialsFromStart } from "@/lib/format";

import { createChannelAction, updateChannelAction, type ChannelFormState } from "./actions";

const initialState: ChannelFormState = { error: null };

type CreatorOption = { id: string; name: string };

/** Inline sparkline — daily views within the current period, matching design/Channels.dc.html's
 *  hand-built `spark()`. Flat/empty input renders a flat mid-line rather than an error. */
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
    <svg width="72" height="26" viewBox="0 0 72 26" className="block" role="img" aria-label="Xu hướng 7 ngày">
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
export const CHANNEL_TABLE_COLUMNS = "2fr 0.95fr 1.05fr 0.6fr 0.85fr 0.8fr 1.1fr 40px";

export function ChannelRow({
  channel,
  stat,
  creators,
  isManager,
}: {
  channel: ChannelSummary;
  stat: ChannelPeriodStat | undefined;
  creators: CreatorOption[];
  isManager: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const boundAction = updateChannelAction.bind(null, channel.id);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) setEditing(false);
    wasPending.current = pending;
  }, [pending, state.error]);

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
            <span className="mb-1.5 block text-[12.5px] font-bold">Creator phụ trách</span>
            <CreatorSelect creators={creators} defaultValue={channel.currentCreator?.id} />
          </label>

          <label className="flex items-center gap-2 pt-6 text-[13px] font-medium">
            <input type="checkbox" name="isActive" defaultChecked={channel.isActive} className="h-4 w-4" />
            Đang hoạt động
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

        <div className="mt-2">
          <ErrorBox error={state.error} />
        </div>
      </form>
    );
  }

  const hasSpark = (stat?.spark.length ?? 0) >= 2;

  return (
    <div
      className="grid items-center gap-3 border-t border-line-soft px-5 py-3.5"
      style={{ gridTemplateColumns: CHANNEL_TABLE_COLUMNS }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-pill bg-line-soft text-xs font-extrabold text-ink-2">
          {initialsFromStart(channel.name)}
        </div>
        <div className="min-w-0">
          <Link href={`/channels/${channel.id}`} className="block truncate text-sm font-bold tracking-[-0.2px] hover:underline">
            {channel.name}
          </Link>
          <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
            <span className="truncate">{channel.tiktokHandle}</span>
            <span className="shrink-0">· {channel.currentCreator ? channel.currentCreator.name : "chưa gán"}</span>
            {!channel.isActive ? (
              <span className="shrink-0 rounded-pill bg-line-soft px-1.5 py-[1px] font-semibold text-ink-2">Ngừng h.đ</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="text-right">
        <div className="text-sm font-bold">{stat?.followersNow !== null && stat?.followersNow !== undefined ? formatCompact(stat.followersNow) : "—"}</div>
        {stat?.followersGain !== null && stat?.followersGain !== undefined ? (
          <div className="mt-0.5 text-[11.5px] font-semibold text-green-dark">{formatSignedNumber(stat.followersGain)}</div>
        ) : null}
      </div>

      <div className="text-right">
        <div className="text-sm font-bold">{stat ? formatCompact(stat.views) : "—"}</div>
        {stat ? (
          <div className={`mt-0.5 text-[11.5px] font-semibold ${stat.viewsDeltaPct !== null && stat.viewsDeltaPct < 0 ? "text-red-dark" : "text-green-dark"}`}>
            {formatDeltaPct(stat.viewsDeltaPct)}
          </div>
        ) : null}
      </div>

      <div className="text-right text-sm font-bold">{stat?.videos ?? "—"}</div>

      <div className="text-right text-sm font-bold">{stat?.viewsPerVideo !== null && stat?.viewsPerVideo !== undefined ? formatCompact(stat.viewsPerVideo) : "—"}</div>

      <div className="flex justify-center">
        {hasSpark && stat ? (
          <Sparkline points={stat.spark} good={stat.viewsDeltaPct === null || stat.viewsDeltaPct >= 0} />
        ) : (
          <span className="text-xs text-ink-3">—</span>
        )}
      </div>

      <div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-pill bg-line-soft px-2.5 py-1 text-[11.5px] font-semibold text-ink-3">
          Chưa đặt KPI
        </span>
      </div>

      {isManager ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="justify-self-end text-[12.5px] font-semibold text-red hover:opacity-80"
        >
          Sửa
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}
