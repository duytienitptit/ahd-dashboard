import { NextResponse, type NextRequest } from "next/server";

import { AuthorizationError, requireWritableUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revokeAndClearChannelOauth } from "@/lib/tiktok/disconnect";

// POST /api/channels/:id/oauth/disconnect — M/C (Creator chỉ kênh mình đang phụ trách), cùng luật
// phân quyền với /oauth/start và /oauth/verify. Ngược lại của /oauth/start: gỡ uỷ quyền phía TikTok
// (best-effort — xem lib/tiktok/disconnect.ts) rồi xoá hàng channel_oauth, để kết nối lại sau này
// đi qua đúng một lượt Authorize thật, không phải grant cũ sống sót âm thầm.
export async function POST(_request: NextRequest, context: RouteContext<"/api/channels/[id]/oauth/disconnect">) {
  try {
    const user = await requireWritableUser();
    const { id: channelId } = await context.params;

    const supabase = await createSupabaseServerClient();
    const { data: channel, error } = await supabase
      .from("channel")
      .select("id, current_creator_id")
      .eq("id", channelId)
      .maybeSingle();
    if (error) throw error;
    if (!channel) return NextResponse.json({ error: "Không tìm thấy kênh." }, { status: 404 });

    if (user.role === "creator" && channel.current_creator_id !== user.id) {
      throw new AuthorizationError(403, "Bạn chỉ ngắt kết nối được kênh mình đang phụ trách.");
    }

    // channel_oauth has zero RLS policies (0006_rls.sql) — service role is the only writer.
    const admin = createSupabaseAdminClient();
    const result = await revokeAndClearChannelOauth(admin, channelId, user.username);
    if (!result.hadConnection) {
      return NextResponse.json({ error: "Kênh này chưa kết nối." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, revoked: result.revoked });
  } catch (error) {
    return errorResponse(error);
  }
}
