// Tính lại data_snapshot.video_views bằng công thức mới (B1, 24/08/2026 — docs/DISPLAY_API.md bẫy
// #12/#13) cho những ngày đã bị ghi sai TRƯỚC KHI lib/tiktok/sync.ts được sửa. Không gọi TikTok API
// gì cả — chỉ tính lại từ `video_snapshot` (luỹ kế mỗi ngày) đã lưu sẵn.
//
//   node scripts/backfill-daily-views.mjs                                  (dry-run, KHÔNG ghi gì)
//   node scripts/backfill-daily-views.mjs --confirm                        (ghi thật, mọi ngày tính được)
//   node scripts/backfill-daily-views.mjs --confirm --from=2026-08-23 --to=2026-08-24
//       (giới hạn khoảng ngày — dùng cho đợt dọn 23-24/08/2026 cụ thể; không hard-code ngày trong
//       script để lần sau cần backfill lại vẫn dùng được nguyên)
//
// Công thức (PORT thủ công của lib/tiktok/video-delta.ts computeViewsDelta() — giữ đồng bộ nếu công
// thức gốc đổi, các script chẩn đoán khác trong thư mục này cũng theo quy ước này):
//   view(D) = Σ_video max(0, luỹ_kế(video,D) − luỹ_kế(video,D−1))
// Video không có luỹ_kế(D−1) (không có snapshot ngày liền trước) chỉ được cộng TRỌN nếu
// content_video.posted_at rơi đúng ngày D (thật sự mới đăng hôm đó); còn lại ("thấy muộn" — do
// reconnect, rate limit, hay khoảng trống sync) bị LOẠI khỏi tổng. Ngày (kênh, D) không có snapshot
// nào cho D−1 thì bỏ qua hoàn toàn — không có gì để so, giữ nguyên số cũ thay vì đoán.

import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

// ⚠️ TẠM KHOÁ 24/08/2026 — dry-run chạy thật hôm đó cho thấy script này tính SAI cho dữ liệu ghi bởi
// sync.ts CŨ (trước bản vá B1). Nguyên nhân: sync.ts CŨ ghi 2 cột ngày theo 2 quy ước KHÁC NHAU —
// `video_snapshot.date` = ngày đồng hồ lúc cron chạy, còn `data_snapshot.date` = ngày của LẦN SYNC
// TRƯỚC (qua `determineSyncDate`/`last_sync_at`, đã sửa). Với cron 1 lần/ngày, 2 giá trị này luôn
// lệch nhau đúng 1 ngày — script này giả định 2 cột dùng chung 1 ngày (đúng cho dữ liệu code MỚI ghi,
// sai cho dữ liệu cũ) nên join nhầm cặp snapshot, dán nhãn lùi 1 ngày cho toàn bộ dữ liệu cũ. Xác
// nhận bằng cách so khớp: số recompute cho ngày D khớp TUYỆT ĐỐI với số gốc đã lưu cho ngày D-1, ở cả
// 4/4 kênh bị đổi số — khớp kiểu này không thể là trùng hợp. Số in ra ở dry-run hôm đó KHÔNG dùng
// được. Đừng gỡ khoá dưới cho tới khi hiểu rõ + xác nhận lại cách tính.
//
// Đợt 22-24/08/2026 cụ thể KHÔNG dùng script này để sửa — thay vào đó dùng
// scripts/reset-display-api.mjs xoá sạch rồi để code mới dựng lại từ đầu (đơn giản, không đoán gì;
// chạy thật 24/08/2026 thành công 6/6 kênh). Script này VẪN GIỮ LẠI, chỉ khoá — hữu ích cho sau này
// nếu phát sinh nhu cầu backfill trên dữ liệu đã nhất quán quy ước ngày (viết bởi code MỚI, toàn bộ
// dữ liệu display_api từ 24/08/2026 trở đi), lúc đó bug lệch ngày ở trên không còn áp dụng — nhưng
// vẫn nên tự xác nhận lại (so khớp kiểu D vs D-1 như trên) trước khi tin, đừng chỉ dựa vào ngày tháng.
if (process.argv.includes("--confirm")) {
  console.error(
    "\n⚠️  --confirm đang bị khoá — đọc comment đầu file (giải thích đầy đủ nguyên nhân + cách tự xác nhận lại) trước khi mở lại.\n",
  );
  process.exit(1);
}
const CONFIRM = false;
const fromArg = process.argv.find((a) => a.startsWith("--from="))?.split("=")[1] ?? null;
const toArg = process.argv.find((a) => a.startsWith("--to="))?.split("=")[1] ?? null;
const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";

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

// Supabase trả tối đa 1000 dòng/request và không tự báo bị cắt — cùng lý do diagnose-data.mjs phải
// phân trang mọi truy vấn, script này cũng vậy (video_snapshot dễ vượt 1000 dòng).
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

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function vnDateString(instant) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: VN_TIME_ZONE }).format(instant);
}

function fmt(n) {
  return n === null ? "null" : n.toLocaleString("vi-VN");
}

