import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { listChannels } from "@/lib/channels";
import { avatarPalette, initialsFromStart } from "@/lib/format";
import { attachProgress, captureFollowersAtStart, listKpiCycles } from "@/lib/kpi";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { KpiCycleForm } from "../kpi-cycle-form";

type SearchParams = Promise<{ channelId?: string }>;

// Manager-only (docs/USER_FLOW.md: "Nút Đặt KPI — Có / Ẩn"). No `?channelId=` yet → a simple channel
// picker (this page IS the picker, not a client-side dropdown inside the form — keeps the form itself
// a plain Server Component with no client-side data fetching, see kpi-cycle-form.tsx's doc comment).
export default async function NewKpiCyclePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  if (user.role !== "manager") redirect("/kpi");

  const { channelId } = await searchParams;
  const supabase = await createSupabaseServerClient();

  if (!channelId) {
    const channels = await listChannels(supabase);
    return (
      <div className="px-8 py-10">
        <Breadcrumb current="Đặt KPI mới" />
        <div className="max-w-2xl overflow-hidden rounded-card border border-line">
          <div className="border-b border-line-soft px-6 py-5">
            <h1 className="text-xl font-extrabold tracking-[-0.4px]">Chọn kênh cần đặt KPI</h1>
            <p className="mt-1 text-[13px] text-ink-3">Bấm vào một kênh để tiếp tục.</p>
          </div>
          {channels.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-ink-3">Chưa có kênh nào.</p>
          ) : (
            <div className="divide-y divide-line-soft">
              {channels.map((channel, i) => (
                <Link
                  key={channel.id}
                  href={`/kpi/new?channelId=${channel.id}`}
                  className="flex items-center gap-3 px-6 py-4 hover:bg-surface"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-[12px] font-extrabold"
                    style={{ background: avatarPalette(i).bg, color: avatarPalette(i).fg }}
                  >
                    {initialsFromStart(channel.name)}
                  </span>
                  <div className="flex-grow">
                    <div className="text-sm font-semibold">{channel.name}</div>
                    <div className="text-[11.5px] text-ink-3">
                      {channel.tiktokHandle}
                      {channel.currentCreator ? ` · ${channel.currentCreator.name} phụ trách` : " · Chưa gán nhân sự"}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const [channel] = await listChannels(supabase, { channelId });
  if (!channel) redirect("/kpi/new");

  const [followersAtStart, existingCycles] = await Promise.all([
    captureFollowersAtStart(supabase, channelId),
    listKpiCycles(supabase, { channelId }),
  ]);
  const recentCycles = await attachProgress(supabase, existingCycles.slice(0, 3));

  return (
    <div className="px-8 py-10">
      <Breadcrumb current="Đặt KPI mới" />
      <KpiCycleForm mode="create" channel={channel} followersAtStart={followersAtStart} recentCycles={recentCycles} />
    </div>
  );
}

function Breadcrumb({ current }: { current: string }) {
  return (
    <div className="mb-4 flex items-center gap-2 text-[13px] text-ink-3">
      <Link href="/kpi" className="hover:text-ink">
        KPI
      </Link>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
        <path d="M9 6l6 6-6 6" />
      </svg>
      <span className="font-semibold text-ink">{current}</span>
    </div>
  );
}
