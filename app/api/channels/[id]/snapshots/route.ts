import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/auth";
import { toChannelStats } from "@/lib/channels";
import { errorResponse } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SELECT_COLUMNS = "date, video_views, video_count, followers, likes, comments, shares, source, is_complete";

// GET /api/channels/:id/snapshots — M/C. docs/API_SPEC.md
// Default reads v_channel_daily (highest-priority source per day); ?source= reads data_snapshot for
// exactly that source instead — the one documented exception to "always read through the view".
export async function GET(request: NextRequest, context: RouteContext<"/api/channels/[id]/snapshots">) {
  try {
    await requireUser();
    const { id: channelId } = await context.params;
    const supabase = await createSupabaseServerClient();

    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    const source = request.nextUrl.searchParams.get("source");

    let query = supabase
      .from(source ? "data_snapshot" : "v_channel_daily")
      .select(SELECT_COLUMNS)
      .eq("channel_id", channelId)
      .order("date", { ascending: true });

    if (source) query = query.eq("source", source);
    if (from) query = query.gte("date", from);
    if (to) query = query.lte("date", to);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json((data ?? []).map(toChannelStats));
  } catch (error) {
    return errorResponse(error);
  }
}
