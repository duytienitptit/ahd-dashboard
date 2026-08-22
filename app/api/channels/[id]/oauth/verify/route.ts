import { NextResponse, type NextRequest } from "next/server";

import { AuthorizationError, requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// POST /api/channels/:id/oauth/verify — M/C (Creator chỉ kênh mình đang phụ trách).
//
// Manual escape hatch for the one case app/api/oauth/callback/route.ts cannot auto-verify: a TikTok
// account with zero videos has no share_url, so `peekFirstVideoLink` returns null and the connection
// is saved with `account_verified = false` (docs/DISPLAY_API.md). A human who watched the Authorize
// flow happen and knows it was the right account can confirm it here — lib/tiktok/sync.ts refuses to
// sync until this flips true.
export async function POST(_request: NextRequest, context: RouteContext<"/api/channels/[id]/oauth/verify">) {
  try {
    const user = await requireUser();
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
      throw new AuthorizationError(403, "Bạn chỉ xác nhận được kênh mình đang phụ trách.");
    }

    // channel_oauth has zero RLS policies (0006_rls.sql) — service role is the only writer.
    const admin = createSupabaseAdminClient();
    const { error: updateError } = await admin
      .from("channel_oauth")
      .update({ account_verified: true })
      .eq("channel_id", channelId);
    if (updateError) throw updateError;

    await admin.from("audit_log").insert({
      entity_type: "channel_oauth",
      entity_id: channelId,
      action: "manually_verified",
      actor: user.email,
      note: "Xác nhận thủ công — tài khoản TikTok chưa có video nào nên không tự đối chiếu handle được.",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
