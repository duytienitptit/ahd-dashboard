import { NextResponse, type NextRequest } from "next/server";

import { requireManager } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { attachProgress, checkFinalizeReadiness, finalizeKpiCycle, getKpiCycleById } from "@/lib/kpi";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ValidationError } from "@/lib/validation";

// POST /api/kpi-cycles/:id/finalize — M6, docs/API_SPEC.md. Takes no body — only aggregates
// data_snapshot already on file for the cycle's date range; uploading files is a separate endpoint
// (/api/channels/:id/import).
export async function POST(_request: NextRequest, context: RouteContext<"/api/kpi-cycles/[id]/finalize">) {
  try {
    const manager = await requireManager();
    const { id } = await context.params;
    const supabase = await createSupabaseServerClient();

    const cycle = await getKpiCycleById(supabase, id);
    if (!cycle) throw new ValidationError("Chu kỳ KPI không tồn tại.");
    if (cycle.status === "final") {
      return NextResponse.json({ error: "Chu kỳ KPI đã chốt sổ." }, { status: 409 });
    }

    const readiness = await checkFinalizeReadiness(supabase, cycle);
    if (!readiness.ready) {
      return NextResponse.json(
        {
          error: "cycle_not_ready",
          reasons: readiness.reasons,
          missingDates: readiness.missingDates,
          manualEntryDates: readiness.manualEntryDates,
          unlockAt: readiness.unlockAt,
        },
        { status: 422 },
      );
    }

    const finalized = await finalizeKpiCycle(supabase, id, manager.id);

    await supabase.from("audit_log").insert({
      entity_type: "kpi_cycle",
      entity_id: id,
      action: "finalized",
      actor: manager.username,
      note: `Chốt sổ chu kỳ ${cycle.periodStart} → ${cycle.periodEnd}.`,
    });

    const [withProgress] = await attachProgress(supabase, [finalized]);
    return NextResponse.json(withProgress);
  } catch (error) {
    return errorResponse(error);
  }
}
