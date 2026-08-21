import { requireUser } from "@/lib/auth";
import { listChannels } from "@/lib/channels";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOauthStatusList } from "@/lib/tiktok/oauth-status";

import { DataTabs } from "../data-tabs";
import { ConnectionsClient } from "./connections-client";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  missing_state: "Phiên kết nối đã hết hạn, thử lại.",
  state_mismatch: "Phiên kết nối không khớp, thử lại.",
  missing_code: "TikTok không trả về mã uỷ quyền, thử lại.",
  token_exchange_failed: "Đổi mã uỷ quyền lấy token thất bại, thử lại.",
  channel_not_found: "Không tìm thấy kênh.",
};

// M/C — Manager thấy toàn bộ 8 kênh, Creator chỉ thấy (và kết nối được) đúng kênh mình đang phụ
// trách. Creator có sẵn tài khoản TikTok của chính kênh, Manager thì không — để Creator tự Authorize
// thực tế hơn nhiều so với bắt Manager đăng nhập hộ từng tài khoản.
export default async function ConnectionsPage({ searchParams }: PageProps<"/connections">) {
  const user = await requireUser();
  const isManager = user.role === "manager";

  const params = await searchParams;
  const oauthError = typeof params.oauthError === "string" ? params.oauthError : null;
  const connected = params.connected === "1";
  const warning = typeof params.warning === "string" ? params.warning : null;

  // account_mismatch is a WARNING, not a blocking error — the token was still saved (see
  // app/api/oauth/callback/route.ts: `share_url` reliability was never confirmed in M0, so this
  // check must not be able to lock someone out of a legitimate connection).
  const initialMessage = oauthError
    ? { type: "error" as const, text: OAUTH_ERROR_MESSAGES[oauthError] ?? `Kết nối thất bại: ${oauthError}` }
    : connected
      ? warning === "account_mismatch"
        ? {
            type: "warning" as const,
            text: `Đã kết nối, nhưng tài khoản TikTok vừa Authorize (@${params.actual ?? "?"}) có vẻ không khớp
              kênh @${params.expected ?? "?"} — kiểm tra lại, ngắt và kết nối lại đúng tài khoản nếu sai.`,
          }
        : warning === "account_changed"
          ? {
              type: "warning" as const,
              text: "Đã kết nối, nhưng tài khoản TikTok khác với lần kết nối trước — kiểm tra lại nếu không cố ý đổi tài khoản.",
            }
          : { type: "connected" as const, text: "Đã kết nối thành công." }
      : null;

  // requireUser() above resolves the role; getOauthStatusList() itself needs the admin client
  // (channel_oauth has zero RLS policies — not even Manager reads it through the server client).
  const admin = createSupabaseAdminClient();

  const statusList = isManager
    ? await getOauthStatusList(admin)
    : await (async () => {
        const serverClient = await createSupabaseServerClient();
        const myChannels = await listChannels(serverClient, { creatorId: user.id });
        return getOauthStatusList(admin, { channelIds: myChannels.map((c) => c.id) });
      })();

  return (
    <div className="px-8 py-10">
      {isManager ? <DataTabs /> : null}
      <ConnectionsClient initialStatus={statusList} initialMessage={initialMessage} isManager={isManager} />
    </div>
  );
}
