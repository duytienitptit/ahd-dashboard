import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { listChannels } from "@/lib/channels";
import { attachProgress, listKpiCycles, type KpiCycleWithProgress } from "@/lib/kpi";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { nowVnDateString } from "@/lib/time";

import { KpiRow } from "./kpi-row";

// M/C — Manager sees every channel's cycles; Creator sees only their own channel(s)' (nav label
// "KPI của tôi", docs/USER_FLOW.md). Scoping happens in listKpiCycles's `creatorId` param, the same
// server-side narrowing GET /api/kpi-cycles uses — never left to RLS alone (kpi_cycle's RLS grants
// read to any authenticated role, same as every business table; CLAUDE.md's "Creator xem chéo số
// liệu kênh khác" is about channel DATA, not who a target was assigned to).
export default async function KpiPage() {
  const user = await requireUser();
  const isManager = user.role === "manager";

  const supabase = await createSupabaseServerClient();
  const [cycles, channels] = await Promise.all([
    listKpiCycles(supabase, { creatorId: isManager ? undefined : user.id }),
    listChannels(supabase),
  ]);
  const withProgress = await attachProgress(supabase, cycles);
  const channelById = new Map(channels.map((c) => [c.id, c]));

  const today = nowVnDateString();
  const active = withProgress.filter((c) => c.periodStart <= today && today <= c.periodEnd);
  const upcoming = withProgress.filter((c) => c.periodStart > today);
  const past = withProgress.filter((c) => c.periodEnd < today);

  return (
    <div className="px-8 py-10">
      <div className="mb-[18px] flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.6px]">{isManager ? "KPI" : "KPI của tôi"}</h1>
          <p className="mt-1.5 text-[13px] text-ink-3">
            {withProgress.length === 0 ? "Chưa có chu kỳ KPI nào" : `${withProgress.length} chu kỳ`}
          </p>
        </div>
        {isManager ? (
          <Link
            href="/kpi/new"
            className="flex h-[38px] items-center rounded-btn bg-red px-[18px] text-sm font-bold text-white hover:opacity-90"
          >
            + Đặt KPI mới
          </Link>
        ) : null}
      </div>

      {withProgress.length === 0 ? (
        <div className="rounded-card border border-line px-5 py-10 text-center text-sm text-ink-3">
          {isManager
            ? "Chưa có chu kỳ KPI nào — bấm “+ Đặt KPI mới” để bắt đầu."
            : "Bạn chưa có chu kỳ KPI nào được giao."}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <KpiGroup title="Đang chạy" cycles={active} channelById={channelById} isManager={isManager} />
          <KpiGroup title="Sắp tới" cycles={upcoming} channelById={channelById} isManager={isManager} />
          <KpiGroup title="Đã qua" cycles={past} channelById={channelById} isManager={isManager} />
        </div>
      )}
    </div>
  );
}

function KpiGroup({
  title,
  cycles,
  channelById,
  isManager,
}: {
  title: string;
  cycles: KpiCycleWithProgress[];
  channelById: Map<string, { id: string; name: string; tiktokHandle: string }>;
  isManager: boolean;
}) {
  if (cycles.length === 0) return null;
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2 text-[13px] font-bold text-ink-2">
        {title} <span className="font-normal text-ink-3">({cycles.length})</span>
      </div>
      <div className="overflow-hidden rounded-card border border-line">
        <div className="divide-y divide-line-soft">
          {cycles.map((cycle, i) => {
            const channel = channelById.get(cycle.channelId);
            if (!channel) return null;
            return <KpiRow key={cycle.id} cycle={cycle} channel={channel} index={i} isManager={isManager} />;
          })}
        </div>
      </div>
    </div>
  );
}
