import { NextResponse, type NextRequest } from "next/server";

import { requireManager } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteTeam, renameTeam } from "@/lib/teams";
import { parseJsonBody, requireString } from "@/lib/validation";

// PATCH /api/teams/:id — M. Rename only — a team has no other mutable field. docs/API_SPEC.md
export async function PATCH(request: NextRequest, context: RouteContext<"/api/teams/[id]">) {
  try {
    await requireManager();
    const { id } = await context.params;
    const body = await parseJsonBody(request);
    const name = requireString(body, "name", { max: 200 });

    const supabase = await createSupabaseServerClient();
    await renameTeam(supabase, id, name);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

// DELETE /api/teams/:id — M. `creator.team_id` is `on delete set null` — deleting a team never
// deletes its Creators, they just become unassigned. docs/API_SPEC.md
export async function DELETE(_request: NextRequest, context: RouteContext<"/api/teams/[id]">) {
  try {
    await requireManager();
    const { id } = await context.params;

    const supabase = await createSupabaseServerClient();
    await deleteTeam(supabase, id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
