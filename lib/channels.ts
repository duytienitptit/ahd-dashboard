import type { createSupabaseServerClient } from "@/lib/supabase/server";

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
