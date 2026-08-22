import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/auth";
import { updateChannelName } from "@/lib/channels";
import { errorResponse } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseJsonBody, requireString } from "@/lib/validation";

// PATCH /api/channels/:id/name — M/C (Creator: chỉ kênh mình đang phụ trách).
//
// Narrow, Creator-safe rename — CLAUDE.md vấn đề #11 (21/08/2026): Creator được sửa "Tên kênh"
// nhưng KHÔNG được sửa handle TikTok (đó là mỏ neo của guard chống sai tài khoản ở
// app/api/oauth/callback/route.ts). Không dùng requireManager() ở đây — bất kỳ ai đăng nhập cũng
// gọi được route này, nhưng lib/channels.ts's updateChannelName() (qua hàm SECURITY DEFINER
// update_channel_name trong Postgres) tự kiểm tra người gọi có đúng là creator đang phụ trách kênh
// đó không, nên một Creator không thể sửa tên kênh của người khác. Manager sửa tên qua
// PATCH /api/channels/:id (đầy đủ hơn: name + handle + creator + isActive).
export async function PATCH(request: NextRequest, context: RouteContext<"/api/channels/[id]/name">) {
  try {
    await requireUser();
    const { id } = await context.params;
    const body = await parseJsonBody(request);
    const name = requireString(body, "name", { max: 200 });

    const supabase = await createSupabaseServerClient();
    const channel = await updateChannelName(supabase, id, name);

    return NextResponse.json(channel);
  } catch (error) {
    return errorResponse(error);
  }
}
