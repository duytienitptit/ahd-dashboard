"use server";

import { revalidatePath } from "next/cache";

import { AuthorizationError, requireManager } from "@/lib/auth";
import { createChannel, updateChannel } from "@/lib/channels";
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
    const supabase = await createSupabaseServerClient();
    await updateChannel(supabase, channelId, {
      name: name || undefined,
      creatorId: readCreatorId(formData),
      isActive: formData.get("isActive") === "on",
    });
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath("/channels");
  return { error: null };
}
