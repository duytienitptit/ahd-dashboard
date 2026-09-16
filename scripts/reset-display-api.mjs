// Reset sạch tầng dữ liệu Display API cho MỌI kênh đang kết nối (24/08/2026) — theo yêu cầu, sau khi
// scripts/backfill-daily-views.mjs phát hiện sync.ts CŨ ghi `video_snapshot.date` và
// `data_snapshot.date` theo 2 quy ước ngày KHÁC NHAU (chi tiết đầy đủ + cách phát hiện: xem comment
// đầu scripts/backfill-daily-views.mjs), nên dữ liệu display_api hiện có không dựng lại đúng được mà
// không đoán — nhất là ngày 24/08 có nhiều lần "Chạy đồng bộ ngay" thủ công đè lên nhau. Thay vì cố
// sửa dữ liệu cũ, xoá sạch tầng TẠM TÍNH này và để code mới (B1, đã sửa trong lib/tiktok/sync.ts) dựng
// lại từ đầu, sạch và không mơ hồ.
//
//   node scripts/reset-display-api.mjs            (mặc định: chỉ in ra, KHÔNG đổi gì)
//   node scripts/reset-display-api.mjs --confirm   (áp dụng thật: revoke TikTok + xoá DB)
//
// Với MỖI kênh đang có hàng channel_oauth (bất kể có bị lỗi lệch ngày hay không — người dùng chọn
// reset đồng loạt để mọi kênh cùng một điểm xuất phát sạch):
//   1. Gọi POST /v2/oauth/revoke/ thật (best-effort, không chặn nếu lỗi) — gỡ uỷ quyền phía TikTok,
//      không chỉ xoá hàng trong DB. Không làm bước này thì grant cũ vẫn sống bên TikTok và lần kết
//      nối lại sẽ không hiện màn Authorize (đúng thứ đã sửa ở buildAuthorizeUrl, đừng để hổng lại).
//   2. Xoá hàng `channel_oauth` — kênh về trạng thái "chưa kết nối", phải bấm Kết nối + Authorize
//      thật lại từ `/connections`.
//   3. Xoá `data_snapshot` CHỈ nơi `source = 'display_api'` — KHÔNG đụng `studio_import`/
//      `manual_entry` của cùng kênh/ngày (khác dòng, theo unique constraint (channel_id,date,source)).
//   4. Xoá `content_video` của kênh — `video_snapshot` cascade xoá theo (FK `on delete cascade`,
//      0002_data.sql), không cần xoá riêng.
//   Không đụng `follower_activity`/`audience_snapshot` — 2 bảng đó chỉ Studio ghi, không liên quan
//   Display API.
//
// Mỗi kênh ghi 1 dòng `audit_log` (actor = tên script này, không phải người dùng cụ thể — đây là
// thao tác chạy tay qua script, không qua UI).

import { createDecipheriv } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

