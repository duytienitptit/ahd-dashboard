import { NextResponse, type NextRequest } from "next/server";

import { requireManager, requireUser } from "@/lib/auth";
import { createChannel, listChannels } from "@/lib/channels";
import { errorResponse } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeTiktokHandle, optionalUuid, parseJsonBody, requireString } from "@/lib/validation";

// GET /api/channels — M/C. docs/API_SPEC.md
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const supabase = await createSupabaseServerClient();

    const creatorId = request.nextUrl.searchParams.get("creatorId");
    const channels = await listChannels(supabase, { creatorId: creatorId ?? undefined });

    return NextResponse.json(channels);
  } catch (error) {
    return errorResponse(error);
  }
}

// POST /api/channels — M. docs/API_SPEC.md
export async function POST(request: NextRequest) {
  try {
    await requireManager();
    const body = await parseJsonBody(request);

    const name = requireString(body, "name", { max: 200 });
    const tiktokHandle = normalizeTiktokHandle(requireString(body, "tiktokHandle"));
    const creatorId = optionalUuid(body, "creatorId") ?? null;

    const supabase = await createSupabaseServerClient();
    const channel = await createChannel(supabase, { name, tiktokHandle, creatorId });

    return NextResponse.json(channel, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
