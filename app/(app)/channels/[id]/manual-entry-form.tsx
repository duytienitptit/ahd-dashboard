"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { createManualEntryAction, type ManualEntryFormState } from "./actions";

const initialState: ManualEntryFormState = { error: null };

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="mt-2 rounded-input bg-red-bg px-3 py-2 text-[12.5px] font-medium text-red-dark">
      {error}
    </div>
  );
}

/** Manager-only "miếng vá tạm" — docs/DATA_SOURCES.md "Nhập tay khi API lỗi". Deliberately narrow:
 *  3 fields, each optional but at least one required, no note/reason field — this isn't meant to be
 *  a comfortable data-entry screen, just enough to unblock a broken week. */
export function ManualEntryForm({ channelId, todayVn }: { channelId: string; todayVn: string }) {
  const [open, setOpen] = useState(false);
  const boundAction = createManualEntryAction.bind(null, channelId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const wasPending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      setOpen(false);
      formRef.current?.reset();
    }
    wasPending.current = pending;
  }, [pending, state.error]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-[32px] shrink-0 items-center gap-1.5 rounded-btn border border-line px-3 text-[12.5px] font-semibold hover:bg-surface"
      >
        + Nhập tay
      </button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="mb-3.5 rounded-card border border-line p-4">
      <div className="mb-1 text-[13px] font-bold">Nhập tay khi API lỗi</div>
      <p className="mb-3 text-[11.5px] text-ink-3">
        Chỉ dùng khi Display API không lấy được số và cần gấp giữa tuần — số này gắn nhãn{" "}
        <b>chưa xác thực</b> và tự bị thay khi có Studio import phủ ngày đó.
      </p>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-bold">Ngày</span>
          <input
            type="date"
            name="date"
            required
            max={todayVn}
            defaultValue={todayVn}
            className="h-[38px] w-full rounded-input border border-line px-3 text-sm outline-none focus:border-ink"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-bold">Follower</span>
          <input
            type="number"
            name="followers"
            min={0}
            step={1}
            placeholder="Bỏ trống nếu chưa biết"
            className="h-[38px] w-full rounded-input border border-line px-3 text-sm outline-none focus:border-ink"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-bold">Lượt xem trong ngày</span>
          <input
            type="number"
            name="videoViews"
            min={0}
            step={1}
            placeholder="Bỏ trống nếu chưa biết"
            className="h-[38px] w-full rounded-input border border-line px-3 text-sm outline-none focus:border-ink"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-bold">Tổng video (luỹ kế)</span>
          <input
            type="number"
            name="videoCount"
            min={0}
            step={1}
            placeholder="Bỏ trống nếu chưa biết"
            className="h-[38px] w-full rounded-input border border-line px-3 text-sm outline-none focus:border-ink"
          />
        </label>
      </div>

      <ErrorBox error={state.error} />

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-[38px] rounded-btn bg-red px-4 text-[13.5px] font-bold text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Đang lưu…" : "Lưu"}
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
