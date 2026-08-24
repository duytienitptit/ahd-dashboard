import { NextResponse, type NextRequest } from "next/server";

import { encryptToken } from "@/lib/crypto/token";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DisplayApiProvider } from "@/lib/tiktok/display-api-provider";
import { decodeOauthStateCookie, exchangeCodeForToken, missingScopes, OAUTH_STATE_COOKIE } from "@/lib/tiktok/oauth";
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

    // Scope check BEFORE the wrong-account guard below — TikTok's authorize screen lets the human
    // untick individual scopes. Missing `video.list` means the guard's own peek call is guaranteed
    // to fail, which would otherwise get misread as "verify_failed" instead of the real cause.
    const missing = missingScopes(token.scopeGranted);
    if (missing.length > 0) {
      return clearStateCookie(redirectTo(`?oauthError=missing_scopes&missing=${encodeURIComponent(missing.join(","))}`));
    }

    // Wrong-account guard: the browser that clicked "Authorize" may have been logged into a
    // different TikTok account than the channel's own — see lib/tiktok/verify-account.ts. A single
    // lightweight call (not listAllVideos, which paginates and risks the route's timeout).
    //
    // Incident 21/08/2026: this used to only WARN, not block — both connected channels ended up
    // holding the same wrong account's token, and every sync after that silently wrote that
    // account's numbers into data_snapshot. Fixed 21/08/2026 to block outright on mismatch.
    //
    // Hardened further 24/08/2026 (docs/DISPLAY_API.md bẫy #9 follow-up): `peekFirstVideoLink` used
    // to collapse "the check itself failed" (rate limit, network) and "account genuinely has zero
    // videos" into the same `null` — a failed check silently got treated as unverifiable-but-fine.
    // Now a three-way result, and a failed check blocks the same as a confirmed mismatch would.
    //
    // The old "Vẫn kết nối" bypass (an `ack` flag overriding a confirmed mismatch) is gone — removed
    // 24/08/2026 by request. Its only legitimate real-world cause is `channel.tiktok_handle` being
    // stale (the channel renamed on TikTok), and the correct fix for that is updating the stored
    // handle, not permanently recording an override of a safety check. See app/(app)/connections/
    // connections-client.tsx for the update-handle-then-retry flow this now offers instead.
    const peek = await new DisplayApiProvider().peekFirstVideoLink(token.accessToken);
    if (peek.status === "failed") {
      // Nothing written — an unverifiable connection must never reach channel_oauth silently as
      // "unverified but saved". Surface it as a distinct, retryable error instead.
      return clearStateCookie(redirectTo(`?oauthError=verify_failed&reason=${encodeURIComponent(peek.reason)}`));
    }

    const authorizedHandle = peek.status === "ok" ? extractHandleFromVideoLink(peek.videoLink) : null;
    const expectedHandle = normalizeHandle(channel.tiktok_handle);
    const accountMismatch = Boolean(authorizedHandle && authorizedHandle !== expectedHandle);

    if (accountMismatch) {
      // Nothing written — see the comment block above for why there is no override path anymore.
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
    const verified = authorizedHandle !== null; // peek.status === "ok" and handle matched

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
        scopes: token.scopeGranted,
        account_verified: verified,
        authorized_handle: authorizedHandle ? `@${authorizedHandle}` : null,
        // Reset sync bookkeeping on every (re)connect (docs/DISPLAY_API.md bẫy #13) — otherwise a
        // reconnect after a gap, or with a different TikTok account, keeps the old `last_sync_at`
        // and the next sync attributes its delta to a stale date against a stale baseline instead
        // of correctly bootstrapping. `syncChannel` (lib/tiktok/sync.ts) treats null as bootstrap.
        last_sync_at: null,
        last_sync_status: null,
        last_sync_error: null,
      },
      { onConflict: "channel_id" },
    );
    if (error) {
      // 23505 = unique_violation on channel_oauth_tiktok_open_id_key (0824 migration) — this TikTok
      // account is already the connection for a DIFFERENT channel. Surface which one instead of a
      // generic 500; nothing was written, since the upsert itself is what failed.
      if ((error as { code?: string }).code === "23505") {
        const { data: holder } = await supabase
          .from("channel_oauth")
          .select("channel_id, channel:channel_id(name)")
          .eq("tiktok_open_id", token.openId)
          .maybeSingle();
        const holderName = (holder as unknown as { channel: { name: string } | null } | null)?.channel?.name ?? "một kênh khác";
        return clearStateCookie(redirectTo(`?oauthError=open_id_taken&otherChannel=${encodeURIComponent(holderName)}`));
      }
      throw error;
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
