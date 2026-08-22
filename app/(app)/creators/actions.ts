"use server";

import { revalidatePath } from "next/cache";

import { AuthorizationError, requireManager } from "@/lib/auth";
import { createCreator, updateCreator, type CreatorSummary } from "@/lib/creators";
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
    return "Email này đã có tài khoản.";
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

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!email) return { error: "Vui lòng nhập email.", created: null, tempPassword: null };

    const password = String(formData.get("password") ?? "");
    if (password.length < 8) {
      return { error: "Mật khẩu tạm phải có ít nhất 8 ký tự.", created: null, tempPassword: null };
    }

    const supabase = await createSupabaseServerClient();
    const created = await createCreator(supabase, {
      name,
      email,
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
