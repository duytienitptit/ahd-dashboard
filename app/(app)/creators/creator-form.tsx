"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import type { CreatorSummary } from "@/lib/creators";
import type { CreatorRank } from "@/lib/dashboard";
import { formatCompact, formatDeltaPct, formatRatePct, formatSignedNumber } from "@/lib/format";

import {
  createCreatorAction,
  updateCreatorAction,
  type CreatorFormState,
  type UpdateCreatorFormState,
} from "./actions";

/** Computed in creators/page.tsx from `getChannelPeriodStats`, grouped by Creator — see there for
 *  the aggregation. Kept as a plain data type here so this file doesn't need to know about
 *  Supabase. */
export type CreatorPerformance = {
  totalViews: number;
  viewsDeltaPct: number | null;
  followerGain: number;
  engagementRate: number | null;
  channels: { id: string; name: string; tiktokHandle: string; views: number; viewsDeltaPct: number | null }[];
};

const RANK_STYLE: Record<CreatorRank, { label: string; bg: string; fg: string } | null> = {
  leader: { label: "Dẫn đầu view", bg: "bg-cyan-bg", fg: "text-cyan-ink" },
  growth: { label: "Tăng trưởng tốt", bg: "bg-green-bg", fg: "text-green-dark" },
  attention: { label: "Cần chú ý", bg: "bg-red-bg", fg: "text-red-dark" },
  stable: null,
};

const createInitialState: CreatorFormState = { error: null, created: null, tempPassword: null };
const updateInitialState: UpdateCreatorFormState = { error: null };

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-input bg-red-bg px-3 py-2 text-[12.5px] font-medium text-red-dark">
      {error}
    </div>
  );
}

/** Shows the just-created account's temp password exactly once — it is never stored or shown again. */
function CreatedNotice({ creator, password, onDismiss }: { creator: CreatorSummary; password: string; onDismiss: () => void }) {
  return (
    <div className="mb-4 rounded-card border border-line bg-cyan-bg p-4">
      <div className="text-[13px] font-bold text-cyan-ink">
        Đã tạo tài khoản cho {creator.name} ({creator.email})
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[12.5px] text-cyan-ink-2">Mật khẩu tạm:</span>
        <code className="rounded-[4px] bg-bg px-2 py-1 text-[13px] font-semibold">{password}</code>
      </div>
      <p className="mt-2 text-[11.5px] text-cyan-ink-2">
        Gửi mật khẩu này riêng cho Creator — trang sẽ không hiển thị lại. Chưa có gửi email tự động.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-3 text-[12.5px] font-semibold text-cyan-ink underline underline-offset-2"
      >
        Đã gửi, ẩn thông báo
      </button>
    </div>
  );
}

export function CreateCreatorForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createCreatorAction, createInitialState);
  const wasPending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      setOpen(false);
      formRef.current?.reset();
    }
    wasPending.current = pending;
  }, [pending, state.error]);

  return (
    <div>
      {state.created && state.tempPassword ? (
        <CreatedNotice
          creator={state.created}
          password={state.tempPassword}
          onDismiss={() => {
            // Clearing local UI state only — the action's returned state itself isn't resettable,
            // so a dismissed notice simply won't remount until the next successful create.
            formRef.current?.reset();
          }}
        />
      ) : null}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-[38px] items-center rounded-btn bg-red px-[18px] text-sm font-bold text-white hover:opacity-90"
        >
          + Tạo tài khoản
        </button>
      ) : (
        <form ref={formRef} action={formAction} className="mb-4 rounded-card border border-line p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-bold">Tên</span>
              <input
                name="name"
                required
                className="h-[40px] w-full rounded-input border border-line px-3 text-sm outline-none focus:border-ink"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-bold">Email</span>
              <input
                name="email"
                type="email"
                required
                className="h-[40px] w-full rounded-input border border-line px-3 text-sm outline-none focus:border-ink"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-bold">Mật khẩu tạm</span>
              <input
                name="password"
                type="text"
                required
                minLength={8}
                placeholder="≥ 8 ký tự"
                className="h-[40px] w-full rounded-input border border-line px-3 text-sm outline-none focus:border-ink"
              />
            </label>
          </div>

          <div className="mt-2">
            <ErrorBox error={state.error} />
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="h-[38px] rounded-btn bg-red px-4 text-[13.5px] font-bold text-white hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Đang tạo…" : "Tạo tài khoản"}
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
      )}
    </div>
  );
}

