import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/auth";
import { getDashboard } from "@/lib/dashboard";
import { errorResponse } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addDaysToDateString, nowVnDateString } from "@/lib/time";
import { ValidationError } from "@/lib/validation";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateParam(request: NextRequest, name: string): string | null {
  const raw = request.nextUrl.searchParams.get(name);
  if (raw === null) return null;
  if (!DATE_RE.test(raw)) throw new ValidationError(`Tham số "${name}" phải có dạng YYYY-MM-DD.`);
  return raw;
}

// GET /api/dashboard — M/C. docs/API_SPEC.md
// One response shape for both roles; the server (not the client) decides what each role gets to
// see — `myChannels` is populated only for role: "creator".
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const supabase = await createSupabaseServerClient();

    const to = parseDateParam(request, "to") ?? nowVnDateString();
    const from = parseDateParam(request, "from") ?? addDaysToDateString(to, -6);
    if (from > to) throw new ValidationError('Tham số "from" phải không muộn hơn "to".');
    const creatorId = request.nextUrl.searchParams.get("creatorId");
    const teamId = request.nextUrl.searchParams.get("teamId");

    const dashboard = await getDashboard(supabase, { role: user.role, userId: user.id, from, to, creatorId, teamId });
    return NextResponse.json(dashboard);
  } catch (error) {
    return errorResponse(error);
  }
}
