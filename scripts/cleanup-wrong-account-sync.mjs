// Dọn 2 sự cố chồng lên nhau, phát hiện 21/08/2026 — xem CLAUDE.md / docs/DISPLAY_API.md.
//
//   Bug A (OAuth sai tài khoản): cả 2 channel_oauth đang gắn token của CÙNG một tài khoản TikTok lạ
//     (@kidshoppppala, 151 follower, 24 video) — không phải tài khoản thật của kênh nào cả.
//   Bug B (import CSV nhầm kênh, ĐỘC LẬP với bug A): file Studio của vuonvuonvang bị import nhưng
//     chọn nhầm kênh nong.nghiep.xanh.17 ở dropdown — 16 video THẬT của vuonvuonvang đang nằm nhầm
//     channel_id, không phải rác cần xoá.
//
//   node scripts/cleanup-wrong-account-sync.mjs            (mặc định: chỉ in ra, KHÔNG đổi gì)
//   node scripts/cleanup-wrong-account-sync.mjs --confirm   (áp dụng thật)
//
// Cách phân biệt AN TOÀN — không dựa vào first_seen_at (cả import CSV lẫn sync sai tài khoản đều có
// thể xảy ra "hôm nay", timestamp không nói lên video đó thuộc kênh nào). Dựa vào chính `video_link`:
// nó luôn chứa handle TikTok thật của video đó (docs: lib/tiktok/verify-account.ts dùng đúng cách
// này để chặn OAuth sai tài khoản). So handle trích được với `channel.tiktok_handle` của TỪNG kênh
// đang có trong hệ thống:
//   - khớp đúng kênh đang giữ nó                  → để nguyên
//   - khớp một kênh KHÁC trong hệ thống            → GẮN LẠI channel_id cho đúng (không xoá — dữ
//                                                     liệu thật, chỉ sai chỗ)
//   - không khớp kênh nào đang có trong hệ thống    → XOÁ (đây mới thật sự là rác — @kidshoppppala
//                                                     không phải kênh nào trong 8 kênh của team)
//
// Sau đó dọn thêm: data_snapshot ngày hôm nay/source=display_api (số 151 follower sai của cả 2 kênh)
// và channel_oauth của 2 kênh (để "Kết nối" lại từ đầu, đi qua guard chặn sai tài khoản mới).

import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

const BAD_SYNC_DATE = "2026-08-21";
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

/** Same regex as lib/tiktok/verify-account.ts's extractHandleFromVideoLink — kept in sync manually
 *  since this is a standalone .mjs script, not part of the Next.js/TS build. */
function extractHandle(link) {
  const m = link?.match(/tiktok\.com\/@([^/?]+)/i);
  return m ? m[1].trim().toLowerCase().replace(/^@/, "") : null;
}
function normalizeHandle(handle) {
  return handle.trim().toLowerCase().replace(/^@/, "");
}