/** Last two words' initials — matches design/Creators.dc.html's avatar rule. */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function CreatorCard({
  creator,
  isManager,
  performance,
  rank,
}: {
  creator: CreatorSummary;
  isManager: boolean;
  performance?: CreatorPerformance;
  rank?: CreatorRank;
}) {
  const [editing, setEditing] = useState(false);
  const boundAction = updateCreatorAction.bind(null, creator.id);
  const [state, formAction, pending] = useActionState(boundAction, updateInitialState);
  const wasPending = useRef(false);
  const rankStyle = rank ? RANK_STYLE[rank] : null;

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) setEditing(false);
    wasPending.current = pending;
  }, [pending, state.error]);

  return (
    <div className="overflow-hidden rounded-card border border-line">
      <div className="flex items-start justify-between gap-3 border-b border-line-soft px-5 py-[18px]">
        <div className="flex items-center gap-3">
          <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-pill bg-line-soft text-[15px] font-extrabold text-ink-2">
            {initials(creator.name)}
          </div>
          <div>
            <div className="text-base font-bold tracking-[-0.3px]">{creator.name}</div>
            <div className="mt-0.5 text-[12.5px] text-ink-3">{creator.email}</div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            className={`flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-semibold ${
              creator.isActive ? "bg-green-bg text-green-dark" : "bg-line-soft text-ink-2"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-pill ${creator.isActive ? "bg-green" : "bg-ink-3"}`} />
            {creator.isActive ? "Đang hoạt động" : "Đã vô hiệu hoá"}
          </span>
          {rankStyle ? (
            <span className={`rounded-pill px-2.5 py-1 text-[11.5px] font-semibold ${rankStyle.bg} ${rankStyle.fg}`}>
              {rankStyle.label}
            </span>
          ) : null}
        </div>
      </div>

      {performance ? (
        <div className="grid grid-cols-3 divide-x divide-line-soft border-b border-line-soft">
          <div className="px-4 py-3.5">
            <div className="mb-1.5 text-[11.5px] font-semibold text-ink-3">Lượt xem</div>
            <div className="text-lg font-extrabold tracking-[-0.4px]">{formatCompact(performance.totalViews)}</div>
            <div className="mt-0.5 text-[11px] text-ink-3">{formatDeltaPct(performance.viewsDeltaPct)} so với kỳ trước</div>
          </div>
          <div className="px-4 py-3.5">
            <div className="mb-1.5 text-[11.5px] font-semibold text-ink-3">Follower +</div>
            <div className="text-lg font-extrabold tracking-[-0.4px] text-green-dark">{formatSignedNumber(performance.followerGain)}</div>
            <div className="mt-0.5 text-[11px] text-ink-3">trong 7 ngày qua</div>
          </div>
          <div className="px-4 py-3.5">
            <div className="mb-1.5 text-[11.5px] font-semibold text-ink-3">Tương tác</div>
            <div className="text-lg font-extrabold tracking-[-0.4px]">{formatRatePct(performance.engagementRate)}</div>
            <div className="mt-0.5 text-[11px] text-ink-3">chỉ số dẫn báo</div>
          </div>
        </div>
      ) : null}

      <div className="px-5 py-4">
        <div className="mb-3 text-[11.5px] font-bold text-ink-3">
          KÊNH PHỤ TRÁCH ({creator.channelCount})
        </div>
        {creator.channels.length === 0 ? (
          <p className="text-[12.5px] text-ink-3">Chưa phụ trách kênh nào.</p>
        ) : performance ? (
          <div className="flex flex-col gap-3">
            {performance.channels.map((channel) => {
              const maxViews = Math.max(1, ...performance.channels.map((c) => c.views));
              return (
                <div key={channel.id}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold">{channel.name}</span>
                      <span className="text-[11.5px] text-ink-3">{channel.tiktokHandle}</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[12.5px] text-ink-3">{formatCompact(channel.views)} view</span>
                      <span
                        className={`text-[12.5px] font-bold ${
                          channel.viewsDeltaPct !== null && channel.viewsDeltaPct < 0 ? "text-red-dark" : "text-green-dark"
                        }`}
                      >
                        {formatDeltaPct(channel.viewsDeltaPct)}
                      </span>
                    </div>
                  </div>
                  <div className="h-[5px] overflow-hidden rounded-pill bg-line-soft">
                    <div
                      className={`h-[5px] rounded-pill ${
                        channel.viewsDeltaPct !== null && channel.viewsDeltaPct < 0 ? "bg-red" : "bg-cyan"
                      }`}
                      style={{ width: `${(channel.views / maxViews) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {creator.channels.map((channel) => (
              <li key={channel.id} className="flex items-center gap-2 text-[13px]">
                <span className="font-semibold">{channel.name}</span>
                <span className="text-[11.5px] text-ink-3">{channel.tiktokHandle}</span>
              </li>
            ))}
          </ul>
        )}

        {isManager ? (
          editing ? (
            <form action={formAction} className="mt-4 border-t border-line-soft pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[12.5px] font-bold">Tên</span>
                  <input
                    name="name"
                    required
                    defaultValue={creator.name}
                    className="h-[38px] w-full rounded-input border border-line px-3 text-sm outline-none focus:border-ink"
                  />
                </label>
                <label className="flex items-center gap-2 pt-6 text-[13px] font-medium">
                  <input type="checkbox" name="isActive" defaultChecked={creator.isActive} className="h-4 w-4" />
                  Đang hoạt động
                </label>
              </div>

              <div className="mt-2">
                <ErrorBox error={state.error} />
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="h-[36px] rounded-btn bg-red px-3.5 text-[12.5px] font-bold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {pending ? "Đang lưu…" : "Lưu"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="h-[36px] rounded-btn border border-line px-3.5 text-[12.5px] font-semibold hover:bg-surface"
                >
                  Huỷ
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-4 border-t border-line-soft pt-4">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-[12.5px] font-semibold text-red hover:opacity-80"
              >
                Sửa
              </button>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
