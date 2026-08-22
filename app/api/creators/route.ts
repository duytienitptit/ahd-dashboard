import { NextResponse } from "next/server";

import { requireManager, requireUser } from "@/lib/auth";
import { createCreator, listCreators } from "@/lib/creators";
import { errorResponse } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optionalUuid, parseJsonBody, requireString, requireUsername } from "@/lib/validation";

// GET /api/creators — M/C. docs/API_SPEC.md
export async function GET() {
  try {
    await requireUser();
    const supabase = await createSupabaseServerClient();
    const creators = await listCreators(supabase);

    return NextResponse.json(creators);
  } catch (error) {
    return errorResponse(error);
  }
}

// POST /api/creators — M. Tạo tài khoản Creator, không có self-signup. docs/API_SPEC.md
export async function POST(request: Request) {
  try {
    const manager = await requireManager();
    const body = await parseJsonBody(request);

    const name = requireString(body, "name", { max: 200 });
    const username = requireUsername(body, "username");
    const password = requireString(body, "password", { min: 8, max: 200 });
    const teamId = optionalUuid(body, "teamId");

    const supabase = await createSupabaseServerClient();
    const creator = await createCreator(supabase, { name, username, password, managerId: manager.id, teamId });

    return NextResponse.json(creator, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
