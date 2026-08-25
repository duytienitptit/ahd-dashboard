import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { listChannels } from "@/lib/channels";
import { attachProgress, getKpiCycleById, listKpiCycles } from "@/lib/kpi";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { KpiCycleForm } from "../../kpi-cycle-form";

// Manager-only, same as /kpi/new. Editing is blocked once status = 'final' — KpiCycleForm itself
// renders the locked state (lib/kpi.ts's assertEditable is the real enforcement, at the action/route
// layer; this page still needs the cycle's data to show *why* it's locked).
export default async function EditKpiCyclePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user.role !== "manager") redirect("/kpi");

  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const cycle = await getKpiCycleById(supabase, id);
  if (!cycle) notFound();

  const [channel] = await listChannels(supabase, { channelId: cycle.channelId });
  if (!channel) notFound();

  const [withProgress] = await attachProgress(supabase, [cycle]);

  const otherCycles = await listKpiCycles(supabase, { channelId: cycle.channelId });
  const recentCycles = await attachProgress(
    supabase,
    otherCycles.filter((c) => c.id !== cycle.id).slice(0, 3),
  );

  return (
    <div className="px-8 py-10">
      <div className="mb-4 flex items-center gap-2 text-[13px] text-ink-3">
        <Link href="/kpi" className="hover:text-ink">
          KPI
        </Link>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span className="font-semibold text-ink">Sửa chu kỳ</span>
      </div>
      <KpiCycleForm
        mode="edit"
        channel={channel}
        followersAtStart={cycle.followersAtStart}
        cycle={withProgress}
        recentCycles={recentCycles}
      />
    </div>
  );
}
