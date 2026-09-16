import { NextResponse, type NextRequest } from "next/server";

import { requireManager } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { deleteKpiCycle, updateKpiCycle } from "@/lib/kpi";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optionalDateString, optionalNullableNonNegativeInt, parseJsonBody } from "@/lib/validation";

// PATCH /api/kpi-cycles/:id — M. docs/API_SPEC.md
// Only editable while status = draft — updateKpiCycle() throws 403 (assertEditable, lib/kpi.ts) once
// a cycle is final. channelId/followersAtStart are never accepted here (see lib/kpi.ts's doc
// comment on updateKpiCycle for why).
export async function PATCH(request: NextRequest, context: RouteContext<"/api/kpi-cycles/[id]">) {
  try {
    await requireManager();
    const { id } = await context.params;
    const body = await parseJsonBody(request);

    const periodStart = optionalDateString(body, "periodStart");
    const periodEnd = optionalDateString(body, "periodEnd");
    const targetViews = optionalNullableNonNegativeInt(body, "targetViews");
    const targetVideos = optionalNullableNonNegativeInt(body, "targetVideos");
    const targetFollowers = optionalNullableNonNegativeInt(body, "targetFollowers");

    const supabase = await createSupabaseServerClient();
    const cycle = await updateKpiCycle(supabase, id, {
      periodStart,
      periodEnd,
      targetViews,
      targetVideos,
      targetFollowers,
    });

    return NextResponse.json(cycle);
  } catch (error) {
    return errorResponse(error);
  }
}

// DELETE /api/kpi-cycles/:id — M. Not part of the original M5 scope — added because PATCH
// can't fix a cycle created against the wrong channel (channelId is immutable), and the DB's
// EXCLUDE constraint locks that date range until the row is gone. Only a `draft` cycle can be
// deleted (deleteKpiCycle → assertEditable). Logged to audit_log here, not inside deleteKpiCycle —
// same split as DELETE /api/channels/:id (lib function mutates, route logs after success).
export async function DELETE(_request: NextRequest, context: RouteContext<"/api/kpi-cycles/[id]">) {
  try {
    const manager = await requireManager();
    const { id } = await context.params;

    const supabase = await createSupabaseServerClient();
    await deleteKpiCycle(supabase, id);

    await supabase.from("audit_log").insert({
      entity_type: "kpi_cycle",
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
