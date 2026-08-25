"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AuthorizationError, requireManager } from "@/lib/auth";
import { createKpiCycle, deleteKpiCycle, updateKpiCycle, type KpiPeriodType } from "@/lib/kpi";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ValidationError } from "@/lib/validation";

export type KpiFormState = { error: string | null };
export type DeleteFormState = { error: string | null };

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
