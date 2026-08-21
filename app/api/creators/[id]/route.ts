import { NextResponse, type NextRequest } from "next/server";

import { requireManager } from "@/lib/auth";
import { updateCreator } from "@/lib/creators";
import { errorResponse } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optionalBoolean, optionalString, parseJsonBody } from "@/lib/validation";

// PATCH /api/creators/:id — M. Not in the original docs/API_SPEC.md — added for M2 so a Manager can
// rename or disable a Creator account (e.g. someone leaving the team) without touching Supabase
// directly. Does not delete accounts. docs/API_SPEC.md updated to match (2026-08-20).
export async function PATCH(request: NextRequest, context: RouteContext<"/api/creators/[id]">) {
  try {
    await requireManager();
    const { id } = await context.params;
    const body = await parseJsonBody(request);

    const name = optionalString(body, "name");
    const isActive = optionalBoolean(body, "isActive");

    const supabase = await createSupabaseServerClient();
    const creator = await updateCreator(supabase, id, { name, isActive });

    return NextResponse.json(creator);
  } catch (error) {
    return errorResponse(error);
  }
}
