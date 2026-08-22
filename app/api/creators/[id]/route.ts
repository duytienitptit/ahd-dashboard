import { NextResponse, type NextRequest } from "next/server";

import { requireManager } from "@/lib/auth";
import { deleteCreator, updateCreator } from "@/lib/creators";
import { errorResponse } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optionalBoolean, optionalString, optionalUuid, parseJsonBody } from "@/lib/validation";

// PATCH /api/creators/:id — M. Not in the original docs/API_SPEC.md — added for M2 so a Manager can
// rename or disable a Creator account (e.g. someone leaving the team) without touching Supabase
// directly. Hard delete lives in DELETE below (21/08/2026). docs/API_SPEC.md updated to match.
export async function PATCH(request: NextRequest, context: RouteContext<"/api/creators/[id]">) {
  try {
    await requireManager();
    const { id } = await context.params;
    const body = await parseJsonBody(request);

    const name = optionalString(body, "name");
    const isActive = optionalBoolean(body, "isActive");
    const teamId = optionalUuid(body, "teamId");

    const supabase = await createSupabaseServerClient();
    const creator = await updateCreator(supabase, id, { name, isActive, teamId });

    return NextResponse.json(creator);
  } catch (error) {
    return errorResponse(error);
  }
}

// DELETE /api/creators/:id — M. Hard delete (21/08/2026 follow-up, "đầy đủ CRUD") — irreversible,
// see lib/creators.ts's deleteCreator() for exactly what it cascades. UI confirms by typing the
// Creator's name (app/(app)/confirm-delete-form.tsx); this route has no such UX, so callers must be
// certain. Logged to audit_log the same as the server-action path (app/(app)/creators/actions.ts) —
// both are legitimate entry points to the same operation.
export async function DELETE(_request: NextRequest, context: RouteContext<"/api/creators/[id]">) {
  try {
    const manager = await requireManager();
    const { id } = await context.params;

    await deleteCreator(id);

    const supabase = await createSupabaseServerClient();
    await supabase.from("audit_log").insert({
      entity_type: "creator",
      entity_id: id,
      action: "deleted",
      actor: manager.username,
      note: null,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
