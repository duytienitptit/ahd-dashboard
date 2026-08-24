// Chẩn đoán READ-ONLY tình trạng kết nối Display API — trả lời câu hỏi "mấy lỗ hổng tìm thấy
// 24/08/2026 đã kịp làm bẩn dữ liệu production chưa, hay mới chỉ là lý thuyết".
//
//   node scripts/diagnose-oauth.mjs
//
// ⚠️ Script này CHỈ CHẠY SELECT. Không insert/update/delete/upsert bất kỳ dòng nào, không gọi
// TikTok API, không có cờ --confirm. Chạy bao nhiêu lần cũng được.
// ⚠️ Không in access_token/refresh_token. `tiktok_open_id` chỉ in 8 ký tự đầu — đủ để so trùng
// giữa các kênh mà không lộ định danh đầy đủ.
//
// 5 phép kiểm, ứng với 5 lỗ hổng đã chỉ ra:
//   1. Hai kênh dùng chung một tài khoản TikTok  (channel_oauth.tiktok_open_id chưa có UNIQUE)
//   2. Kết nối "chưa xác minh"                    (peekFirstVideoLink nuốt lỗi thành null)
//   3. Scope thực nhận thiếu                      (callback lưu scopeGranted mà không kiểm)
//   4. Video nằm nhầm kênh                        (bằng chứng cứng nhất — handle nằm trong video_link)
//   5. Kênh còn kết nối nhưng đã ngừng có số      (sync fail lặng lẽ)
//
// Phép kiểm 1 và 4 là hai thứ quyết định có áp được migration UNIQUE(tiktok_open_id) hay không:
// nếu đang trùng thật thì migration sẽ fail lúc apply, phải dọn dữ liệu trước.

import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

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

// Cùng regex với lib/tiktok/verify-account.ts — cố ý, để kết quả chẩn đoán khớp đúng cái guard
// trong app nhìn thấy, không phải một cách đọc handle thứ hai.
function extractHandle(link) {
  const match = link.match(/tiktok\.com\/@([^/?]+)/i);
  return match ? match[1].toLowerCase() : null;
}

function normalizeHandle(handle) {
  return handle.trim().toLowerCase().replace(/^@/, "");
}

const REQUIRED_SCOPES = ["user.info.basic", "user.info.stats", "video.list"];

function short(openId) {
  return openId ? `${openId.slice(0, 8)}…` : "—";
}

function heading(text) {
  console.log(`\n${"─".repeat(78)}\n${text}\n${"─".repeat(78)}`);
}

const problems = [];
const blockers = [];

