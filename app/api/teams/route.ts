import { NextResponse } from "next/server";

import { requireManager, requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createTeam, listTeams } from "@/lib/teams";
import { parseJsonBody, requireString } from "@/lib/validation";

// GET /api/teams — M/C. docs/API_SPEC.md
export async function GET() {
  try {
    await requireUser();
    const supabase = await createSupabaseServerClient();
    const teams = await listTeams(supabase);

    return NextResponse.json(teams);
  } catch (error) {
    return errorResponse(error);
  }
}

// POST /api/teams — M. Team is purely an organizational label (CLAUDE.md, 21/08/2026) — doesn't
// change who sees what, just groups Creators for filtering (getDashboard's ?teamId=).
export async function POST(request: Request) {
  try {
    await requireManager();
    const body = await parseJsonBody(request);
    const name = requireString(body, "name", { max: 200 });

    const supabase = await createSupabaseServerClient();
    const team = await createTeam(supabase, name);

    return NextResponse.json(team, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
