import { randomBytes } from "node:crypto";

import { requireEnv } from "@/lib/env";

// OAuth for the Display API connection specifically — not part of TikTokDataProvider (provider.ts),
// since a vendor-scraping fallback wouldn't have a per-channel consent flow at all.
//
// Every call here mirrors the token-request logic manually verified against the real sandbox during
// M0, before this file existed (docs/DISPLAY_API.md bẫy #6-8: https-only non-localhost redirect URI,
// HTTP 200-with-error-code responses, URL-decoding `code`).

const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const REVOKE_URL = "https://open.tiktokapis.com/v2/oauth/revoke/";

/** Ba scope app này BẮT BUỘC phải có để chạy được: `user.info.stats` cho follower/video_count,
 *  `video.list` cho delta view từng video, `user.info.basic` là điều kiện của hai cái kia. Chỉ 3 cái
 *  này được kiểm chứng thật ở M0 (docs/DISPLAY_API.md) — đừng thêm scope chưa chạy thử vào đây.
 *
 *  Là mảng chứ không phải chuỗi vì callback cần kiểm TỪNG cái một trong `scope` mà TikTok trả về:
 *  màn authorize cho người dùng bỏ tick scope, nên scope được cấp có thể ít hơn scope xin. */
export const TIKTOK_REQUIRED_SCOPES = ["user.info.basic", "user.info.stats", "video.list"] as const;

export const TIKTOK_SCOPES = TIKTOK_REQUIRED_SCOPES.join(",");

/** Scope nào trong `TIKTOK_REQUIRED_SCOPES` KHÔNG có trong chuỗi `scope` TikTok trả về cùng token. */
export function missingScopes(granted: string): string[] {
  const set = new Set(granted.split(",").map((s) => s.trim()).filter(Boolean));
  return TIKTOK_REQUIRED_SCOPES.filter((scope) => !set.has(scope));
}

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
  // `disable_auto_auth=1` = "always displays the authorization page" (Login Kit for Web). Mặc định
  // của TikTok là `0` = "skips the authorization page for valid sessions" — nghĩa là nếu trình duyệt
  // còn session TikTok và tài khoản đó đã từng cấp quyền cho app, TikTok nhảy thẳng về callback kèm
  // `code` mà KHÔNG hiện màn hình nào cả.
  //
  // Mặc định đó hợp lý cho app "một người dùng một tài khoản", nhưng ở đây 9 kênh = 9 tài khoản
  // TikTok khác nhau dùng chung một OAuth client, còn trình duyệt thì chỉ đăng nhập được một tài
  // khoản tại một thời điểm. Không có màn hình nào hiện lên = không có cơ hội nào để người bấm nhận
  // ra mình đang cấp quyền bằng tài khoản của kênh khác — đúng cách sự cố 21/08/2026 xảy ra, và
  // suýt lặp lại 24/08/2026 (docs/DISPLAY_API.md bẫy #9).
  //
  // Lưu ý: cái này KHÔNG bắt đăng nhập lại. Session còn thì màn authorize vẫn hiện sẵn tài khoản đó
  // — nó chỉ đảm bảo có một màn hình để nhìn. Muốn đổi tài khoản vẫn phải đăng xuất tiktok.com.
  url.searchParams.set("disable_auto_auth", "1");
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

/**
 * Gỡ uỷ quyền phía TikTok. Xoá hàng `channel_oauth` KHÔNG làm việc này — grant nằm trên server của
 * TikTok, khoá theo (client_key, tài khoản TikTok), không liên quan gì tới hàng nào trong DB của
 * mình. Không gọi hàm này thì: token cũ vẫn dùng được, app vẫn nằm trong danh sách "ứng dụng đã
 * kết nối" của tài khoản đó, và lần Authorize kế tiếp TikTok vẫn coi là đã có grant.
 *
 * Best-effort có chủ đích — trả về kết quả thay vì throw. Không gỡ được ở phía TikTok (token đã hết
 * hạn, mạng lỗi, TikTok 5xx) không phải lý do để chặn người dùng ngắt kết nối hay xoá kênh: hàng
 * trong DB vẫn phải đi. Caller quyết định có báo gì cho người dùng không.
 *
 * Response thành công là struct RỖNG (không phải `{error: {code: "ok"}}` như Display API) — nên chỗ
 * này không dùng lại được `tokenRequest`, và cũng không kiểm được gì ngoài `error`.
 */
export async function revokeToken(accessToken: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: requireEnv("TIKTOK_CLIENT_KEY"),
        client_secret: requireEnv("TIKTOK_CLIENT_SECRET"),
        token: accessToken,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; error_description?: string };
    if (!res.ok || json.error) {
      return { ok: false, error: `${json.error ?? `HTTP ${res.status}`} — ${json.error_description ?? ""}`.trim() };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ── OAuth CSRF state, carried in a short-lived cookie (no DB table) ────────────────────────────

export const OAUTH_STATE_COOKIE = "tiktok_oauth_state";
export const OAUTH_STATE_MAX_AGE_SECONDS = 600; // 10 minutes — plenty to click through TikTok's consent screen

/** Carried through a cookie (not a request param) because TikTok, not our own app, controls the
 *  redirect back — anything the callback needs has to travel via this cookie or the `state` round
 *  trip.
 *
 *  Từng có thêm cờ `ack` = "người dùng đã thấy cảnh báo sai tài khoản và bấm Vẫn kết nối". Bỏ hẳn
 *  24/08/2026 (theo yêu cầu): xem app/api/oauth/callback/route.ts để biết vì sao bypass là sai
 *  thuốc — nguyên nhân thật duy nhất của mismatch là handle trong DB bị cũ, và cách sửa đúng là
 *  cập nhật `channel.tiktok_handle` chứ không phải lưu vĩnh viễn một mismatch. */
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
