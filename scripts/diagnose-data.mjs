// Chẩn đoán READ-ONLY chất lượng SỐ LIỆU (đợt 2 — bổ sung cho diagnose-oauth.mjs, vốn chỉ soi kết nối).
//
//   node scripts/diagnose-data.mjs
//
// ⚠️ Chỉ chạy SELECT. Không insert/update/delete, không gọi TikTok API, không có cờ --confirm.
//
// Trả lời 5 câu hỏi mà đợt 1 để hở:
//   A. Số hôm nay có phải outlier so với chính lịch sử kênh đó không?
//   B. `video_views` hôm nay có phải là VIEW LUỸ KẾ TRỌN ĐỜI bị rò ra không?
//      (nghi vấn chính: "Làm Nông Thông Thái 96.528 view" trong khi kênh vừa kết nối hôm nay)
//   C. Có ngày nào bị thủng — kênh đang chạy mà không có snapshot không?
//   D. display_api có ghi đè lên vùng chốt sổ của studio_import không?
//   E. Video có mốc thời gian vô lý không (posted_at tương lai / null)?
//
// Vì sao B quan trọng: sync đầu tiên của một kênh (bootstrap) cố ý ghi video_views = null, vì lúc đó
// mọi video đều "mới" nên tổng delta = view trọn đời, không phải view trong ngày (lib/tiktok/sync.ts
// dòng 194-198). Nhưng cái null đó chỉ được đặt khi `channel_oauth.last_sync_at IS NULL`. Kênh nào
// từng sync rồi mới kết nối lại thì `last_sync_at` vẫn còn nguyên (callback không reset nó) → sync kế
// tiếp KHÔNG tính là bootstrap, và nếu baseline không khớp thì view trọn đời rò thẳng vào số 1 ngày.

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

// Supabase trả tối đa 1000 dòng/request và KHÔNG báo là đã cắt. video_snapshot dễ vượt ngưỡng đó
// (250 video x 30 ngày), nên mọi truy vấn ở đây phải phân trang — nếu không, chính script chẩn đoán
// lại là thứ đọc thiếu dữ liệu rồi kết luận sai.
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

function heading(text) {
  console.log(`\n${"─".repeat(80)}\n${text}\n${"─".repeat(80)}`);
}

function num(value) {
  return value === null || value === undefined ? "—" : value.toLocaleString("vi-VN");
}

const findings = [];

