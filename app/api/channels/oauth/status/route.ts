import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { listChannels } from "@/lib/channels";
import { errorResponse } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOauthStatusList } from "@/lib/tiktok/oauth-status";

// GET /api/channels/oauth/status — M/C (Creator chỉ kênh mình đang phụ trách). docs/API_SPEC.md
export async function GET() {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();

    if (user.role === "creator") {
      const serverClient = await createSupabaseServerClient();
      const myChannels = await listChannels(serverClient, { creatorId: user.id });
      const status = await getOauthStatusList(admin, { channelIds: myChannels.map((c) => c.id) });
      return NextResponse.json(status);
    }

    const status = await getOauthStatusList(admin);
    return NextResponse.json(status);
  } catch (error) {
    return errorResponse(error);
  }
}
