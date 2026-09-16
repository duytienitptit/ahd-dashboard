import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { listChannels } from "@/lib/channels";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { nowVnDateString } from "@/lib/time";

import { DataTabs } from "../../data-tabs";
import { ManualEntryPicker } from "./manual-entry-picker";

// Manager-only — CLAUDE.md: manual_entry là ngoại lệ duy nhất KHÔNG mở cho Creator (khác với import
// file Studio ở tab cạnh bên), người hưởng thưởng không tự khai số tính thưởng. Thêm 21/08/2026 —
// trước đây "+ Nhập tay" chỉ có ở Chi tiết kênh, dưới cùng danh sách video, không ai tìm ra.
export default async function ManualEntryPage() {
  const user = await requireUser();
  if (user.role !== "manager") redirect("/");

  const supabase = await createSupabaseServerClient();
  const channels = await listChannels(supabase);
  const channelOptions = channels.map((c) => ({ id: c.id, name: c.name, tiktokHandle: c.tiktokHandle }));

  return (
    <div className="px-8 py-10">
      <DataTabs isManager />

      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-[-0.6px]">Nhập tay khi API lỗi</h1>
        <p className="mt-1.5 text-[13px] text-ink-3">
          Chỉ dùng khi Display API không lấy được số và cần gấp giữa tuần — số này gắn nhãn &quot;chưa xác
          thực&quot; và tự bị thay khi có Studio import phủ ngày đó.
        </p>
      </div>

      <ManualEntryPicker channels={channelOptions} todayVn={nowVnDateString()} />
    </div>
  );
}
