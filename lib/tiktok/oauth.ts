import { randomBytes } from "node:crypto";

import { requireEnv } from "@/lib/env";

// OAuth for the Display API connection specifically — not part of TikTokDataProvider (provider.ts),
// since a vendor-scraping fallback wouldn't have a per-channel consent flow at all.
//
// Every call here mirrors tools/m0-display-api-probe/probe.mjs's `tokenRequest`, already run
// against the real sandbox (docs/DISPLAY_API.md bẫy #6-8: https-only non-localhost redirect URI,
// HTTP 200-with-error-code responses, URL-decoding `code`).

const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

export const TIKTOK_SCOPES = "user.info.basic,user.info.stats,video.list";

export type TokenResponse = {
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
  openId: string;
  scopeGranted: string;
};

type RawTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  open_id: string;
  scope: string;
  error?: string;
  error_description?: string;
};

export function generateOauthState(): string {
  return randomBytes(16).toString("hex");
}

export function buildAuthorizeUrl(state: string): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_key", requireEnv("TIKTOK_CLIENT_KEY"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", TIKTOK_SCOPES);
  url.searchParams.set("redirect_uri", requireEnv("TIKTOK_REDIRECT_URI"));
  url.searchParams.set("state", state);
  return url.toString();
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<RawTokenResponse>;

  if (!res.ok || json.error || !json.access_token || !json.refresh_token) {
    throw new Error(
      `TikTok token request thất bại (HTTP ${res.status}): ${json.error ?? "?"} — ${json.error_description ?? ""}`,
    );
  }

  const now = Date.now();
  return {
    accessToken: json.access_token,
    accessExpiresAt: new Date(now + json.expires_in! * 1000).toISOString(),
    refreshToken: json.refresh_token,
    refreshExpiresAt: new Date(now + json.refresh_expires_in! * 1000).toISOString(),
    openId: json.open_id!,
    scopeGranted: json.scope!,
  };
}

/** Authorization code grant — `code` must already be URL-decoded (docs/DISPLAY_API.md bẫy #8; a
 *  value read via `URLSearchParams` already is). */
export function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  return tokenRequest({
    client_key: requireEnv("TIKTOK_CLIENT_KEY"),
    client_secret: requireEnv("TIKTOK_CLIENT_SECRET"),
    code,
    grant_type: "authorization_code",
    redirect_uri: requireEnv("TIKTOK_REDIRECT_URI"),
  });
}

/** Always persist BOTH tokens this returns, even if refreshToken looks unchanged — TikTok's docs
 *  say it "may" rotate and M0 confirmed it doesn't commit to stability across calls. */
export function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return tokenRequest({
    client_key: requireEnv("TIKTOK_CLIENT_KEY"),
    client_secret: requireEnv("TIKTOK_CLIENT_SECRET"),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

// ── OAuth CSRF state, carried in a short-lived cookie (no DB table) ────────────────────────────

export const OAUTH_STATE_COOKIE = "tiktok_oauth_state";
export const OAUTH_STATE_MAX_AGE_SECONDS = 600; // 10 minutes — plenty to click through TikTok's consent screen

export function encodeOauthStateCookie(state: string, channelId: string): string {
  return Buffer.from(JSON.stringify({ state, channelId })).toString("base64url");
}

export function decodeOauthStateCookie(cookieValue: string): { state: string; channelId: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cookieValue, "base64url").toString("utf8"));
    if (typeof parsed?.state === "string" && typeof parsed?.channelId === "string") {
      return { state: parsed.state, channelId: parsed.channelId };
    }
    return null;
  } catch {
    return null;
  }
}
