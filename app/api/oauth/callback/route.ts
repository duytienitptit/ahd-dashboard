import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { encryptToken } from "@/lib/crypto/token";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DisplayApiProvider } from "@/lib/tiktok/display-api-provider";
import { decodeOauthStateCookie, exchangeCodeForToken, OAUTH_STATE_COOKIE, TIKTOK_SCOPES } from "@/lib/tiktok/oauth";
import { extractHandleFromVideoLink, normalizeHandle } from "@/lib/tiktok/verify-account";

// GET /api/oauth/callback — public, TikTok redirects the Manager's or Creator's browser here.
// docs/API_SPEC.md. Listed in proxy.ts PUBLIC_PATHS already. Authorization comes from the state
// cookie set by /api/channels/:id/oauth/start (which itself already checked the caller was allowed
// to connect this channel) — this route can't re-check the session, since by the time TikTok
// redirects back the flow is provider-driven, not a normal authenticated page load.
export async function GET(request: NextRequest) {
  const redirectTo = (params: string) => NextResponse.redirect(new URL(`/connections${params}`, request.url));

  const params = request.nextUrl.searchParams;
  const tiktokError = params.get("error");
  if (tiktokError) {
    return clearStateCookie(redirectTo(`?oauthError=${encodeURIComponent(tiktokError)}`));
  }

  const cookieValue = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const decoded = cookieValue ? decodeOauthStateCookie(cookieValue) : null;
  if (!decoded) {
    return clearStateCookie(redirectTo("?oauthError=missing_state"));
  }

  const returnedState = params.get("state");
  if (returnedState !== decoded.state) {
    return clearStateCookie(redirectTo("?oauthError=state_mismatch"));
  }

  // URLSearchParams already URL-decodes `code` — docs/DISPLAY_API.md bẫy #8 (the trailing `*1` breaks
  // easily if this step is skipped).
  const code = params.get("code");
  if (!code) {
    return clearStateCookie(redirectTo("?oauthError=missing_code"));
  }

  try {
    const token = await exchangeCodeForToken(code);
    const supabase = createSupabaseAdminClient();

    const { data: channel, error: channelError } = await supabase
      .from("channel")
      .select("tiktok_handle")
      .eq("id", decoded.channelId)
      .maybeSingle();
    if (channelError) throw channelError;
    if (!channel) return clearStateCookie(redirectTo("?oauthError=channel_not_found"));

    // Wrong-account guard: the browser that clicked "Authorize" may have been logged into a
    // different TikTok account than the channel's own — see lib/tiktok/verify-account.ts. A single
    // lightweight call (not listAllVideos, which paginates and risks the route's timeout).
    //
    // Incident 21/08/2026: this used to only WARN, not block — both connected channels ended up
    // holding the same wrong account's token, and every sync after that silently wrote that
    // account's numbers into data_snapshot. `share_url` reliability was never confirmed in M0, so a
    // false positive is still possible — but the fix for that is an explicit "Vẫn kết nối" retry
    // (the `ack` flag below), not letting every mismatch through by default.
    const firstVideoLink = await new DisplayApiProvider().peekFirstVideoLink(token.accessToken);
    const authorizedHandle = firstVideoLink ? extractHandleFromVideoLink(firstVideoLink) : null;
    const expectedHandle = normalizeHandle(channel.tiktok_handle);
    const accountMismatch = Boolean(authorizedHandle && authorizedHandle !== expectedHandle);

    if (accountMismatch && !decoded.ack) {
      // Nothing written — an unconfirmed mismatch must never reach channel_oauth. The connect
      // button on /connections re-runs oauth/start with ?ack=1 if the human confirms it's correct.
      return clearStateCookie(
        redirectTo(
          `?oauthError=account_mismatch&channelId=${encodeURIComponent(decoded.channelId)}` +
            `&expected=${encodeURIComponent(expectedHandle)}&actual=${encodeURIComponent(authorizedHandle!)}`,
        ),
      );
    }

    // Can't verify at all (TikTok account has zero videos → no share_url to check) — save the
    // token so the connection isn't blocked outright, but account_verified stays false and
    // lib/tiktok/sync.ts refuses to sync it until a human confirms via POST .../oauth/verify.
    const verified = authorizedHandle !== null; // matched (accountMismatch false here) or ack'd override

    // Reconnect case: flag if the authorized account's open_id differs from what was stored before —
    // legitimate if fixing a past mistake, but worth surfacing either way. Read before the upsert
    // below overwrites it.
    const { data: existing } = await supabase
      .from("channel_oauth")
      .select("tiktok_open_id")
      .eq("channel_id", decoded.channelId)
      .maybeSingle();
    const accountChanged = Boolean(existing && existing.tiktok_open_id !== token.openId);

    const { error } = await supabase.from("channel_oauth").upsert(
      {
        channel_id: decoded.channelId,
        tiktok_open_id: token.openId,
        access_token: encryptToken(token.accessToken),
        access_expires_at: token.accessExpiresAt,
        refresh_token: encryptToken(token.refreshToken),
        refresh_expires_at: token.refreshExpiresAt,
        scopes: token.scopeGranted || TIKTOK_SCOPES,
        account_verified: verified,
      },
      { onConflict: "channel_id" },
    );
    if (error) throw error;

    if (accountMismatch && decoded.ack) {
      // Explicit override of the guard above — worth a permanent record, same spirit as any other
      // "someone chose to bypass a safety check" entry.
      const actor = (await getCurrentUser().catch(() => null))?.username ?? "unknown";
      await supabase.from("audit_log").insert({
        entity_type: "channel_oauth",
        entity_id: decoded.channelId,
        action: "connected_override_mismatch",
        actor,
        note: `Xác nhận kết nối dù handle không khớp — kênh mong đợi @${expectedHandle}, tài khoản Authorize @${authorizedHandle}.`,
      });
    }

    if (!verified) {
      return clearStateCookie(redirectTo("?connected=1&warning=unverified"));
    }
    if (accountChanged) {
      return clearStateCookie(redirectTo("?connected=1&warning=account_changed"));
    }

    return clearStateCookie(redirectTo("?connected=1"));
  } catch (error) {
    console.error("TikTok OAuth callback failed:", error);
    return clearStateCookie(redirectTo("?oauthError=token_exchange_failed"));
  }
}

function clearStateCookie(response: NextResponse): NextResponse {
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}
