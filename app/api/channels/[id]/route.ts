import { NextResponse, type NextRequest } from "next/server";

import { requireManager } from "@/lib/auth";
import { deleteChannel, listChannels, updateChannel } from "@/lib/channels";
import { errorResponse } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readChannelOauthAccessToken, revokeAfterChannelDeleted } from "@/lib/tiktok/disconnect";
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
        actor: user.username,
        note: `Đổi handle từ ${previousHandle} sang ${tiktokHandle}.`,
      });
    }

    return NextResponse.json(channel);
  } catch (error) {
    return errorResponse(error);
  }
}

// DELETE /api/channels/:id — M. Hard delete (21/08/2026 follow-up, "đầy đủ CRUD") — irreversible,
// see lib/channels.ts's deleteChannel() for exactly what it cascades and the one hard guard (blocks
// if a finalized KPI cycle exists). UI confirms by typing the channel's name
// (app/(app)/confirm-delete-form.tsx); this route has no such UX, so callers must be certain.
// Logged to audit_log the same as the server-action path (app/(app)/channels/actions.ts).
//
// Also revokes the channel's Display API grant on TikTok's side (24/08/2026,
// docs/DISPLAY_API.md bẫy #9 follow-up) — deleting the row alone never did that, so a deleted
// channel's TikTok grant used to sit live forever, and reconnecting later silently reused it with
// no consent screen at all (TikTok's `disable_auto_auth` default). Token is read BEFORE
// deleteChannel() (channel_oauth cascade-deletes with the channel row) but only actually revoked
// AFTER it succeeds — see lib/tiktok/disconnect.ts's ordering note for why that order matters
// (deleteChannel can still refuse if a finalized KPI cycle exists).
export async function DELETE(_request: NextRequest, context: RouteContext<"/api/channels/[id]">) {
  try {
    const user = await requireManager();
    const { id } = await context.params;

    const supabase = await createSupabaseServerClient();
    const admin = createSupabaseAdminClient();

    const accessToken = await readChannelOauthAccessToken(admin, id);
    await deleteChannel(supabase, id);

    await supabase.from("audit_log").insert({
      entity_type: "channel",
      entity_id: id,
      action: "deleted",
      actor: user.username,
      note: null,
    });

    if (accessToken) await revokeAfterChannelDeleted(admin, id, user.username, accessToken);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
