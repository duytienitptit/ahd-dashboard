import { NextResponse, type NextRequest } from "next/server";

import { AuthorizationError, requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildAuthorizeUrl, encodeOauthStateCookie, generateOauthState, OAUTH_STATE_COOKIE, OAUTH_STATE_MAX_AGE_SECONDS } from "@/lib/tiktok/oauth";

// GET /api/channels/:id/oauth/start — M/C (Creator chỉ kênh mình đang phụ trách). docs/API_SPEC.md
// `?ack=1` — người dùng đã thấy cảnh báo "tài khoản không khớp" ở lần thử trước và bấm "Vẫn kết
// nối". Không tự cho qua ngay ở đây; chỉ mang cờ này sang callback để CHÍNH callback (nơi thật sự
// biết account nào vừa Authorize) quyết định có lưu hay không.
export async function GET(request: NextRequest, context: RouteContext<"/api/channels/[id]/oauth/start">) {
  try {
    const user = await requireUser();
    const { id: channelId } = await context.params;
    const ack = request.nextUrl.searchParams.get("ack") === "1";

    const supabase = await createSupabaseServerClient();
    const { data: channel, error } = await supabase
      .from("channel")
      .select("id, current_creator_id")
      .eq("id", channelId)
      .maybeSingle();
    if (error) throw error;
    if (!channel) return NextResponse.json({ error: "Không tìm thấy kênh." }, { status: 404 });

    if (user.role === "creator" && channel.current_creator_id !== user.id) {
      throw new AuthorizationError(403, "Bạn chỉ kết nối được kênh mình đang phụ trách.");
    }

    const state = generateOauthState();
    const response = NextResponse.json({ url: buildAuthorizeUrl(state) });

    // sameSite: 'lax', not 'strict' — this cookie must survive TikTok's top-level GET redirect back
    // to /api/oauth/callback, which 'strict' would drop.
    response.cookies.set(OAUTH_STATE_COOKIE, encodeOauthStateCookie(state, channelId, ack), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
      path: "/",
    });

    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
