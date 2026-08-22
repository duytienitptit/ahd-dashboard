import { NextResponse, type NextRequest } from "next/server";

import { requireManager } from "@/lib/auth";
import { listChannels, updateChannel } from "@/lib/channels";
import { errorResponse } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeTiktokHandle, optionalBoolean, optionalString, optionalUuid, parseJsonBody } from "@/lib/validation";

// PATCH /api/channels/:id — M. docs/API_SPEC.md
// Changing creatorId is enough — channel_ownership_history is kept in sync by the DB trigger in
// supabase/migrations/20260820000007_ownership_trigger.sql, not by this handler.
//
// tiktokHandle is Manager-only (CLAUDE.md vấn đề #11) — Creator renames go through the separate
// PATCH .../name route below, which only ever touches `name`. Logged to audit_log when it changes:
// it's the anchor app/api/oauth/callback/route.ts's wrong-account guard checks against, so a silent
// change here would silently weaken that guard for the next reconnect.
export async function PATCH(request: NextRequest, context: RouteContext<"/api/channels/[id]">) {
  try {
    const user = await requireManager();
    const { id } = await context.params;
    const body = await parseJsonBody(request);

    const name = optionalString(body, "name");
    const rawHandle = optionalString(body, "tiktokHandle");
    const tiktokHandle = rawHandle !== undefined ? normalizeTiktokHandle(rawHandle) : undefined;
    const creatorId = optionalUuid(body, "creatorId");
    const isActive = optionalBoolean(body, "isActive");

    const supabase = await createSupabaseServerClient();

    let previousHandle: string | null = null;
    if (tiktokHandle !== undefined) {
      const [existing] = await listChannels(supabase, { channelId: id });
      previousHandle = existing?.tiktokHandle ?? null;
    }

    const channel = await updateChannel(supabase, id, { name, tiktokHandle, creatorId, isActive });

    if (tiktokHandle !== undefined && previousHandle !== null && previousHandle !== tiktokHandle) {
      await supabase.from("audit_log").insert({
        entity_type: "channel",
        entity_id: id,
        action: "tiktok_handle_changed",
        actor: user.email,
        note: `Đổi handle từ ${previousHandle} sang ${tiktokHandle}.`,
      });
    }

    return NextResponse.json(channel);
  } catch (error) {
    return errorResponse(error);
  }
}