async function main() {
  const { data: channels, error: channelError } = await supabase
    .from("channel")
    .select("id, name, tiktok_handle, is_active")
    .order("name");
  if (channelError) throw channelError;

  // Không select access_token/refresh_token — script này không có lý do gì cần chúng.
  const { data: oauthRows, error: oauthError } = await supabase
    .from("channel_oauth")
    .select("channel_id, tiktok_open_id, scopes, account_verified, refresh_expires_at, last_sync_at, last_sync_status, last_sync_error");
  if (oauthError) throw oauthError;

  const oauthByChannel = new Map(oauthRows.map((row) => [row.channel_id, row]));
  const channelById = new Map(channels.map((c) => [c.id, c]));
  const now = Date.now();

  // ── Tổng quan ───────────────────────────────────────────────────────────────────────────────
  heading("TỔNG QUAN KẾT NỐI");
  console.log(`${channels.length} kênh, ${oauthRows.length} kênh có hàng channel_oauth.\n`);

  for (const channel of channels) {
    const oauth = oauthByChannel.get(channel.id);
    const active = channel.is_active ? "" : "  [ngừng hoạt động]";
    if (!oauth) {
      console.log(`  ✗  ${channel.name}  ${channel.tiktok_handle}${active}\n       chưa kết nối bao giờ (không có hàng channel_oauth)`);
      continue;
    }
    const alive = oauth.refresh_expires_at && new Date(oauth.refresh_expires_at).getTime() > now;
    const days = oauth.refresh_expires_at
      ? Math.round((new Date(oauth.refresh_expires_at).getTime() - now) / 86_400_000)
      : null;
    console.log(
      `  ${alive ? "✓" : "✗"}  ${channel.name}  ${channel.tiktok_handle}${active}\n` +
        `       open_id ${short(oauth.tiktok_open_id)}` +
        `  |  xác minh: ${oauth.account_verified ? "có" : "CHƯA"}` +
        `  |  hạn: ${alive ? `còn ${days} ngày` : "hết/không có"}\n` +
        `       sync gần nhất: ${oauth.last_sync_at ?? "chưa bao giờ"} (${oauth.last_sync_status ?? "—"})` +
        (oauth.last_sync_error ? `\n       lỗi: ${oauth.last_sync_error}` : ""),
    );
  }

  // ── Kiểm 1: hai kênh dùng chung một tài khoản TikTok ────────────────────────────────────────
  heading("KIỂM 1 — Hai kênh dùng chung một tài khoản TikTok?");
  console.log("(đây chính là sự cố 21/08/2026; cũng là thứ chặn migration UNIQUE nếu đang trùng)\n");

  const byOpenId = new Map();
  for (const row of oauthRows) {
    if (!byOpenId.has(row.tiktok_open_id)) byOpenId.set(row.tiktok_open_id, []);
    byOpenId.get(row.tiktok_open_id).push(row.channel_id);
  }
  const duplicates = [...byOpenId.entries()].filter(([, ids]) => ids.length > 1);

  if (duplicates.length === 0) {
    console.log("  ✓ Sạch — mỗi tài khoản TikTok chỉ nằm ở đúng một kênh.");
  } else {
    for (const [openId, channelIds] of duplicates) {
      const names = channelIds.map((id) => channelById.get(id)?.name ?? id).join("  +  ");
      console.log(`  ✗ open_id ${short(openId)} đang nằm ở ${channelIds.length} kênh:  ${names}`);
    }
    problems.push(`${duplicates.length} tài khoản TikTok đang bị dùng chung giữa nhiều kênh`);
    blockers.push("Phải gỡ trùng open_id TRƯỚC khi apply migration UNIQUE(tiktok_open_id)");
  }

  // ── Kiểm 2: kết nối chưa xác minh ───────────────────────────────────────────────────────────
  heading("KIỂM 2 — Kết nối nào đang ở trạng thái CHƯA XÁC MINH?");
  console.log("(peekFirstVideoLink trả null vì bất kỳ lỗi gì cũng rơi vào đây, không riêng 'kênh 0 video')\n");

  const unverified = oauthRows.filter((row) => !row.account_verified);
  if (unverified.length === 0) {
    console.log("  ✓ Không có kết nối nào chưa xác minh.");
  } else {
    for (const row of unverified) {
      const channel = channelById.get(row.channel_id);
      console.log(`  ! ${channel?.name ?? row.channel_id}  ${channel?.tiktok_handle ?? "?"}  (open_id ${short(row.tiktok_open_id)})`);
    }
    console.log("\n  → sync.ts đang TỪ CHỐI đồng bộ mấy kênh này, nên chưa ghi số sai. Nhưng đừng bấm");
    console.log("    \"Xác nhận đúng tài khoản\" cho tới khi biết chắc vì sao nó không tự xác minh được.");
    problems.push(`${unverified.length} kết nối chưa xác minh`);
  }

  // ── Kiểm 3: scope thực nhận ─────────────────────────────────────────────────────────────────
  heading("KIỂM 3 — Scope thực nhận có đủ không?");
  console.log(`(cần đủ: ${REQUIRED_SCOPES.join(", ")})\n`);

  const badScopes = oauthRows
    .map((row) => {
      const granted = (row.scopes ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      return { row, missing: REQUIRED_SCOPES.filter((s) => !granted.includes(s)) };
    })
    .filter((x) => x.missing.length > 0);

  if (badScopes.length === 0) {
    console.log("  ✓ Mọi kết nối đều có đủ 3 scope.");
  } else {
    for (const { row, missing } of badScopes) {
      const channel = channelById.get(row.channel_id);
      console.log(`  ✗ ${channel?.name ?? row.channel_id}  thiếu: ${missing.join(", ")}`);
      console.log(`       đang lưu: "${row.scopes}"`);
    }
    problems.push(`${badScopes.length} kết nối thiếu scope`);
  }

  // ── Kiểm 4: video nằm nhầm kênh ─────────────────────────────────────────────────────────────
  heading("KIỂM 4 — Video có nằm đúng kênh không?");
  console.log("(bằng chứng cứng nhất: video_link luôn chứa handle thật của tài khoản đăng video)\n");

  const { data: videos, error: videoError } = await supabase
    .from("content_video")
    .select("channel_id, video_link, posted_at, first_seen_at");
  if (videoError) throw videoError;

  const handleToChannel = new Map(channels.map((c) => [normalizeHandle(c.tiktok_handle), c]));
  const misplaced = [];
  const orphans = new Map(); // handle lạ → số video
  let unparsable = 0;

  for (const video of videos) {
    const handle = extractHandle(video.video_link);
    if (!handle) {
      unparsable += 1;
      continue;
    }
    const owner = channelById.get(video.channel_id);
    if (owner && normalizeHandle(owner.tiktok_handle) === handle) continue;

    const realChannel = handleToChannel.get(handle);
    if (realChannel) {
      misplaced.push({ handle, from: owner?.name ?? video.channel_id, to: realChannel.name });
    } else {
      orphans.set(handle, (orphans.get(handle) ?? 0) + 1);
    }
  }

  console.log(`  Tổng ${videos.length} video.`);
  if (misplaced.length === 0 && orphans.size === 0) {
    console.log("  ✓ Sạch — mọi video đều nằm đúng kênh của nó.");
  }
  if (misplaced.length > 0) {
    const grouped = new Map();
    for (const m of misplaced) {
      const key = `${m.from} → ${m.to}`;
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }
    console.log(`\n  ✗ ${misplaced.length} video đang nằm nhầm kênh (dữ liệu THẬT, chỉ sai chỗ — gắn lại, đừng xoá):`);
    for (const [key, count] of grouped) console.log(`      ${count} video:  ${key}`);
    problems.push(`${misplaced.length} video nằm nhầm kênh`);
  }
  if (orphans.size > 0) {
    console.log(`\n  ✗ Video của tài khoản KHÔNG thuộc kênh nào trong hệ thống (rác từ OAuth sai tài khoản):`);
    for (const [handle, count] of orphans) console.log(`      @${handle}: ${count} video`);
    problems.push(`${[...orphans.values()].reduce((a, b) => a + b, 0)} video rác của tài khoản lạ`);
  }
  if (unparsable > 0) console.log(`\n  ? ${unparsable} video không đọc được handle từ video_link.`);

  // ── Kiểm 5: kênh còn kết nối nhưng ngừng có số ──────────────────────────────────────────────
  heading("KIỂM 5 — Số liệu display_api gần nhất mỗi kênh");

  const { data: snapshots, error: snapshotError } = await supabase
    .from("data_snapshot")
    .select("channel_id, date, followers, video_views, is_complete")
    .eq("source", "display_api")
    .order("date", { ascending: false });
  if (snapshotError) throw snapshotError;

  const latestByChannel = new Map();
  for (const snap of snapshots) {
    if (!latestByChannel.has(snap.channel_id)) latestByChannel.set(snap.channel_id, snap);
  }

  console.log();
  for (const channel of channels) {
    const snap = latestByChannel.get(channel.id);
    if (!snap) {
      console.log(`  —  ${channel.name}: chưa có snapshot display_api nào`);
      continue;
    }
    const ageDays = Math.round((now - new Date(`${snap.date}T00:00:00+07:00`).getTime()) / 86_400_000);
    const stale = ageDays > 2 ? "  ← CŨ" : "";
    console.log(
      `  ${snap.date} (${ageDays} ngày trước)${stale}  ${channel.name}: ` +
        `${snap.followers ?? "—"} follower, ${snap.video_views ?? "—"} view` +
        (snap.is_complete ? "" : "  [is_complete=false]"),
    );
  }

  // ── Kết luận ────────────────────────────────────────────────────────────────────────────────
  heading("KẾT LUẬN");
  if (problems.length === 0) {
    console.log("  ✓ Không phát hiện dữ liệu bẩn. Mấy lỗ hổng tìm thấy mới chỉ là lý thuyết —");
    console.log("    sửa code là đủ, không cần dọn dữ liệu.");
  } else {
    console.log("  Vấn đề phát hiện được:");
    for (const p of problems) console.log(`    • ${p}`);
  }
  if (blockers.length > 0) {
    console.log("\n  ⚠️ Chặn việc triển khai:");
    for (const b of blockers) console.log(`    • ${b}`);
  }
  console.log();
}

main().catch((error) => {
  console.error("\nChẩn đoán thất bại:", error.message ?? error);
  process.exit(1);
});
