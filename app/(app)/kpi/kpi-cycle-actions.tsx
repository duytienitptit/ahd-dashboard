"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import type { FinalizeReasonCode, KpiStatus } from "@/lib/kpi";

import { ConfirmDeleteForm } from "../confirm-delete-form";
import { deleteKpiCycleAction, finalizeKpiCycleAction, type FinalizeFormState } from "./actions";

const FINALIZE_REASON_LABEL: Record<FinalizeReasonCode, string> = {
  too_early: "Chưa đủ thời gian chờ dữ liệu Studio.",
  missing_studio_data: "Còn thiếu dữ liệu Studio ở một số ngày trong kỳ.",
  has_manual_entry: "Còn ngày dùng số nhập tay chưa được thay bằng số Studio.",
};

const finalizeInitialState: FinalizeFormState = { error: null };

/** Inline "Chốt sổ" confirm — same spot the row already sits in, same interaction shape as
 *  `ConfirmDeleteForm` right below. Replaces the old required detour through
 *  `/kpi/[id]/finalize` before locking a cycle (26/08/2026, theo yêu cầu: "giao diện này đang bị
 *  thừa vì ở giao diện KPI đã có thể check các chỉ số rồi") — that page's own checklist/compare
 *  table duplicated exactly what `KpiCard` already shows on the same screen. The page itself is
 *  NOT deleted: `finalizeKpiCycleAction` still runs the same 3 gates server-side regardless of
 *  which entry point calls it, and a FINAL cycle still links there for "Xem chốt sổ" — real
 *  historical detail (compare table, người chốt, thời điểm) that has no compact equivalent here. */
function FinalizeInlineConfirm({
  cycleId,
  channelId,
  onCancel,
}: {
  cycleId: string;
  channelId: string;
  onCancel: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const boundAction = finalizeKpiCycleAction.bind(null, cycleId, channelId);
  const [state, formAction, pending] = useActionState(boundAction, finalizeInitialState);

  return (
    <form action={formAction} className="rounded-card border border-red-dark bg-red-bg p-4">
      <p className="text-[13px] font-semibold text-red-dark">
        Chốt sổ là thao tác không thể hoàn tác — số liệu bị khoá vĩnh viễn, dùng làm căn cứ tính thưởng.
      </p>

      {state.error ? (
        <div className="mt-2.5 text-[12.5px] font-medium text-red-dark">
          <p>{state.error}</p>
          {state.reasons && state.reasons.length > 0 ? (
            <ul className="mt-1 list-disc pl-4">
              {state.reasons.map((r) => (
                <li key={r}>{FINALIZE_REASON_LABEL[r]}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <label className="mt-3 flex items-center gap-2.5 text-[12.5px] text-red-dark">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-4 w-4" />
        Tôi xác nhận đã đối chiếu số liệu và đồng ý khoá chu kỳ này
      </label>

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={!confirmed || pending}
          className="h-[36px] rounded-btn bg-red-dark px-3.5 text-[12.5px] font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Đang chốt sổ…" : "Chốt sổ & khoá"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-[36px] rounded-btn border border-line bg-bg px-3.5 text-[12.5px] font-semibold hover:bg-surface"
        >
          Huỷ
        </button>
      </div>
    </form>
  );
}

/**
 * Sửa/Chốt sổ/Xem chốt sổ/Xoá for one cycle — extracted out of what used to be `/kpi`'s own
 * `KpiRow` (26/08/2026, khi trang `/kpi` đổi từ danh sách chu kỳ sang danh sách kênh) so
 * `KpiCard` (app/(app)/channels/[id]/kpi-card.tsx) can render the exact same actions both for a
 * channel's active cycle and for each entry in "Các kỳ trước" — that second place had NO actions
 * at all before this, which meant an old draft cycle that already ended (needs finalizing) became
 * unreachable the moment a newer cycle took over "active". Manager-only; callers don't render this
 * for Creator at all (see kpi-card.tsx) — same as the deleted KpiRow never showed these to Creator.
 */
export function KpiCycleActions({
  cycleId,
  channelId,
  entityName,
  status,
}: {
  cycleId: string;
  channelId: string;
  /** For the delete-confirm's "type this exact name" field — e.g. "Kênh X 17/08/2026-23/08/2026". */
  entityName: string;
  status: KpiStatus;
}) {
  const [deleting, setDeleting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const boundDelete = deleteKpiCycleAction.bind(null, cycleId, channelId);

  if (deleting) {
    return (
      <ConfirmDeleteForm
        action={boundDelete}
        entityName={entityName}
        fieldLabel="kênh + khoảng ngày"
        warning="Xoá chu kỳ KPI này — chỉ xoá được khi còn ở trạng thái nháp, không phục hồi được."
        onCancel={() => setDeleting(false)}
      />
    );
  }

  // `status === "final"` here means the action succeeded and the server re-rendered with fresh
  // props — falls through past `finalizing` on its own, no explicit reset needed.
  if (status === "final") {
    return (
      <Link href={`/kpi/${cycleId}/finalize`} className="text-[12.5px] font-semibold text-ink-2 hover:text-ink">
        Xem chốt sổ
      </Link>
    );
  }

  if (finalizing) {
    return <FinalizeInlineConfirm cycleId={cycleId} channelId={channelId} onCancel={() => setFinalizing(false)} />;
  }

  return (
    <div className="flex shrink-0 items-center gap-3">
      <Link href={`/kpi/${cycleId}/edit`} className="text-[12.5px] font-semibold text-red hover:opacity-80">
        Sửa
      </Link>
      <button
        type="button"
        onClick={() => setFinalizing(true)}
        className="text-[12.5px] font-semibold text-ink-2 hover:text-ink"
      >
        Chốt sổ
      </button>
      {/* Chốt sổ tự nó không còn điều hướng tới /kpi/[id]/finalize nữa (26/08/2026) — vẫn giữ 1
          đường vào trang đó để xem bảng đối chiếu đầy đủ mà không phải chốt luôn (phản hồi 26/08:
          "đang không biết cách để vào trang finalize"). */}
      <Link href={`/kpi/${cycleId}/finalize`} className="text-[12.5px] font-semibold text-ink-3 hover:text-ink">
        Xem chi tiết
      </Link>
      <button
        type="button"
        onClick={() => setDeleting(true)}
        className="text-[12.5px] font-semibold text-ink-3 hover:text-red-dark"
      >
        Xoá
      </button>
    </div>
  );
}
