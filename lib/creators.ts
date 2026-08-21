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
};

export type CreateCreatorInput = {
  name: string;
  email: string;
  password: string;
  /** The Manager creating the account — becomes `creator.manager_id`. */
  managerId: string;
};

export type UpdateCreatorInput = {
  name?: string;
  isActive?: boolean;
};

/**
 * `docs/API_SPEC.md`'s `GET /api/creators` example doesn't show `channels`, but the M2 Creator
 * screen needs "kênh phụ trách" per Creator (docs/DESIGN_SYSTEM.md / design/Creators.dc.html) —
 * added here; docs/API_SPEC.md updated to match (2026-08-20).
 */
export async function listCreators(supabase: SupabaseServerClient): Promise<CreatorSummary[]> {
  const { data: creators, error } = await supabase
    .from("creator")
    .select("id, name, email, is_active")
    .order("name", { ascending: true });
  if (error) throw error;

  const { data: channels, error: channelsError } = await supabase
    .from("channel")
    .select("id, name, tiktok_handle, current_creator_id")
    .not("current_creator_id", "is", null);
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

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from("creator").update(patch).eq("id", id);
    if (error) throw error;
  }

  return getCreatorById(supabase, id);
}
