import { AuthorizationError } from "@/lib/auth";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { ValidationError } from "@/lib/validation";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type ChannelStats = {
  date: string;
  views: number | null;
  videos: number | null;
  followers: number | null;
  engagementRate: number | null;
  source: string;
  isComplete: boolean;
};

export type ChannelSummary = {
  id: string;
  name: string;
  tiktokHandle: string;
  isActive: boolean;
  createdAt: string;
  currentCreator: { id: string; name: string } | null;
  latestStats: ChannelStats | null;
};

export type CreateChannelInput = {
  name: string;
  tiktokHandle: string;
  creatorId: string | null;
};

export type UpdateChannelInput = {
  name?: string;
  /** Manager-only — see updateChannelName() below for the Creator-safe rename path. Changing this
   *  is worth an audit_log entry: it's the OAuth wrong-account guard's anchor (docs/DISPLAY_API.md,
   *  app/api/oauth/callback/route.ts), so the route handler logs it, not this function. */
  tiktokHandle?: string;
  creatorId?: string | null;
  isActive?: boolean;
};

/** Row shape from `v_channel_daily`/`v_channel_latest` (docs/DATABASE_ERD.md) — reused by
 *  `/api/channels/:id/snapshots` so engagement-rate math lives in exactly one place. */
export function toChannelStats(row: {
  date: string;
  video_views: number | string | null;
  video_count: number | string | null;
  followers: number | string | null;
  likes: number | string | null;
  comments: number | string | null;
  shares: number | string | null;
  source: string;
  is_complete: boolean;
}): ChannelStats {
  const views = row.video_views !== null ? Number(row.video_views) : null;
  const likes = row.likes !== null ? Number(row.likes) : null;
  const comments = row.comments !== null ? Number(row.comments) : null;
  const shares = row.shares !== null ? Number(row.shares) : null;

  // Engagement rate needs a real denominator and all three numerator fields — studio_import may
  // carry views without likes/comments/shares for some rows, and dividing by zero is nonsense.
  const engagementRate =
    views !== null && views > 0 && likes !== null && comments !== null && shares !== null
      ? (likes + comments + shares) / views
      : null;

  return {
    date: row.date,
    views,
    videos: row.video_count !== null ? Number(row.video_count) : null,
    followers: row.followers !== null ? Number(row.followers) : null,
    engagementRate,
    source: row.source,
    isComplete: row.is_complete,
  };
}

/**
 * `docs/API_SPEC.md`'s `GET /api/channels` example doesn't show `isActive`/`createdAt`, but
 * `PATCH /api/channels/:id` already accepts `isActive` — a Manager needs to see current state
 * before toggling it. Added here; docs/API_SPEC.md updated to match (2026-08-20).
 */
export async function listChannels(
  supabase: SupabaseServerClient,
  opts: { creatorId?: string; channelId?: string } = {},
): Promise<ChannelSummary[]> {
  let query = supabase
    .from("channel")
    .select("id, name, tiktok_handle, is_active, created_at, currentCreator:creator(id, name)")
    .order("name", { ascending: true });

  if (opts.creatorId) query = query.eq("current_creator_id", opts.creatorId);
  if (opts.channelId) query = query.eq("id", opts.channelId);

  const { data: channels, error } = await query;
  if (error) throw error;
  if (!channels || channels.length === 0) return [];

  const channelIds = channels.map((c) => c.id);
  const { data: statsRows, error: statsError } = await supabase
    .from("v_channel_latest")
    .select("channel_id, date, video_views, video_count, followers, likes, comments, shares, source, is_complete")
    .in("channel_id", channelIds);
  if (statsError) throw statsError;

  const statsByChannel = new Map((statsRows ?? []).map((row) => [row.channel_id, row]));

  return channels.map((channel) => {
    const stats = statsByChannel.get(channel.id);
    return {
      id: channel.id,
      name: channel.name,
      tiktokHandle: channel.tiktok_handle,
      isActive: channel.is_active,
      createdAt: channel.created_at,
      // Embedded via the current_creator_id FK; PostgREST returns null, not [], when unassigned.
      currentCreator: (channel as unknown as { currentCreator: { id: string; name: string } | null })
        .currentCreator,
      latestStats: stats ? toChannelStats(stats) : null,
    };
  });
}

async function getChannelById(supabase: SupabaseServerClient, id: string): Promise<ChannelSummary> {
  const [channel] = await listChannels(supabase, { channelId: id });
  if (!channel) throw new Error(`Channel ${id} không tìm thấy sau khi ghi.`);
  return channel;
}

/** `Chi tiết kênh`'s "Creator phụ trách từ ngày X" — the currently-open
 *  `channel_ownership_history` row (`to_date IS NULL`), maintained entirely by the DB trigger
 *  (docs/DATABASE_ERD.md). `null` for a channel that has never had a Creator assigned. */
export async function getCurrentOwnershipStart(
  supabase: SupabaseServerClient,
  channelId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("channel_ownership_history")
    .select("from_date")
    .eq("channel_id", channelId)
    .is("to_date", null)
    .maybeSingle();
  if (error) throw error;
  return data?.from_date ?? null;
}

export async function createChannel(
  supabase: SupabaseServerClient,
  input: CreateChannelInput,
): Promise<ChannelSummary> {
  const { data, error } = await supabase
    .from("channel")
    .insert({ name: input.name, tiktok_handle: input.tiktokHandle, current_creator_id: input.creatorId })
    .select("id")
    .single();
  if (error) throw error;

  return getChannelById(supabase, data.id);
}

export async function updateChannel(
  supabase: SupabaseServerClient,
  id: string,
  input: UpdateChannelInput,
): Promise<ChannelSummary> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.tiktokHandle !== undefined) patch.tiktok_handle = input.tiktokHandle;
  // channel_ownership_history is kept in sync by the DB trigger in
  // 20260820000007_ownership_trigger.sql — writing current_creator_id here is enough.
  if (input.creatorId !== undefined) patch.current_creator_id = input.creatorId;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from("channel").update(patch).eq("id", id);
    if (error) throw error;
  }

  return getChannelById(supabase, id);
}

/**
 * Creator-safe rename — routes through the `update_channel_name` SECURITY DEFINER function
 * (20260821000002_creator_edit_channel_name.sql) instead of a direct table update, since RLS on
 * `channel` is Manager-only and can't express "this one column, for the assigned Creator only".
 * The function itself checks `auth.uid() = channel.current_creator_id`, so this must run on a
 * session-bound client (`createSupabaseServerClient()`), never the admin client — otherwise
 * `auth.uid()` inside the function would resolve to nothing and every call would be rejected.
 */
export async function updateChannelName(
  supabase: SupabaseServerClient,
  id: string,
  name: string,
): Promise<ChannelSummary> {
  const { error } = await supabase.rpc("update_channel_name", { p_channel_id: id, p_name: name });
  if (error) {
    // Map the function's own errcodes (20260821000002_creator_edit_channel_name.sql) to the app's
    // error types so the route's generic try/catch still surfaces a real message instead of the
    // errorResponse() fallback's "đã có lỗi xảy ra" for anything it doesn't recognize.
    if (error.code === "42501") throw new AuthorizationError(403, error.message);
    if (error.code === "22023") throw new ValidationError(error.message);
    throw error;
  }
  return getChannelById(supabase, id);
}
