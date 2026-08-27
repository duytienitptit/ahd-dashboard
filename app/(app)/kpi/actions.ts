"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AuthorizationError, requireManager } from "@/lib/auth";
import {
  checkFinalizeReadiness,
  createKpiCycle,
  deleteKpiCycle,
  finalizeKpiCycle,
  getKpiCycleById,
  updateKpiCycle,
  type FinalizeReasonCode,
  type KpiPeriodType,
} from "@/lib/kpi";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ValidationError } from "@/lib/validation";

export type KpiFormState = { error: string | null };
export type DeleteFormState = { error: string | null };
export type FinalizeFormState = { error: string | null; reasons?: FinalizeReasonCode[] };

function toMessage(error: unknown): string {
  if (error instanceof AuthorizationError) return error.message;
  if (error instanceof ValidationError) return error.message;
  if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23P01") {
    return "Kênh này đã có chu kỳ KPI trùng khoảng ngày.";
  }
  console.error(error);
  return "Đã có lỗi xảy ra, thử lại sau.";
}

/**
 * FormData is always strings, unlike the JSON-body `optionalNonNegativeInt` the REST route uses
 * (app/api/kpi-cycles/route.ts) — Server Actions in this app parse FormData by hand instead of
 * sharing that helper (same split channels/actions.ts's `readCreatorId` already follows). Empty
 * input → `null` ("no target set" on create, "cleared" on edit — the edit form always resubmits
 * every field's current value, so there is no separate "leave unchanged" case to express here).
 */
function parseTarget(formData: FormData, field: string): number | null {
  const raw = String(formData.get(field) ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new ValidationError(`Trường "${field}" phải là số nguyên không âm.`);
  }
  return n;
}

function revalidateEverywhereShown(channelId: string) {
  revalidatePath("/kpi");
  revalidatePath("/channels");
  revalidatePath(`/channels/${channelId}`);
  revalidatePath("/");
}

export async function createKpiCycleAction(_prevState: KpiFormState, formData: FormData): Promise<KpiFormState> {
  const channelId = String(formData.get("channelId") ?? "").trim();
  try {
    await requireManager();
    if (!channelId) return { error: "Vui lòng chọn kênh." };

    const periodType = String(formData.get("periodType") ?? "weekly").trim();
    if (periodType !== "weekly" && periodType !== "custom") return { error: "Chu kỳ không hợp lệ." };

    const periodStart = String(formData.get("periodStart") ?? "").trim();
    const periodEnd = String(formData.get("periodEnd") ?? "").trim();
    if (!periodStart || !periodEnd) return { error: "Vui lòng chọn khoảng ngày." };

    const supabase = await createSupabaseServerClient();
    await createKpiCycle(supabase, {
      channelId,
      periodType: periodType as KpiPeriodType,
      periodStart,
      periodEnd,
      targetViews: parseTarget(formData, "targetViews"),
      targetVideos: parseTarget(formData, "targetVideos"),
      targetFollowers: parseTarget(formData, "targetFollowers"),
    });
  } catch (error) {
    return { error: toMessage(error) };
  }

  if (channelId) revalidateEverywhereShown(channelId);
  redirect("/kpi");
}

export async function updateKpiCycleAction(
  cycleId: string,
  channelId: string,
  _prevState: KpiFormState,
  formData: FormData,
): Promise<KpiFormState> {
  try {
    await requireManager();

    const periodStart = String(formData.get("periodStart") ?? "").trim();
    const periodEnd = String(formData.get("periodEnd") ?? "").trim();
    if (!periodStart || !periodEnd) return { error: "Vui lòng chọn khoảng ngày." };

    const supabase = await createSupabaseServerClient();
    await updateKpiCycle(supabase, cycleId, {
      periodStart,
      periodEnd,
      targetViews: parseTarget(formData, "targetViews"),
      targetVideos: parseTarget(formData, "targetVideos"),
      targetFollowers: parseTarget(formData, "targetFollowers"),
    });
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidateEverywhereShown(channelId);
  redirect("/kpi");
}

/**
 * Not in docs/TASKS.md's original M5 list — added because `channelId`/`followersAtStart` are
 * immutable once created, so a cycle made against the wrong channel has no other way back (lib/kpi.ts's
 * `deleteKpiCycle` doc comment). Only `draft` cycles can be deleted (`assertEditable`). Used inline on
 * `/kpi` via `ConfirmDeleteForm` — redirects back to `/kpi` regardless (same pattern
 * deleteChannelAction/deleteCreatorAction use even when already on the list page).
 */
export async function deleteKpiCycleAction(
  cycleId: string,
  channelId: string,
  _prevState: DeleteFormState,
  formData: FormData,
): Promise<DeleteFormState> {
  const supabase = await createSupabaseServerClient();
  try {
    const manager = await requireManager();
    await deleteKpiCycle(supabase, cycleId);

    const confirmedName = String(formData.get("confirmName") ?? "");
    await supabase.from("audit_log").insert({
      entity_type: "kpi_cycle",
      entity_id: cycleId,
      action: "deleted",
      actor: manager.username,
      note: confirmedName ? `Xoá chu kỳ KPI "${confirmedName}".` : null,
    });
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidateEverywhereShown(channelId);
  redirect("/kpi");
}

/**
 * M6, docs/API_SPEC.md `POST /api/kpi-cycles/:id/finalize`. Re-checks readiness itself even though
 * the finalize page already rendered the same checklist server-side — the page's data can be stale
 * by the time the Manager clicks (import finished mid-review, or another tab got there first), and
 * the DB write must never happen against a check the user merely SAW earlier.
 *
 * No `redirect()`, unlike every other action in this file — stays on `/kpi/[id]/finalize` so
 * `revalidatePath` re-renders it into its own "đã chốt sổ" read-only branch in place, satisfying
 * docs/TASKS.md's "UI: xem lại lịch sử các kỳ đã chốt" with the same page rather than a second one.
 */
// useActionState's callback shape requires both trailing params; this action needs neither (no
// prior state to merge, nothing in the form beyond the checkbox, which is a client-only gate — see
// the doc comment above).
export async function finalizeKpiCycleAction(
  cycleId: string,
  channelId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: FinalizeFormState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData,
): Promise<FinalizeFormState> {
  const supabase = await createSupabaseServerClient();
  try {
    const manager = await requireManager();

    const cycle = await getKpiCycleById(supabase, cycleId);
    if (!cycle) return { error: "Chu kỳ KPI không tồn tại." };
    if (cycle.status === "final") return { error: "Chu kỳ KPI đã chốt sổ — không cần chốt lại." };

    const readiness = await checkFinalizeReadiness(supabase, cycle);
    if (!readiness.ready) {
      return { error: "Chưa đủ điều kiện chốt sổ — xem lại danh sách điều kiện ở trên.", reasons: readiness.reasons };
    }

    await finalizeKpiCycle(supabase, cycleId, manager.id);
    await supabase.from("audit_log").insert({
      entity_type: "kpi_cycle",
      entity_id: cycleId,
      action: "finalized",
      actor: manager.username,
      note: `Chốt sổ chu kỳ ${cycle.periodStart} → ${cycle.periodEnd}.`,
    });
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidateEverywhereShown(channelId);
  revalidatePath(`/kpi/${cycleId}/finalize`);
  return { error: null };
}
