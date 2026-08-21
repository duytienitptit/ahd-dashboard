"use server";

import { revalidatePath } from "next/cache";

import { AuthorizationError, requireManager } from "@/lib/auth";
import { createManualEntry } from "@/lib/manual-entry";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ValidationError } from "@/lib/validation";

export type ManualEntryFormState = { error: string | null };

function toMessage(error: unknown): string {
  if (error instanceof AuthorizationError) return error.message;
  if (error instanceof ValidationError) return error.message;
  console.error(error);
  return "Đã có lỗi xảy ra, thử lại sau.";
}

function readOptionalInt(formData: FormData, field: string): number | undefined {
  const raw = formData.get(field);
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ValidationError(`Trường "${field}" phải là số nguyên không âm.`);
  }
  return parsed;
}

export async function createManualEntryAction(
  channelId: string,
  _prevState: ManualEntryFormState,
  formData: FormData,
): Promise<ManualEntryFormState> {
  try {
    const manager = await requireManager();

    const date = String(formData.get("date") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { error: "Vui lòng chọn ngày hợp lệ." };
    }

    const videoViews = readOptionalInt(formData, "videoViews");
    const followers = readOptionalInt(formData, "followers");
    const videoCount = readOptionalInt(formData, "videoCount");
    if (videoViews === undefined && followers === undefined && videoCount === undefined) {
      return { error: "Nhập ít nhất một trong: lượt xem, follower, số video." };
    }

    const supabase = await createSupabaseServerClient();
    await createManualEntry(
      supabase,
      { channelId, date, videoViews, followers, videoCount },
      { id: manager.id, name: manager.name },
    );
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath(`/channels/${channelId}`);
  return { error: null };
}
