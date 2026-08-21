import { NextResponse, type NextRequest } from "next/server";

import { requireManager } from "@/lib/auth";
import { updateChannel } from "@/lib/channels";
import { errorResponse } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optionalBoolean, optionalString, optionalUuid, parseJsonBody } from "@/lib/validation";

// PATCH /api/channels/:id — M. docs/API_SPEC.md
// Changing creatorId is enough — channel_ownership_history is kept in sync by the DB trigger in
// supabase/migrations/20260820000007_ownership_trigger.sql, not by this handler.
export async function PATCH(request: NextRequest, context: RouteContext<"/api/channels/[id]">) {
  try {
    await requireManager();
    const { id } = await context.params;
    const body = await parseJsonBody(request);

    const name = optionalString(body, "name");
    const creatorId = optionalUuid(body, "creatorId");
    const isActive = optionalBoolean(body, "isActive");

    const supabase = await createSupabaseServerClient();
    const channel = await updateChannel(supabase, id, { name, creatorId, isActive });

    return NextResponse.json(channel);
  } catch (error) {
    return errorResponse(error);
  }
}
