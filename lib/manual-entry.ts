import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { ValidationError } from "@/lib/validation";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type ManualEntryInput = {
  channelId: string;
  date: string;
  videoViews?: number;
  followers?: number;
  videoCount?: number;
};

export type ManualEntryResult = {
  date: string;
  videoViews: number | null;
  followers: number | null;
  videoCount: number | null;
};

/**
 * "Miếng vá tạm" khi Display API lỗi giữa tuần — docs/DATA_SOURCES.md "Nhập tay khi API lỗi", hẹp
 * có chủ đích: chỉ 3 trường, chỉ Manager (gọi `requireManager()` ở route/action trước khi tới đây,
 * không lặp lại check ở đây vì hàm này cũng phục vụ cả route handler lẫn Server Action).
 *
 * Không cần logic "nhường chỗ" cho `studio_import` — `source_rank()` (docs/DATABASE_ERD.md) đã xếp
 * `manual_entry` thấp nhất, `v_channel_daily` tự động bỏ qua nó ngay khi một nguồn ưu tiên cao hơn
 * xuất hiện cùng ngày. Chỉ set những cột Manager thực sự nhập — không ghi `null` đè lên trường chưa
 * biết, và không đụng tới trường đã có nếu đang sửa một manual_entry cũ (upsert chỉ set cột có mặt
 * trong payload, Postgres giữ nguyên cột vắng mặt khi có xung đột).
 */
export async function createManualEntry(
  supabase: SupabaseServerClient,
  input: ManualEntryInput,
  actor: { id: string; name: string },
): Promise<ManualEntryResult> {
  const { channelId, date, videoViews, followers, videoCount } = input;
  if (videoViews === undefined && followers === undefined && videoCount === undefined) {
    throw new ValidationError("Phải nhập ít nhất một trong: lượt xem, follower, số video.");
  }

  const row: Record<string, unknown> = { channel_id: channelId, date, source: "manual_entry" };
  if (videoViews !== undefined) row.video_views = videoViews;
  if (followers !== undefined) row.followers = followers;
  if (videoCount !== undefined) row.video_count = videoCount;

  const { data, error } = await supabase
    .from("data_snapshot")
    .upsert(row, { onConflict: "channel_id,date,source" })
    .select("id, date, video_views, followers, video_count")
    .single();
  if (error) throw error;

  // Best-effort, not transactional with the upsert above (no multi-statement transaction support
  // over supabase-js without an RPC) — acceptable for a "miếng vá tạm" feature at this scale, but a
  // failure here means an untracked manual entry, worth knowing if audit_log ever comes up empty
  // for a date that clearly has a manual_entry row.
  const { error: auditError } = await supabase.from("audit_log").insert({
    entity_type: "data_snapshot",
    entity_id: data.id,
    action: "manual_entry",
    actor: actor.id,
    note: `${actor.name} nhập tay ngày ${date} cho kênh ${channelId}: videoViews=${videoViews ?? "—"}, followers=${followers ?? "—"}, videoCount=${videoCount ?? "—"}`,
  });
  if (auditError) throw auditError;

  return {
    date: data.date,
    videoViews: data.video_views !== null ? Number(data.video_views) : null,
    followers: data.followers !== null ? Number(data.followers) : null,
    videoCount: data.video_count !== null ? Number(data.video_count) : null,
  };
}
