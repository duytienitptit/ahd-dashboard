import { NextResponse, type NextRequest } from "next/server";

import { requireManager, requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { attachProgress, createKpiCycle, listKpiCycles, type KpiPeriodType, type KpiStatus } from "@/lib/kpi";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optionalNonNegativeInt, parseJsonBody, requireDateString, requireString, ValidationError } from "@/lib/validation";

// GET /api/kpi-cycles — M/C. docs/API_SPEC.md
// ?channelId=, ?status=draft|final, ?activeOnly=true — every result includes `progress` (never a
// separate call), computed server-side per CLAUDE.md ("tính toán progress ở server-side").
//
// Creator scoping is NOT left to RLS (kpi_cycle's RLS policy grants read to every authenticated
// role, same as every other business table — CLAUDE.md's "Creator xem chéo số liệu kênh khác" is
// about channel DATA, not about who a target was assigned to). Forced here instead, the same way
// GET /api/channels/oauth/status narrows a Creator to their own channel(s) regardless of query
// params — a Creator can't read another channel's targets by passing a different ?channelId=.
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = request.nextUrl;

    const channelId = searchParams.get("channelId") ?? undefined;
    const statusParam = searchParams.get("status");
    if (statusParam !== null && statusParam !== "draft" && statusParam !== "final") {
      return NextResponse.json({ error: '"status" phải là "draft" hoặc "final".' }, { status: 400 });
    }
    const status = (statusParam ?? undefined) as KpiStatus | undefined;
    const activeOnly = searchParams.get("activeOnly") === "true";

    const supabase = await createSupabaseServerClient();
    const cycles = await listKpiCycles(supabase, {
      channelId,
      status,
      activeOnly,
      creatorId: user.role === "creator" ? user.id : undefined,
    });
    const withProgress = await attachProgress(supabase, cycles);

    return NextResponse.json(withProgress);
  } catch (error) {
    return errorResponse(error);
  }
}

// POST /api/kpi-cycles — M. docs/API_SPEC.md
export async function POST(request: NextRequest) {
  try {
    await requireManager();
    const body = await parseJsonBody(request);

    const channelId = requireString(body, "channelId");
    const periodType = requireString(body, "periodType");
    if (periodType !== "weekly" && periodType !== "custom") {
      throw new ValidationError('"periodType" phải là "weekly" hoặc "custom".');
    }
    const periodStart = requireDateString(body, "periodStart");
    const periodEnd = requireDateString(body, "periodEnd");
    const targetViews = optionalNonNegativeInt(body, "targetViews");
    const targetVideos = optionalNonNegativeInt(body, "targetVideos");
    const targetFollowers = optionalNonNegativeInt(body, "targetFollowers");

    const supabase = await createSupabaseServerClient();
    const cycle = await createKpiCycle(supabase, {
      channelId,
      periodType: periodType as KpiPeriodType,
      periodStart,
      periodEnd,
      targetViews,
      targetVideos,
      targetFollowers,
    });

    return NextResponse.json(cycle, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