async function main() {
  console.log(
    CONFIRM
      ? "⚠️  CHẾ ĐỘ GHI THẬT (--confirm) — sẽ update data_snapshot.video_views/is_complete.\n"
      : "Dry-run — chỉ in ra, KHÔNG ghi gì. Thêm --confirm để ghi thật.\n",
  );

  const channels = await fetchAll("channel", "id, name");
  const videos = await fetchAll("content_video", "id, channel_id, posted_at");
  const videoById = new Map(videos.map((v) => [v.id, v]));
  const snapshots = await fetchAll("video_snapshot", "content_video_id, date, view_count");

  // (channel_id, date) -> Map<content_video_id, view_count> — luỹ kế của từng video vào cuối ngày đó.
  const byChannelDate = new Map();
  for (const snap of snapshots) {
    const video = videoById.get(snap.content_video_id);
    if (!video) continue; // video đã bị xoá khỏi content_video từ sau — bỏ qua, không nội suy
    const key = `${video.channel_id}|${snap.date}`;
    if (!byChannelDate.has(key)) byChannelDate.set(key, new Map());
    byChannelDate.get(key).set(snap.content_video_id, snap.view_count ?? 0);
  }

  const allDates = new Set([...byChannelDate.keys()].map((k) => k.split("|")[1]));
  const dates = [...allDates].sort().filter((d) => (!fromArg || d >= fromArg) && (!toArg || d <= toArg));
  console.log(`Xét ${dates.length} ngày có dữ liệu display_api${fromArg || toArg ? ` (giới hạn ${fromArg ?? "…"} → ${toArg ?? "…"})` : ""}: ${dates.join(", ")}\n`);

  const dataSnapshots = await fetchAll("data_snapshot", "channel_id, date, video_views, is_complete", (q) => q.eq("source", "display_api"));
  const currentByKey = new Map(dataSnapshots.map((s) => [`${s.channel_id}|${s.date}`, s]));

  let skippedNoBaseline = 0;
  const writes = [];

  for (const channel of channels) {
    for (const date of dates) {
      const key = `${channel.id}|${date}`;
      const todayMap = byChannelDate.get(key);
      if (!todayMap) continue; // kênh này không sync ngày đó

      const baselineMap = byChannelDate.get(`${channel.id}|${addDays(date, -1)}`);
      if (!baselineMap) {
        skippedNoBaseline += 1;
        continue; // không có gì để so với — giữ nguyên số cũ, không đoán
      }

      let viewsInPeriod = 0;
      let lateDiscovered = 0;

      for (const [videoId, viewCount] of todayMap) {
        const prevViews = baselineMap.get(videoId);
        if (prevViews !== undefined) {
          viewsInPeriod += Math.max(0, viewCount - prevViews);
          continue;
        }
        const postedAt = videoById.get(videoId)?.posted_at;
        const postedDate = postedAt ? vnDateString(new Date(postedAt)) : null;
        if (postedDate === date) {
          viewsInPeriod += viewCount; // thật sự mới đăng đúng ngày này — cộng trọn hợp lệ
        } else {
          lateDiscovered += 1; // thấy muộn — loại khỏi tổng (bẫy #10)
        }
      }

      const gotVideos = todayMap.size;
      const measuredCount = gotVideos - lateDiscovered;
      const noMeasurement = gotVideos > 0 && measuredCount === 0;
      const newVideoViews = noMeasurement ? null : viewsInPeriod;

      const current = currentByKey.get(key);
      const currentViews = current?.video_views ?? null;
      // Chỉ SIẾT is_complete xuống false khi phát hiện video thấy muộn — không tự nới lên true, vì
      // is_complete gốc còn phụ thuộc những thứ script này không tái tạo lại được (video_count từ
      // API lúc đó, isComplete/rateLimited của lần gọi Display API hôm đó).
      const newIsComplete = (current?.is_complete ?? true) && lateDiscovered === 0;

      if (currentViews !== newVideoViews || (current && current.is_complete !== newIsComplete)) {
        writes.push({
          channelId: channel.id,
          channelName: channel.name,
          date,
          beforeViews: currentViews,
          afterViews: newVideoViews,
          beforeComplete: current?.is_complete ?? null,
          afterComplete: newIsComplete,
          lateDiscovered,
        });
      }
    }
  }

  console.log(`Bỏ qua ${skippedNoBaseline} (kênh, ngày) vì thiếu snapshot của ngày liền trước.\n`);

  if (writes.length === 0) {
    console.log("Không có gì cần sửa — số hiện tại đã khớp công thức mới.");
    return;
  }

  console.log(`${writes.length} (kênh, ngày) sẽ đổi số:\n`);
  for (const w of writes) {
    console.log(
      `  ${w.date}  ${w.channelName.padEnd(24)} video_views ${fmt(w.beforeViews)} -> ${fmt(w.afterViews)}` +
        (w.beforeComplete !== w.afterComplete ? `   is_complete ${w.beforeComplete} -> ${w.afterComplete}` : "") +
        (w.lateDiscovered > 0 ? `   (${w.lateDiscovered} video thấy muộn, loại khỏi tổng)` : ""),
    );
  }

  if (!CONFIRM) {
    console.log("\nDry-run — không ghi gì. Chạy lại kèm --confirm để áp dụng thật.");
    return;
  }

  console.log("\nĐang ghi...");
  for (const w of writes) {
    const { error } = await supabase
      .from("data_snapshot")
      .update({ video_views: w.afterViews, is_complete: w.afterComplete })
      .eq("channel_id", w.channelId)
      .eq("date", w.date)
      .eq("source", "display_api");
    if (error) throw error;
  }
  console.log(`Đã ghi xong ${writes.length} dòng.`);
}

main().catch((error) => {
  console.error("\nBackfill thất bại:", error.message ?? error);
  process.exit(1);
});
