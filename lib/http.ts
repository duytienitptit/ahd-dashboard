import { NextResponse } from "next/server";

import { AuthorizationError } from "@/lib/auth";
import { ValidationError } from "@/lib/validation";

/** Postgres `unique_violation`. Supabase-js surfaces the driver's error code on `.code`. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}

/** Postgres `exclusion_violation` — raised by `kpi_cycle`'s `EXCLUDE USING gist` constraint
 *  (`kpi_cycle_no_overlap`, 20260820000004_kpi_audit.sql) when a cycle's date range overlaps another
 *  cycle on the same channel. `POST`/`PATCH /api/kpi-cycles` never pre-check this in application
 *  code (docs/API_SPEC.md) — the DB is the single source of truth for "do these ranges overlap". */
function isExclusionViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23P01";
}

/**
 * Turns whatever a route handler's try/catch caught into the `{ error: string }` + status shape
 * every response uses (docs/API_SPEC.md). Route handlers should do:
 *
 *   try { ... } catch (error) { return errorResponse(error); }
 */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (isUniqueViolation(error)) {
    return NextResponse.json(
      { error: "Dữ liệu bị trùng — handle TikTok hoặc email đã tồn tại." },
      { status: 409 },
    );
  }

  if (isExclusionViolation(error)) {
    return NextResponse.json(
      { error: "Kênh này đã có chu kỳ KPI trùng khoảng ngày." },
      { status: 409 },
    );
  }

  console.error(error);
  return NextResponse.json({ error: "Đã có lỗi xảy ra, thử lại sau." }, { status: 500 });
}
