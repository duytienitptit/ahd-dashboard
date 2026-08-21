import { NextResponse, type NextRequest } from "next/server";

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
    const firstVideoLink = await new DisplayApiProvider().peekFirstVideoLink(token.accessToken);
    const authorizedHandle = firstVideoLink ? extractHandleFromVideoLink(firstVideoLink) : null;
    const expectedHandle = normalizeHandle(channel.tiktok_handle);
    const accountMismatch = Boolean(authorizedHandle && authorizedHandle !== expectedHandle);

    // Reconnect case: flag if the authorized account's open_id differs from what was stored before —
    // legitimate if fixing a past mistake, but worth surfacing either way.
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
      },
      { onConflict: "channel_id" },
    );
    if (error) throw error;

    // Both checks are WARNINGS, not blocks: `share_url` reliability was never confirmed in M0 (only
    // the 4 metric fields were), so a false "mismatch" here — e.g. an unexpected share_url format —
    // must not lock a Manager/Creator out of a legitimate connection. Still save the token; surface
    // the warning so a human can double-check. Mismatch takes priority (more actionable, has the
    // two handles to compare) if somehow both fire at once.
    if (accountMismatch) {
      return clearStateCookie(
        redirectTo(
          `?connected=1&warning=account_mismatch&expected=${encodeURIComponent(expectedHandle)}&actual=${encodeURIComponent(authorizedHandle!)}`,
        ),
      );
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
