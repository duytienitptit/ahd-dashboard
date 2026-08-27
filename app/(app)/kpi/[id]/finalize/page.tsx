import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { listChannels } from "@/lib/channels";
import { attachProgress, checkFinalizeReadiness, getKpiCycleById, getManagerNameById } from "@/lib/kpi";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { FinalizePanel } from "./finalize-panel";

// Manager-only (CLAUDE.md: "Creator không có quyền... chốt sổ") — same guard as /kpi/[id]/edit.
// A Creator can still see a finalized cycle's numbers on /kpi's own list row (already shows
// "· đã chốt sổ" + full progress), so this isn't the only place history is visible to them.
export default async function FinalizeKpiCyclePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user.role !== "manager") redirect("/kpi");

  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const cycle = await getKpiCycleById(supabase, id);
  if (!cycle) notFound();

  const [channel] = await listChannels(supabase, { channelId: cycle.channelId });
  if (!channel) notFound();

  const [withProgress] = await attachProgress(supabase, [cycle]);

  // Readiness only matters (and is only computed) while still draft — a final cycle already passed
  // every gate the moment it was locked, re-running the checks now would just be wasted queries.
  const readiness = cycle.status === "draft" ? await checkFinalizeReadiness(supabase, cycle) : null;
  const finalizedByName =
    cycle.status === "final" && cycle.finalizedBy ? await getManagerNameById(supabase, cycle.finalizedBy) : null;

  return (
    <div className="px-8 py-10">
      <div className="mb-4 flex items-center gap-2 text-[13px] text-ink-3">
        <Link href="/kpi" className="hover:text-ink">
          KPI
        </Link>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span className="font-semibold text-ink">Chốt sổ</span>
      </div>
      <FinalizePanel cycle={withProgress} channel={channel} readiness={readiness} finalizedByName={finalizedByName} />
    </div>
  );
}