async function main() {
  console.log(CONFIRM ? "*** ÁP DỤNG THẬT ***" : "*** DRY RUN — sẽ không đổi gì, chỉ in ra ***");
  console.log("");

  // Toàn bộ kênh hiện có trong hệ thống — không chỉ 2 kênh nghi vấn, để nhận diện đúng cả trường
  // hợp video bị gắn nhầm sang một kênh thứ ba nào đó (nếu về sau có nhiều hơn 2 kênh).
  const { data: channels, error: channelsError } = await supabase.from("channel").select("id, tiktok_handle");
  if (channelsError) throw channelsError;

  const handleToChannelId = new Map(channels.map((c) => [normalizeHandle(c.tiktok_handle), c.id]));
  console.log(`Kênh đang có trong hệ thống: ${channels.map((c) => c.tiktok_handle).join(", ")}`);

  const channelIds = channels.map((c) => c.id);
  const { data: videos, error: videosError } = await supabase
    .from("content_video")
    .select("id, tiktok_video_id, video_link, title, channel_id")
    .in("channel_id", channelIds);
  if (videosError) throw videosError;

  const toReassign = []; // { id, tiktokVideoId, title, fromChannelId, toChannelId }
  const toDelete = []; // { id, tiktokVideoId, title, channelId, handle }

  for (const v of videos) {
    const handle = extractHandle(v.video_link);
    const correctChannelId = handle ? handleToChannelId.get(handle) : undefined;

    if (!correctChannelId) {
      // Không khớp bất kỳ kênh nào đang có trong hệ thống — rác thật (vd. @kidshoppppala).
      toDelete.push({ id: v.id, tiktokVideoId: v.tiktok_video_id, title: v.title, channelId: v.channel_id, handle });
    } else if (correctChannelId !== v.channel_id) {
      // Khớp một kênh KHÁC — dữ liệu thật, chỉ đang gắn sai channel_id (Bug B).
      toReassign.push({ id: v.id, tiktokVideoId: v.tiktok_video_id, title: v.title, fromChannelId: v.channel_id, toChannelId: correctChannelId });
    }
    // else: khớp đúng kênh đang giữ nó — để nguyên, không in ra để đỡ rối.
  }

  console.log(`\nVideo cần GẮN LẠI kênh (dữ liệu thật, Bug B — import CSV nhầm kênh): ${toReassign.length}`);
  for (const r of toReassign) {
    const toHandle = channels.find((c) => c.id === r.toChannelId)?.tiktok_handle;
    console.log(`  - ${r.tiktokVideoId} "${(r.title ?? "").slice(0, 50)}" → gắn sang ${toHandle}`);
  }

  console.log(`\nVideo cần XOÁ (không thuộc kênh nào, Bug A — sai tài khoản TikTok): ${toDelete.length}`);
  for (const d of toDelete) {
    console.log(`  - ${d.tiktokVideoId} "${(d.title ?? "").slice(0, 50)}" (handle lạ: @${d.handle ?? "?"})`);
  }
  const toDeleteIds = toDelete.map((d) => d.id);

  let badSnapshotCount = 0;
  if (toDeleteIds.length > 0) {
    const { count, error } = await supabase
      .from("video_snapshot")
      .select("id", { count: "exact", head: true })
      .in("content_video_id", toDeleteIds);
    if (error) throw error;
    badSnapshotCount = count ?? 0;
  }
  console.log(`\nvideo_snapshot của các video sẽ xoá: ${badSnapshotCount} dòng`);

  const { data: badDataSnapshots, error: dsError } = await supabase
    .from("data_snapshot")
    .select("id, channel_id, followers, video_views, video_count")
    .in("channel_id", channelIds)
    .eq("date", BAD_SYNC_DATE)
    .eq("source", "display_api");
  if (dsError) throw dsError;

  console.log(`\ndata_snapshot ngày ${BAD_SYNC_DATE} source=display_api: ${badDataSnapshots.length} dòng`);
  for (const s of badDataSnapshots) {
    console.log(`  - channel ${s.channel_id}: followers=${s.followers} video_views=${s.video_views} video_count=${s.video_count}`);
  }

  const { data: badOauth, error: oauthError } = await supabase
    .from("channel_oauth")
    .select("channel_id, tiktok_open_id, account_verified")
    .in("channel_id", channelIds);
  if (oauthError) throw oauthError;

  console.log(`\nchannel_oauth sẽ xoá (để kết nối lại từ đầu): ${badOauth.length} dòng`);
  for (const o of badOauth) {
    console.log(`  - channel ${o.channel_id}: tiktok_open_id=${o.tiktok_open_id} account_verified=${o.account_verified}`);
  }

  if (!CONFIRM) {
    console.log("\nDry run xong — không có gì bị đổi. Chạy lại kèm --confirm để áp dụng thật.");
    return;
  }

  console.log("\nÁp dụng thật...");

  for (const r of toReassign) {
    const { error } = await supabase.from("content_video").update({ channel_id: r.toChannelId }).eq("id", r.id);
    if (error) throw error;
  }
  console.log(`Đã gắn lại kênh cho ${toReassign.length} video.`);

  if (toDeleteIds.length > 0) {
    const { error } = await supabase.from("video_snapshot").delete().in("content_video_id", toDeleteIds);
    if (error) throw error;
    console.log(`Đã xoá ${badSnapshotCount} dòng video_snapshot.`);

    const { error: delVideosError } = await supabase.from("content_video").delete().in("id", toDeleteIds);
    if (delVideosError) throw delVideosError;
    console.log(`Đã xoá ${toDeleteIds.length} dòng content_video (video của tài khoản sai).`);
  }

  const { error: delDsError } = await supabase
    .from("data_snapshot")
    .delete()
    .in("channel_id", channelIds)
    .eq("date", BAD_SYNC_DATE)
    .eq("source", "display_api");
  if (delDsError) throw delDsError;
  console.log(`Đã xoá ${badDataSnapshots.length} dòng data_snapshot.`);

  const { error: delOauthError } = await supabase.from("channel_oauth").delete().in("channel_id", channelIds);
  if (delOauthError) throw delOauthError;
  console.log(`Đã xoá ${badOauth.length} dòng channel_oauth — các kênh cần "Kết nối" lại từ đầu ở /connections.`);

  console.log("\nXong.");
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
