import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { AuthorizationError, requireManager } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DisplayApiProvider } from "@/lib/tiktok/display-api-provider";
import { syncAllChannels } from "@/lib/tiktok/sync";
import { sampleDateForRun } from "@/lib/time";

function isValidCronSecret(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function runSync() {
  const supabase = createSupabaseAdminClient();
  // sampleDateForRun(), not nowVnDateString() — a run that slips past midnight VN (Vercel Cron
  // running late) must still close out the day it was scheduled for, not the new one. See its doc
  // comment in lib/time.ts and docs/DISPLAY_API.md bẫy #12.
  const result = await syncAllChannels(supabase, new DisplayApiProvider(), sampleDateForRun());
  return NextResponse.json(result);
}

// GET /api/sync/display-api — Vercel Cron only. Cron jobs always send GET (Vercel platform
// constraint), which is why this exists alongside POST below rather than API_SPEC.md's single
// "POST ... (hoặc cron)" literally being one method — see docs/API_SPEC.md update.
export async function GET(request: NextRequest) {
  if (!isValidCronSecret(request)) {
    return errorResponse(new AuthorizationError(401, "Thiếu hoặc sai CRON_SECRET."));
  }
  try {
    return await runSync();
  } catch (error) {
    return errorResponse(error);
  }
}

// POST /api/sync/display-api — M, "Chạy đồng bộ ngay" trên /connections. docs/API_SPEC.md
export async function POST() {
  try {
    await requireManager();
    return await runSync();
  } catch (error) {
    return errorResponse(error);
  }
}
