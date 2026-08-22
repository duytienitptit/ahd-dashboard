"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AuthorizationError, requireManager } from "@/lib/auth";
import { createCreator, deleteCreator, resetCreatorPassword, updateCreator, type CreatorSummary } from "@/lib/creators";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createTeam, deleteTeam, renameTeam } from "@/lib/teams";
import { ValidationError } from "@/lib/validation";

export type TeamFormState = { error: string | null };

/** `""` (the "— Chưa gán —" option) and unset both mean "no team" — same convention as
 *  app/(app)/channels/actions.ts's readCreatorId(). */
function readTeamId(formData: FormData): string | null {
  const value = formData.get("teamId");
  return typeof value === "string" && value !== "" ? value : null;
}

export type CreatorFormState = {
  error: string | null;
  created: CreatorSummary | null;
  /** The temp password just set, shown once so the Manager can hand it off — never stored. */
  tempPassword: string | null;
};
export type UpdateCreatorFormState = { error: string | null };

function toMessage(error: unknown): string {
  if (error instanceof AuthorizationError) return error.message;
  if (error instanceof ValidationError) return error.message;
  if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505") {
    return "Tên đăng nhập này đã có tài khoản.";
  }
  console.error(error);
  return "Đã có lỗi xảy ra, thử lại sau.";
}

export async function createCreatorAction(
  _prevState: CreatorFormState,
  formData: FormData,
): Promise<CreatorFormState> {
  try {
    const manager = await requireManager();

    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { error: "Vui lòng nhập tên Creator.", created: null, tempPassword: null };

    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    if (!username) return { error: "Vui lòng nhập tên đăng nhập.", created: null, tempPassword: null };
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      return {
        error: "Tên đăng nhập chỉ được chứa chữ thường, số, dấu chấm/gạch dưới/gạch ngang, 3-32 ký tự.",
        created: null,
        tempPassword: null,
      };
    }

    const password = String(formData.get("password") ?? "");
    if (password.length < 8) {
      return { error: "Mật khẩu phải có ít nhất 8 ký tự.", created: null, tempPassword: null };
    }

    const supabase = await createSupabaseServerClient();
    const created = await createCreator(supabase, {
      name,
      username,
      password,
      managerId: manager.id,
      teamId: readTeamId(formData),
    });

    revalidatePath("/creators");
    // The temporary password is shown once, right here — no SMTP is set up yet to email an invite
    // (docs/PRODUCT_SPEC.md still-open item). Not persisted anywhere past this response.
    return { error: null, created, tempPassword: password };
  } catch (error) {
    return { error: toMessage(error), created: null, tempPassword: null };
  }
}

export async function updateCreatorAction(
  creatorId: string,
  _prevState: UpdateCreatorFormState,
  formData: FormData,
): Promise<UpdateCreatorFormState> {
  try {
    await requireManager();

    const name = String(formData.get("name") ?? "").trim();
    const supabase = await createSupabaseServerClient();
    await updateCreator(supabase, creatorId, {
      name: name || undefined,
      isActive: formData.get("isActive") === "on",
      teamId: readTeamId(formData),
    });
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath("/creators");
  // Editing from the detail page itself (CreatorEditToggle) needs its own revalidate — this route
  // wasn't in the app yet when /creators' revalidate above was written, so it was never added
  // (21/08/2026 drill-down redesign).
  revalidatePath(`/creators/${creatorId}`);
  return { error: null };
}

export type PasswordFormState = { error: string | null; newPassword: string | null };

/** Manager sets a new temp password for a Creator (21/08/2026 follow-up — no self-service change
 *  exists yet, docs/PRODUCT_SPEC.md mục 8). Returns the plaintext once so `ResetPasswordForm` can
 *  show it exactly like account creation's `CreatedNotice` does; never stored past this response. */
export async function resetCreatorPasswordAction(
  creatorId: string,
  _prevState: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  try {
    await requireManager();
    const password = String(formData.get("password") ?? "");
    if (password.length < 8) {
      return { error: "Mật khẩu mới phải có ít nhất 8 ký tự.", newPassword: null };
    }
    await resetCreatorPassword(creatorId, password);
    return { error: null, newPassword: password };
  } catch (error) {
    return { error: toMessage(error), newPassword: null };
  }
}

export type DeleteFormState = { error: string | null };

/**
 * Hard delete — Manager-only, confirmed by typing the Creator's name in the UI
 * (ConfirmDeleteForm). Logs to `audit_log` AFTER the delete succeeds (not before): if
 * `deleteCreator()` throws, nothing should claim a deletion that didn't happen.
 * `entity_id` on `audit_log` deliberately has no FK — it's designed to survive exactly this.
 */
export async function deleteCreatorAction(
  creatorId: string,
  _prevState: DeleteFormState,
  formData: FormData,
): Promise<DeleteFormState> {
  const supabase = await createSupabaseServerClient();
  try {
    const manager = await requireManager();
    await deleteCreator(creatorId);

    const confirmedName = String(formData.get("confirmName") ?? "");
    await supabase.from("audit_log").insert({
      entity_type: "creator",
      entity_id: creatorId,
      action: "deleted",
      actor: manager.username,
      note: confirmedName ? `Xoá nhân sự "${confirmedName}".` : null,
    });
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath("/creators");
  redirect("/creators");
}

export async function createTeamAction(_prevState: TeamFormState, formData: FormData): Promise<TeamFormState> {
  try {
    await requireManager();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { error: "Vui lòng nhập tên team." };

    const supabase = await createSupabaseServerClient();
    await createTeam(supabase, name);
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath("/creators");
  return { error: null };
}

export async function renameTeamAction(
  teamId: string,
  _prevState: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  try {
    await requireManager();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { error: "Vui lòng nhập tên team." };

    const supabase = await createSupabaseServerClient();
    await renameTeam(supabase, teamId, name);
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath("/creators");
  return { error: null };
}

/** No confirmation dialog server-side — deleting a team never deletes its Creators
 *  (`creator.team_id` is `on delete set null`), so this is low-stakes/reversible (just re-create the
 *  team and reassign). The button on the client still asks "chắc chắn?" before calling this. */
export async function deleteTeamAction(teamId: string): Promise<void> {
  await requireManager();
  const supabase = await createSupabaseServerClient();
  await deleteTeam(supabase, teamId);
  revalidatePath("/creators");
}
