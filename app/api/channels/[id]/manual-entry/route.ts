import { NextResponse, type NextRequest } from "next/server";

import { requireManager } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { createManualEntry } from "@/lib/manual-entry";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optionalNonNegativeInt, parseJsonBody, requireDateString } from "@/lib/validation";

// POST /api/channels/:id/manual-entry — M. docs/API_SPEC.md
export async function POST(request: NextRequest, context: RouteContext<"/api/channels/[id]/manual-entry">) {
  try {
    const manager = await requireManager();
    const { id: channelId } = await context.params;
    const body = await parseJsonBody(request);

    const date = requireDateString(body, "date");
    const videoViews = optionalNonNegativeInt(body, "videoViews");
    const followers = optionalNonNegativeInt(body, "followers");
    const videoCount = optionalNonNegativeInt(body, "videoCount");

    const supabase = await createSupabaseServerClient();
    const result = await createManualEntry(
      supabase,
      { channelId, date, videoViews, followers, videoCount },
      { id: manager.id, name: manager.name },
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
