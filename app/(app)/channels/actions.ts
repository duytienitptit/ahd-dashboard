"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AuthorizationError, requireManager, requireUser } from "@/lib/auth";
import { createChannel, deleteChannel, updateChannel, updateChannelName } from "@/lib/channels";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ValidationError, normalizeTiktokHandle } from "@/lib/validation";

export type ChannelFormState = { error: string | null };

function toMessage(error: unknown): string {
  if (error instanceof AuthorizationError) return error.message;
  if (error instanceof ValidationError) return error.message;
  if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505") {
    return "Handle TikTok này đã được dùng cho kênh khác.";
  }
  console.error(error);
  return "Đã có lỗi xảy ra, thử lại sau.";
}

/** `""` (the "— Chưa gán —" option) and unset both mean "no Creator". */
function readCreatorId(formData: FormData): string | null {
  const value = formData.get("creatorId");
  return typeof value === "string" && value !== "" ? value : null;
}

export async function createChannelAction(
  _prevState: ChannelFormState,
  formData: FormData,
): Promise<ChannelFormState> {
  try {
    await requireManager();

    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { error: "Vui lòng nhập tên kênh." };

    const rawHandle = String(formData.get("tiktokHandle") ?? "").trim();
    if (!rawHandle) return { error: "Vui lòng nhập handle TikTok." };
    const tiktokHandle = normalizeTiktokHandle(rawHandle);

    const supabase = await createSupabaseServerClient();
    await createChannel(supabase, { name, tiktokHandle, creatorId: readCreatorId(formData) });
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath("/channels");
  return { error: null };
}

export async function updateChannelAction(
  channelId: string,
  _prevState: ChannelFormState,
  formData: FormData,
): Promise<ChannelFormState> {
  try {
    await requireManager();

    const name = String(formData.get("name") ?? "").trim();
    const rawHandle = String(formData.get("tiktokHandle") ?? "").trim();
    const supabase = await createSupabaseServerClient();
    await updateChannel(supabase, channelId, {
      name: name || undefined,
      tiktokHandle: rawHandle ? normalizeTiktokHandle(rawHandle) : undefined,
      creatorId: readCreatorId(formData),
      isActive: formData.get("isActive") === "on",
    });
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath("/channels");
  return { error: null };
}

/**
 * Creator-safe rename — CLAUDE.md vấn đề #11. Deliberately not `requireManager()`: any signed-in
 * user can call this action, but `updateChannelName()` (via the `update_channel_name` SECURITY
 * DEFINER function) only actually renames a channel the caller is currently assigned to — see
 * supabase/migrations/20260821000002_creator_edit_channel_name.sql.
 */
export async function updateChannelNameAction(
  channelId: string,
  _prevState: ChannelFormState,
  formData: FormData,
): Promise<ChannelFormState> {
  try {
    await requireUser();

    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { error: "Vui lòng nhập tên kênh." };

    const supabase = await createSupabaseServerClient();
    await updateChannelName(supabase, channelId, name);
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath("/channels");
  return { error: null };
}

export type DeleteFormState = { error: string | null };

/**
 * Hard delete — Manager-only, confirmed by typing the channel's name in the UI
 * (ConfirmDeleteForm). `deleteChannel()` itself blocks this when a finalized KPI cycle exists;
 * logs to `audit_log` only after the delete succeeds, same reasoning as creators/actions.ts's
 * deleteCreatorAction — `entity_id` has no FK, built to survive exactly this.
 */
export async function deleteChannelAction(
  channelId: string,
  _prevState: DeleteFormState,
  formData: FormData,
): Promise<DeleteFormState> {
  const supabase = await createSupabaseServerClient();
  try {
    const manager = await requireManager();
    await deleteChannel(supabase, channelId);

    const confirmedName = String(formData.get("confirmName") ?? "");
    await supabase.from("audit_log").insert({
      entity_type: "channel",
      entity_id: channelId,
      action: "deleted",
      actor: manager.username,
      note: confirmedName ? `Xoá kênh "${confirmedName}".` : null,
    });
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath("/channels");
  redirect("/channels");
}
