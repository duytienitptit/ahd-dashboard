import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { listChannels } from "@/lib/channels";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { DataTabs } from "../data-tabs";
import { ImportClient } from "./import-client";

// Manager-only (docs/USER_FLOW.md: nút "Đặt KPI / Chốt sổ / Xuất dữ liệu" ẩn với Creator — import
// nằm cùng nhóm thao tác ghi dữ liệu).
export default async function ImportPage() {
  const user = await requireUser();
  if (user.role !== "manager") redirect("/");

  const supabase = await createSupabaseServerClient();
  const channels = await listChannels(supabase);
  const channelOptions = channels.map((c) => ({ id: c.id, name: c.name, tiktokHandle: c.tiktokHandle }));

  return (
    <div className="px-8 py-10">
      <DataTabs />

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
