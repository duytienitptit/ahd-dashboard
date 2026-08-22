import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ValidationError } from "@/lib/validation";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type CreatorSummary = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  channelCount: number;
  channels: { id: string; name: string; tiktokHandle: string }[];
  /** `null` = chưa gán team, same shape as a channel's `currentCreator`. Team is purely an
   *  organizational grouping (CLAUDE.md, 21/08/2026) — does not restrict who sees what. */
  team: { id: string; name: string } | null;
};

export type CreateCreatorInput = {
  name: string;
  email: string;
  password: string;
  /** The Manager creating the account — becomes `creator.manager_id`. */
  managerId: string;
  teamId?: string | null;
};

export type UpdateCreatorInput = {
  name?: string;
  isActive?: boolean;
  teamId?: string | null;
};

/**
 * `docs/API_SPEC.md`'s `GET /api/creators` example doesn't show `channels`, but the M2 Creator
 * screen needs "kênh phụ trách" per Creator (docs/DESIGN_SYSTEM.md / design/Creators.dc.html) —
 * added here; docs/API_SPEC.md updated to match (2026-08-20).
 */
export async function listCreators(supabase: SupabaseServerClient): Promise<CreatorSummary[]> {
  // Independent queries — run in parallel, not one-after-another (neither depends on the other's
  // result), to save a Supabase round trip on every screen that lists creators.
  const [{ data: creators, error }, { data: channels, error: channelsError }] = await Promise.all([
    // Embedded via the team_id FK — one round trip, not a third parallel query.
    supabase.from("creator").select("id, name, email, is_active, team:team(id, name)").order("name", { ascending: true }),
    supabase.from("channel").select("id, name, tiktok_handle, current_creator_id").not("current_creator_id", "is", null),
  ]);
  if (error) throw error;
  if (channelsError) throw channelsError;

  const channelsByCreator = new Map<string, { id: string; name: string; tiktokHandle: string }[]>();
  for (const channel of channels ?? []) {
    const creatorId = channel.current_creator_id as string;
    const list = channelsByCreator.get(creatorId) ?? [];
    list.push({ id: channel.id, name: channel.name, tiktokHandle: channel.tiktok_handle });
    channelsByCreator.set(creatorId, list);
  }

  return (creators ?? []).map((creator) => {
    const assigned = channelsByCreator.get(creator.id) ?? [];
    return {
      id: creator.id,
      name: creator.name,
      email: creator.email,
      isActive: creator.is_active,
      channelCount: assigned.length,
      channels: assigned,
      // Embedded via team_id FK; PostgREST returns null, not [], when unassigned — same cast
      // reasoning as `currentCreator` in lib/channels.ts (untyped client, no generated types).
      team: (creator as unknown as { team: { id: string; name: string } | null }).team,
    };
  });
}

async function getCreatorById(supabase: SupabaseServerClient, id: string): Promise<CreatorSummary> {
  const all = await listCreators(supabase);
  const found = all.find((creator) => creator.id === id);
  if (!found) throw new Error(`Creator ${id} không tìm thấy sau khi ghi.`);
  return found;
}

/**
 * Creates the Auth user first, then the `creator` row — `creator.id` IS `auth.users.id` (M1
 * decision, no join-by-email). If the row insert fails, the Auth user is deleted again: leaving it
 * orphaned would make every retry fail with `email_exists` while no `creator` row ever appears.
 * Pattern mirrors `scripts/seed.mjs`'s `ensureAuthUser`.
 */
export async function createCreator(
  supabase: SupabaseServerClient,
  input: CreateCreatorInput,
): Promise<CreatorSummary> {
  const admin = createSupabaseAdminClient();

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true, // internal accounts: nobody is around to click a confirmation link
  });

  if (authError) {
    if (authError.code === "email_exists") {
      throw new ValidationError(`Email ${input.email} đã có tài khoản.`);
    }
    throw authError;
  }

  const { error: insertError } = await supabase.from("creator").insert({
    id: created.user.id,
    name: input.name,
    email: input.email,
    manager_id: input.managerId,
    team_id: input.teamId ?? null,
  });

  if (insertError) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw insertError;
  }

  return getCreatorById(supabase, created.user.id);
}

export async function updateCreator(
  supabase: SupabaseServerClient,
  id: string,
  input: UpdateCreatorInput,
): Promise<CreatorSummary> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  if (input.teamId !== undefined) patch.team_id = input.teamId;

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from("creator").update(patch).eq("id", id);
    if (error) throw error;
  }

  return getCreatorById(supabase, id);
}

/**
 * Hard delete (21/08/2026 follow-up: "xoá thật" chosen over soft-only, Manager-only, type-to-confirm
 * in the UI). Deletes the Auth user, not the `creator` row directly — `creator.id references
 * auth.users(id) on delete cascade` (20260820000001_identity.sql) cascades the row delete for us,
 * mirroring `createCreator`'s auth-user-first pairing in reverse. That cascade also removes this
 * creator's `channel_ownership_history` rows (creator_id ... on delete cascade) — the historical
 * "who ran this channel from X to Y" record is genuinely lost, not archived; the caller's confirm UI
 * must say so. Any channel currently assigned to this creator survives — `channel.current_creator_id`
 * is `on delete set null`, so it just becomes unassigned, never deleted.
 */
export async function deleteCreator(id: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) throw error;
}

/** Manager-initiated password reset — docs/PRODUCT_SPEC.md mục 8 "Chưa chốt" flagged this as
 *  missing (no self-service change, no reset). Same one-time-reveal UX as account creation: the
 *  caller shows the new password exactly once, never stored or re-displayed. */
export async function resetCreatorPassword(id: string, newPassword: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password: newPassword });
  if (error) throw error;
}
