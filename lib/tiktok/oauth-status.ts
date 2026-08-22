import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type ChannelOauthStatus = {
  channelId: string;
  channelName: string;
  connected: boolean;
  refreshExpiresAt: string | null;
  daysUntilExpiry: number | null;
  lastSyncAt: string | null;
  lastSyncStatus: "ok" | "failed" | "rate_limited" | null;
  /** false = TikTok account behind this connection was never confirmed to match the channel's
   *  handle (either not yet checked, or its zero-video account had no share_url to check at all).
   *  lib/tiktok/sync.ts refuses to sync while this is false — shown as a persistent badge, not a
   *  one-time banner, per the 21/08/2026 wrong-account incident (a banner only shown once is
   *  exactly how that went unnoticed). */
  accountVerified: boolean;
};

/**
 * `channel_oauth` has zero RLS policies (migration 0006) — no signed-in role, Manager or Creator,
 * can read it through the normal server client. Callers MUST use `createSupabaseAdminClient()` and
 * MUST have already checked the caller's permission themselves (this function doesn't — see
 * lib/auth.ts). `channelIds`, when given, scopes the result — Creator only sees the channel(s) they
 * are currently assigned, Manager passes nothing and gets every channel.
 */
export async function getOauthStatusList(
  supabase: AdminClient,
  opts: { channelIds?: string[] } = {},
): Promise<ChannelOauthStatus[]> {
  if (opts.channelIds && opts.channelIds.length === 0) return []; // e.g. a Creator with no channel yet

  let channelQuery = supabase.from("channel").select("id, name").order("name", { ascending: true });
  if (opts.channelIds) channelQuery = channelQuery.in("id", opts.channelIds);
  const { data: channels, error } = await channelQuery;
  if (error) throw error;

  const { data: oauthRows, error: oauthError } = await supabase
    .from("channel_oauth")
    .select("channel_id, refresh_expires_at, last_sync_at, last_sync_status, account_verified");
  if (oauthError) throw oauthError;

  const byChannel = new Map((oauthRows ?? []).map((row) => [row.channel_id as string, row]));
  const now = Date.now();

  return (channels ?? []).map((channel) => {
    const oauth = byChannel.get(channel.id);
    const refreshExpiresAt = (oauth?.refresh_expires_at as string | null) ?? null;
    const connected = Boolean(refreshExpiresAt && new Date(refreshExpiresAt).getTime() > now);
    const daysUntilExpiry = refreshExpiresAt
      ? Math.round((new Date(refreshExpiresAt).getTime() - now) / 86_400_000)
      : null;

    return {
      channelId: channel.id,
      channelName: channel.name,
      connected,
      refreshExpiresAt,
      daysUntilExpiry,
      lastSyncAt: (oauth?.last_sync_at as string | null) ?? null,
      lastSyncStatus: (oauth?.last_sync_status as ChannelOauthStatus["lastSyncStatus"]) ?? null,
      accountVerified: Boolean(oauth?.account_verified),
    };
  });
}