async function main() {
  const channels = await fetchAll("channel", "id, name, tiktok_handle, is_active", (q) => q.order("name"));
  const channelById = new Map(channels.map((c) => [c.id, c]));

  const snapshots = await fetchAll("data_snapshot", "channel_id, date, source, followers, video_views, video_count, is_complete", (q) =>
    q.order("date", { ascending: false }).order("channel_id"),
  );

  const videos = await fetchAll("content_video", "id, channel_id, posted_at, video_link", (q) => q.order("id"));
  const videoById = new Map(videos.map((v) => [v.id, v]));

  const videoSnapshots = await fetchAll("video_snapshot", "content_video_id, date, view_count", (q) =>
    q.order("date", { ascending: false }).order("content_video_id"),
  );

  console.log(
    `Đã đọc: ${channels.length} kênh, ${snapshots.length} data_snapshot, ${videos.length} video, ` +
      `${videoSnapshots.length} video_snapshot.`,
  );

  // ── A. Lịch sử 14 ngày mỗi kênh ─────────────────────────────────────────────────────────────
  heading("A — Lịch sử display_api 14 ngày gần nhất (followersDiff tự tính, theo CLAUDE.md)");

  for (const channel of channels) {
    const rows = snapshots
      .filter((s) => s.channel_id === channel.id && s.source === "display_api")
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14);

    console.log(`\n  ${channel.name}  ${channel.tiktok_handle}`);
    if (rows.length === 0) {
      console.log("      (chưa có snapshot display_api nào)");
      continue;
    }

    let previousFollowers = null;
    for (const row of rows) {
      const diff = previousFollowers === null || row.followers === null ? null : row.followers - previousFollowers;
      const diffText = diff === null ? "" : `  (${diff >= 0 ? "+" : ""}${num(diff)})`;
      const flags = [];
      if (!row.is_complete) flags.push("is_complete=false");
      if (diff !== null && diff < 0) flags.push("FOLLOWER GIẢM");
      console.log(
        `      ${row.date}   follower ${num(row.followers).padStart(9)}${diffText.padEnd(12)}` +
          `view ${num(row.video_views).padStart(10)}   video ${num(row.video_count).padStart(4)}` +
          (flags.length ? `   ⚠ ${flags.join(", ")}` : ""),
      );
      if (row.followers !== null) previousFollowers = row.followers;
    }
  }

  // ── B. video_views có phải view trọn đời bị rò không ────────────────────────────────────────
  heading("B — `video_views` hôm nay có phải VIEW TRỌN ĐỜI bị rò ra không?");
  console.log("(so số ghi cho 1 ngày với tổng view luỹ kế trọn đời của toàn bộ video kênh đó)\n");

  // View luỹ kế mới nhất của từng video (video_snapshot.view_count là LUỸ KẾ TRỌN ĐỜI, không phải
  // view trong ngày — xem comment cột trong migration 0002).
  const latestViewByVideo = new Map();
  for (const snap of videoSnapshots) {
    if (latestViewByVideo.has(snap.content_video_id)) continue; // đã sort date desc
    latestViewByVideo.set(snap.content_video_id, snap.view_count ?? 0);
  }

  const lifetimeByChannel = new Map();
  for (const [videoId, views] of latestViewByVideo) {
    const video = videoById.get(videoId);
    if (!video) continue;
    lifetimeByChannel.set(video.channel_id, (lifetimeByChannel.get(video.channel_id) ?? 0) + views);
  }

  for (const channel of channels) {
    const latest = snapshots.find((s) => s.channel_id === channel.id && s.source === "display_api" && s.video_views !== null);
    const lifetime = lifetimeByChannel.get(channel.id) ?? 0;
    if (!latest) {
      console.log(`  —  ${channel.name}: chưa có ngày nào ghi được video_views`);
      continue;
    }
    const ratio = lifetime > 0 ? (latest.video_views / lifetime) * 100 : null;
    let verdict = "bình thường";
    if (ratio === null) verdict = "không đối chiếu được (chưa có video_snapshot)";
    else if (ratio >= 90) verdict = "❌ GẦN BẰNG TRỌN ĐỜI — gần như chắc chắn là rò bootstrap";
    else if (ratio >= 40) verdict = "⚠ ĐÁNG NGỜ — cao bất thường cho 1 ngày";

    console.log(
      `  ${channel.name}\n` +
        `      ngày ${latest.date}: ghi ${num(latest.video_views)} view cho 1 ngày\n` +
        `      view trọn đời cả kênh: ${num(lifetime)}` +
        (ratio === null ? "" : `   →  ${ratio.toFixed(1)}% của trọn đời`) +
        `\n      → ${verdict}`,
    );
    if (ratio !== null && ratio >= 40) {
      findings.push(`${channel.name}: video_views ngày ${latest.date} bằng ${ratio.toFixed(0)}% view trọn đời`);
    }
  }

  // ── C. Ngày bị thủng ────────────────────────────────────────────────────────────────────────
  heading("C — Ngày bị thủng (kênh đang chạy nhưng thiếu snapshot)");

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  for (const channel of channels) {
    const dates = new Set(
      snapshots.filter((s) => s.channel_id === channel.id && s.source === "display_api").map((s) => s.date),
    );
    if (dates.size === 0) continue;

    const sorted = [...dates].sort();
    const first = sorted[0];
    const gaps = [];
    for (let d = new Date(`${first}T00:00:00Z`); ; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      if (iso > today) break;
      if (!dates.has(iso)) gaps.push(iso);
    }
    console.log(
      `  ${channel.name}: có số từ ${first} → ${sorted[sorted.length - 1]} (${dates.size} ngày)` +
        (gaps.length ? `\n      ⚠ thiếu ${gaps.length} ngày: ${gaps.join(", ")}` : "  ✓ không thủng"),
    );
    if (gaps.length > 0) findings.push(`${channel.name}: thiếu ${gaps.length} ngày display_api`);
  }

  // ── D. display_api đè lên studio_import ─────────────────────────────────────────────────────
  heading("D — Cùng một ngày có nhiều nguồn?");
  console.log("(không phải lỗi — v_channel_daily tự chọn theo thứ tự ưu tiên. Chỉ để biết đang có gì)\n");

  const bySourceKey = new Map();
  for (const snap of snapshots) {
    const key = `${snap.channel_id}|${snap.date}`;
    if (!bySourceKey.has(key)) bySourceKey.set(key, []);
    bySourceKey.get(key).push(snap.source);
  }
  const multi = [...bySourceKey.entries()].filter(([, sources]) => sources.length > 1);
  if (multi.length === 0) {
    console.log("  Mỗi (kênh, ngày) chỉ có đúng 1 nguồn — chưa có studio_import nào chồng lên display_api.");
  } else {
    const counts = new Map();
    for (const [key, sources] of multi) {
      const channelId = key.split("|")[0];
      const label = `${channelById.get(channelId)?.name ?? channelId}: ${[...sources].sort().join(" + ")}`;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    for (const [label, count] of counts) console.log(`  ${count} ngày —  ${label}`);
  }

  // ── E. Mốc thời gian video ──────────────────────────────────────────────────────────────────
  heading("E — Video có mốc thời gian vô lý không?");

  const nowMs = Date.now();
  const future = videos.filter((v) => v.posted_at && new Date(v.posted_at).getTime() > nowMs);
  const missing = videos.filter((v) => !v.posted_at);
  const noSnapshot = videos.filter((v) => !latestViewByVideo.has(v.id));

  console.log(`  Video có posted_at ở TƯƠNG LAI: ${future.length}`);
  for (const v of future.slice(0, 5)) console.log(`      ${v.posted_at}  ${v.video_link}`);
  console.log(`  Video thiếu posted_at: ${missing.length}`);
  console.log(`  Video chưa có video_snapshot nào: ${noSnapshot.length}`);

  console.log("\n  Số video mỗi kênh:");
  for (const channel of channels) {
    const count = videos.filter((v) => v.channel_id === channel.id).length;
    const latest = snapshots.find((s) => s.channel_id === channel.id && s.source === "display_api");
    const apiCount = latest?.video_count ?? null;
    const mismatch = apiCount !== null && apiCount !== count;
    console.log(
      `      ${String(count).padStart(4)} video  ${channel.name}` +
        (apiCount === null ? "" : `   (video_count từ API: ${apiCount})`) +
        (mismatch ? "   ⚠ LỆCH" : ""),
    );
    if (mismatch) findings.push(`${channel.name}: content_video ${count} ≠ video_count API ${apiCount}`);
  }
  if (future.length > 0) findings.push(`${future.length} video có posted_at ở tương lai`);

  // ── Kết luận ────────────────────────────────────────────────────────────────────────────────
  heading("KẾT LUẬN");
  if (findings.length === 0) {
    console.log("  ✓ Không thấy bất thường trong số liệu.\n");
  } else {
    console.log("  Cần xem kỹ:");
    for (const f of findings) console.log(`    • ${f}`);
    console.log();
  }
}

main().catch((error) => {
  console.error("\nChẩn đoán thất bại:", error.message ?? error);
  process.exit(1);
});
