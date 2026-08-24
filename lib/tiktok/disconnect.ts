import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/crypto/token";

import { revokeToken } from "./oauth";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Shared by the "Ngắt kết nối" button (app/api/channels/[id]/oauth/disconnect/route.ts) and channel
 * delete (lib/channels.ts's deleteChannel, called from app/api/channels/[id]/route.ts DELETE and
 * app/(app)/channels/actions.ts's deleteChannelAction) — both need the exact same "tell TikTok, then
 * forget the token" sequence, and both used to skip the "tell TikTok" half entirely.
 *
 * Deleting the `channel_oauth` row (or the whole channel, which cascades to it) does NOT revoke
 * anything on TikTok's side — the grant lives on TikTok's server, keyed by (client_key, TikTok
 * account), and has no idea a row in our DB ever existed. Skipping this call is why reconnecting a
 * previously-deleted channel used to silently succeed with zero TikTok interaction at all — the old
 * grant was still live, and TikTok's `disable_auto_auth` default meant no consent screen either.
 *
 * Best-effort BY DESIGN — returns a result instead of throwing. TikTok being unreachable, the token
 * already being expired, or TikTok 5xx-ing is not a reason to block a Manager/Creator from
 * disconnecting or a Manager from deleting a channel; the local row must go either way. The caller
 * decides whether/how to surface a revoke failure.
 */
export async function revokeAndClearChannelOauth(
  admin: AdminClient,
  channelId: string,
  actor: string,
): Promise<{ hadConnection: boolean; revoked: boolean; revokeError: string | null }> {
  const { data: oauthRow, error: readError } = await admin
    .from("channel_oauth")
    .select("access_token")
    .eq("channel_id", channelId)
    .maybeSingle();
  if (readError) throw readError;
  if (!oauthRow) return { hadConnection: false, revoked: false, revokeError: null };

  const revokeResult = await revokeToken(decryptToken(oauthRow.access_token));

  const { error: deleteError } = await admin.from("channel_oauth").delete().eq("channel_id", channelId);
  if (deleteError) throw deleteError;

  await admin.from("audit_log").insert({
    entity_type: "channel_oauth",
    entity_id: channelId,
    action: "disconnected",
    actor,
    note: revokeResult.ok
      ? "Ngắt kết nối, đã gỡ uỷ quyền phía TikTok."
      : `Ngắt kết nối, nhưng gỡ uỷ quyền phía TikTok thất bại: ${revokeResult.error}`,
  });

  return {
    hadConnection: true,
    revoked: revokeResult.ok,
    revokeError: revokeResult.ok ? null : revokeResult.error,
  };
}

// ── Channel-delete path ─────────────────────────────────────────────────────────────────────────
//
// deleteChannel() (lib/channels.ts) cascade-deletes channel_oauth the instant the `channel` row
// goes (0003_channel_oauth.sql: `on delete cascade`), AND it can still refuse to delete at all (a
// finalized KPI cycle blocks it). Those two facts together rule out reusing
// revokeAndClearChannelOauth() around a delete: calling it BEFORE deleteChannel() would revoke a
// live channel's connection the instant delete gets blocked; calling it AFTER would find nothing to
// read (already cascaded away). So the token must be read before, and the actual TikTok-side revoke
// must happen only after deleteChannel() has confirmed the delete is really going through:
//
//   const accessToken = await readChannelOauthAccessToken(admin, id);
//   await deleteChannel(supabase, id);                 // throws → nothing above has any side effect yet
//   if (accessToken) await revokeAfterChannelDeleted(admin, id, actor, accessToken);

/** Read-only — decrypts and returns `channel_oauth.access_token` for `channelId`, or `null` if the
 *  channel was never connected. No side effects; see the ordering note above for why callers must
 *  call this BEFORE deleteChannel(), not after. */
export async function readChannelOauthAccessToken(admin: AdminClient, channelId: string): Promise<string | null> {
  const { data, error } = await admin.from("channel_oauth").select("access_token").eq("channel_id", channelId).maybeSingle();
  if (error) throw error;
  return data ? decryptToken(data.access_token) : null;
}

/** Revokes `accessToken` on TikTok's side (best-effort) and audit-logs it, for a channel whose row —
 *  and its channel_oauth row, via cascade — has ALREADY been deleted. Only call after
 *  deleteChannel() has succeeded; see the ordering note above. */
export async function revokeAfterChannelDeleted(
  admin: AdminClient,
  channelId: string,
  actor: string,
  accessToken: string,
): Promise<void> {
  const revokeResult = await revokeToken(accessToken);
  await admin.from("audit_log").insert({
    entity_type: "channel_oauth",
    entity_id: channelId,
    action: "disconnected",
    actor,
    note: revokeResult.ok
      ? "Kênh bị xoá — đã gỡ uỷ quyền phía TikTok."
      : `Kênh bị xoá — gỡ uỷ quyền phía TikTok thất bại: ${revokeResult.error}`,
  });
}
