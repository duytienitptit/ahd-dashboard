import { isDemoAccount, requireUser } from "@/lib/auth";
import { listChannels } from "@/lib/channels";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOauthStatusList } from "@/lib/tiktok/oauth-status";

import { DataTabs } from "../data-tabs";
import { ConnectionsClient } from "./connections-client";

// Lỗi có thông tin cố định, không cần đọc thêm query param nào khác.
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

  // account_mismatch BLOCKS (app/api/oauth/callback/route.ts) — nothing was saved, so this is an
  // error, not a warning on top of a successful connect. Carries enough (channelId + both handles)
  // for ConnectionsClient to offer two ways out: log out of the wrong TikTok account and retry, or —
  // if the channel genuinely renamed on TikTok — update the stored handle then retry. No more "Vẫn
  // kết nối" bypass (removed 24/08/2026): it used to let a confirmed mismatch through on one click,
  // permanently recording an override instead of fixing the one real cause (a stale handle).
  const initialMessage =
    oauthError === "account_mismatch"
      ? {
          type: "mismatch" as const,
          channelId: typeof params.channelId === "string" ? params.channelId : "",
          expected: typeof params.expected === "string" ? params.expected : "?",
          actual: typeof params.actual === "string" ? params.actual : "?",
        }
      : oauthError === "open_id_taken"
        ? {
            type: "error" as const,
            text:
              `Tài khoản TikTok này đã được dùng cho kênh "${typeof params.otherChannel === "string" ? params.otherChannel : "khác"}" ` +
              "rồi — một tài khoản TikTok chỉ nối được đúng một kênh. Kiểm tra lại đang đăng nhập đúng tài khoản của kênh này chưa.",
          }
        : oauthError === "missing_scopes"
          ? {
              type: "error" as const,
              text:
                `Chưa cấp đủ quyền lúc Authorize (thiếu: ${typeof params.missing === "string" ? params.missing : "?"}) — ` +
                "thử lại và tick đủ mọi quyền TikTok yêu cầu.",
            }
          : oauthError === "verify_failed"
            ? {
                type: "error" as const,
                text: "Không đối chiếu được tài khoản TikTok vừa Authorize (có thể do giới hạn tốc độ của TikTok) — thử lại sau ít phút.",
              }
            : oauthError
              ? { type: "error" as const, text: OAUTH_ERROR_MESSAGES[oauthError] ?? `Kết nối thất bại: ${oauthError}` }
              : connected
                ? warning === "unverified"
                  ? {
                      type: "warning" as const,
                      text: "Đã lưu kết nối, nhưng tài khoản TikTok này chưa có video nào nên không tự đối chiếu " +
                        "handle được. Xác nhận thủ công ở dòng \"Chưa xác minh\" bên dưới nếu chắc chắn đúng tài khoản.",
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
      {/* Both roles can reach /import now (21/08/2026, Creator Studio upload) — show the sub-tab
          bar for everyone so it's obvious /import exists, not just Manager. isManager still hides
          the Nhập tay tab from Creator — that one stays a Manager-only exception. */}
      <DataTabs isManager={isManager} />
      <ConnectionsClient
        initialStatus={statusList}
        initialMessage={initialMessage}
        isManager={isManager}
        canWrite={!isDemoAccount(user)}
      />
    </div>
  );
}
