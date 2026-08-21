"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import type { ChannelSummary } from "@/lib/channels";

import { createChannelAction, updateChannelAction, type ChannelFormState } from "./actions";

const initialState: ChannelFormState = { error: null };

type CreatorOption = { id: string; name: string };

/** First two words' initials — matches design/Channels.dc.html's row avatar rule (people avatars
 *  in design/Creators.dc.html use the *last* two words instead; channels use the first two). */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
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

export function ChannelRow({
  channel,
  creators,
  isManager,
}: {
  channel: ChannelSummary;
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

  return (
    <div className="grid grid-cols-[2fr_1.3fr_0.9fr_1fr_auto] items-center gap-3 border-t border-line-soft px-5 py-3.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-pill bg-line-soft text-xs font-extrabold text-ink-2">
          {initials(channel.name)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold tracking-[-0.2px]">{channel.name}</div>
          <div className="text-[11.5px] text-ink-3">{channel.tiktokHandle}</div>
        </div>
      </div>

      <div className="text-[13px]">
        {channel.currentCreator ? (
          channel.currentCreator.name
        ) : (
          <span className="text-ink-3">— Chưa gán —</span>
        )}
      </div>

      <div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-semibold ${
            channel.isActive ? "bg-green-bg text-green-dark" : "bg-line-soft text-ink-2"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-pill ${channel.isActive ? "bg-green" : "bg-ink-3"}`} />
          {channel.isActive ? "Đang hoạt động" : "Ngừng hoạt động"}
        </span>
      </div>

      <div className="text-[13px] text-ink-3">
        {new Date(channel.createdAt).toLocaleDateString("vi-VN")}
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
