import { requireUser } from "@/lib/auth";
import { listChannels } from "@/lib/channels";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { DataTabs } from "../data-tabs";
import { ImportClient } from "./import-client";

// M/C — Creator được upload file Studio cho đúng kênh mình đang phụ trách (21/08/2026, theo vận
// hành thực tế đã ghi ở CLAUDE.md; trước đó trang này Manager-only). Nhập tay (manual-entry) vẫn
// chỉ Manager — đó là quyết định khác, không đổi. Enforcement thật ở RLS
// (20260821000004_creator_studio_import.sql), không phải ở check dưới đây.
export default async function ImportPage() {
  const user = await requireUser();
  const isManager = user.role === "manager";

  const supabase = await createSupabaseServerClient();
  const channels = await listChannels(supabase, isManager ? {} : { creatorId: user.id });
  const channelOptions = channels.map((c) => ({ id: c.id, name: c.name, tiktokHandle: c.tiktokHandle }));

  return (
    <div className="px-8 py-10">
      <DataTabs isManager={isManager} />

      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-[-0.6px]">Nhập dữ liệu TikTok Studio</h1>
        <p className="mt-1.5 text-[13px] text-ink-3">
          Chạy thứ Tư hàng tuần cho tuần trước đó · 3-4 file zip mỗi kênh
        </p>
      </div>

      <ImportClient channels={channelOptions} />
    </div>
  );
}