const CONFIRM = process.argv.includes("--confirm");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Thiếu biến môi trường ${name} trong .env.local.`);
    process.exit(1);
  }
  return value;
}

const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Port của lib/crypto/token.ts decryptToken() — script .mjs thuần không import được module TS.
function decryptToken(payload) {
  const [version, iv, authTag, ciphertext] = payload.split(":");
  if (version !== "v1" || !iv || !authTag || !ciphertext) {
    throw new Error("Malformed encrypted token payload.");
  }
  const key = Buffer.from(requireEnv("TOKEN_ENCRYPTION_KEY"), "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}

// Port của lib/tiktok/oauth.ts revokeToken() — best-effort, không throw.
async function revokeToken(accessToken) {
  try {
    const res = await fetch("https://open.tiktokapis.com/v2/oauth/revoke/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: requireEnv("TIKTOK_CLIENT_KEY"),
        client_secret: requireEnv("TIKTOK_CLIENT_SECRET"),
        token: accessToken,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      return { ok: false, error: `${json.error ?? `HTTP ${res.status}`} — ${json.error_description ?? ""}`.trim() };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message ?? String(error) };
  }
}

async function fetchAll(table, select, apply = (q) => q) {
  const PAGE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await apply(supabase.from(table).select(select)).range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function countRows(table, apply) {
  const { count, error } = await apply(supabase.from(table).select("id", { count: "exact", head: true }));
  if (error) throw error;
  return count ?? 0;
}

async function main() {
  console.log(CONFIRM ? "⚠️  CHẾ ĐỘ THẬT (--confirm) — sẽ gọi TikTok revoke thật và xoá dữ liệu.\n" : "Dry-run — chỉ in ra, KHÔNG đổi gì. Thêm --confirm để áp dụng thật.\n");

  // Không select `authorized_handle` — cột đó chỉ tồn tại sau migration 20260824000001, và script
  // này phải chạy được bất kể migration đã áp hay chưa (chỉ dùng để hiện tên kênh trong dry-run).
  const oauthRows = await fetchAll("channel_oauth", "channel_id, access_token");
  if (oauthRows.length === 0) {
    console.log("Không có kênh nào đang kết nối — không có gì để reset.");
    return;
  }

  const channels = await fetchAll("channel", "id, name, tiktok_handle", (q) => q.in("id", oauthRows.map((r) => r.channel_id)));
  const channelById = new Map(channels.map((c) => [c.id, c]));

  console.log(`${oauthRows.length} kênh đang kết nối — sẽ reset TOÀN BỘ:\n`);

  const plan = [];
  for (const oauth of oauthRows) {
    const channel = channelById.get(oauth.channel_id);
    const videoCount = await countRows("content_video", (q) => q.eq("channel_id", oauth.channel_id));
    const snapshotRows = await fetchAll("data_snapshot", "date", (q) => q.eq("channel_id", oauth.channel_id).eq("source", "display_api"));
    const dates = snapshotRows.map((r) => r.date).sort();

    plan.push({ channelId: oauth.channel_id, accessToken: oauth.access_token, channel, videoCount, dates });

    console.log(`  ${channel?.name ?? oauth.channel_id}  (${channel?.tiktok_handle ?? "?"})`);
    console.log(`      ngắt kết nối`);
    console.log(`      xoá ${videoCount} content_video (+ video_snapshot cascade theo)`);
    console.log(`      xoá ${dates.length} dòng data_snapshot(display_api): ${dates.join(", ") || "(không có)"}`);
  }

  if (!CONFIRM) {
    console.log("\nDry-run — không đổi gì. Chạy lại kèm --confirm để áp dụng thật.");
    return;
  }

  console.log("\nĐang xử lý...");
  for (const item of plan) {
    const name = item.channel?.name ?? item.channelId;
    console.log(`\n${name}:`);

    const revokeResult = await revokeToken(decryptToken(item.accessToken));
    console.log(`  revoke TikTok: ${revokeResult.ok ? "OK" : `thất bại — ${revokeResult.error} (vẫn tiếp tục xoá DB)`}`);

    const { error: oauthError } = await supabase.from("channel_oauth").delete().eq("channel_id", item.channelId);
    if (oauthError) throw oauthError;

    const { error: snapshotError } = await supabase
      .from("data_snapshot")
      .delete()
      .eq("channel_id", item.channelId)
      .eq("source", "display_api");
    if (snapshotError) throw snapshotError;

    const { error: videoError } = await supabase.from("content_video").delete().eq("channel_id", item.channelId);
    if (videoError) throw videoError;

    await supabase.from("audit_log").insert({
      entity_type: "channel_oauth",
      entity_id: item.channelId,
      action: "disconnected",
      actor: "scripts/reset-display-api.mjs",
      note: revokeResult.ok
        ? "Reset thủ công (video_snapshot/data_snapshot của sync.ts cũ lệch quy ước ngày, không dựng lại được) — đã gỡ uỷ quyền phía TikTok, xoá sạch dữ liệu display_api để dựng lại từ đầu bằng code mới."
        : `Reset thủ công — gỡ uỷ quyền phía TikTok THẤT BẠI: ${revokeResult.error}. Dữ liệu display_api trong DB đã xoá; grant cũ có thể vẫn còn sống bên TikTok.`,
    });

    console.log(`  Đã xoá xong: channel_oauth, ${item.videoCount} content_video, ${item.dates.length} data_snapshot(display_api).`);
  }

  console.log("\nHoàn tất. Vào /connections bấm \"Kết nối\" lại cho từng kênh — nhớ đăng xuất tiktok.com giữa mỗi lần.");
}

main().catch((error) => {
  console.error("\nReset thất bại:", error.message ?? error);
  process.exit(1);
});
