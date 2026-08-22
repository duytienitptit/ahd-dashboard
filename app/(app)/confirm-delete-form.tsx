"use client";

import { useActionState, useState } from "react";

type DeleteState = { error: string | null };

/**
 * Type-the-name-to-confirm delete — deliberately more friction than the browser `confirm()` dialog
 * Team delete uses (TeamRow/creator-form.tsx): a Team delete only unassigns members (`on delete set
 * null`, no data loss), while deleting a Creator or Channel is a real, irreversible destruction of
 * history (data_snapshot, content_video, channel_ownership_history — see lib/creators.ts /
 * lib/channels.ts). User-requested pattern (21/08/2026 follow-up): "xoá thật nhưng cần điền tên...
 * để xác nhận". The submit button stays disabled until the typed text matches `entityName` exactly.
 *
 * The typed text is also submitted as a hidden `confirmName` field purely so the server action can
 * put a human-readable name in the `audit_log` note — it is NOT re-validated server-side as a
 * security control (the real authorization is `requireManager()`; this input is a "did you mean to
 * do this" guard against fat-fingering the delete button, same spirit as GitHub's repo-delete flow).
 */
export function ConfirmDeleteForm({
  action,
  entityName,
  fieldLabel,
  warning,
  onCancel,
}: {
  action: (prevState: DeleteState, formData: FormData) => Promise<DeleteState>;
  entityName: string;
  fieldLabel: string;
  warning: string;
  onCancel: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [state, formAction, pending] = useActionState(action, { error: null });
  const matches = confirmText.trim().length > 0 && confirmText === entityName;

  return (
    <form action={formAction} className="rounded-card border border-red-dark bg-red-bg p-4">
      <input type="hidden" name="confirmName" value={confirmText} />
      <p className="text-[13px] font-semibold text-red-dark">{warning}</p>
      <label className="mt-3 block">
        <span className="mb-1.5 block text-[12.5px] font-bold text-red-dark">
          Gõ chính xác {fieldLabel} “{entityName}” để xác nhận
        </span>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={entityName}
          autoComplete="off"
          className="h-[38px] w-full rounded-input border border-red bg-bg px-3 text-sm outline-none focus:border-red-dark"
        />
      </label>

      {state.error ? <p className="mt-2 text-[12.5px] font-medium text-red-dark">{state.error}</p> : null}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={!matches || pending}
          className="h-[36px] rounded-btn bg-red-dark px-3.5 text-[12.5px] font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Đang xoá…" : "Xoá vĩnh viễn"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-[36px] rounded-btn border border-line px-3.5 text-[12.5px] font-semibold hover:bg-surface"
        >
          Huỷ
        </button>
      </div>
    </form>
  );
}
