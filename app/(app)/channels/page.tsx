import { getCurrentUser, isDemoAccount } from "@/lib/auth";
import { listChannels } from "@/lib/channels";
import { listCreators } from "@/lib/creators";
import { getChannelPeriodStats, previousPeriod } from "@/lib/dashboard";
import { attachProgress, listKpiCycles } from "@/lib/kpi";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePeriodParams } from "@/lib/time";

import { DateRangePicker } from "../date-range-picker";
import { FilterPendingOverlay, FilterTransitionProvider } from "../filter-transition";
import { ChannelsTable } from "./channels-table";
import { CreateChannelForm } from "./channel-form";

type SearchParams = Promise<{ from?: string; to?: string }>;

export default async function ChannelsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  if (!user) return null; // layout already redirects signed-out visitors

  // Kênh mặc định "7 ngày qua", không phải "Toàn bộ thời gian" như các trang khác (27/08/2026, theo
  // yêu cầu) — màn này để trả lời "tuần qua các kênh chạy thế nào", câu hỏi vận hành hằng tuần; ai
  // cần toàn bộ lịch sử vẫn chọn được ở date picker. Trang chi tiết kênh vẫn mặc định toàn bộ thời gian.
  const { from, to } = resolvePeriodParams(await searchParams, 7);
  const { comparedFrom, comparedTo } = previousPeriod(from, to);

  const supabase = await createSupabaseServerClient();
  const [channels, creators] = await Promise.all([listChannels(supabase), listCreators(supabase)]);

  const stats = await getChannelPeriodStats(supabase, {
    channelIds: channels.map((c) => c.id),
    from,
    to,
    comparedFrom,
    comparedTo,
  });

  // "Tiến độ KPI" column (M5) — active cycles only (a draft cycle whose window hasn't started yet,
  // or one already past, isn't "the current progress" this column is showing). CLAUDE.md: this is
  // purely informational — doesn't change the table's default sort/filter/rank.
  const activeCycles = await listKpiCycles(supabase, { activeOnly: true });
  const activeWithProgress = await attachProgress(supabase, activeCycles);
  const kpiByChannel = new Map(activeWithProgress.map((c) => [c.channelId, c]));

  const isManager = user.role === "manager";
  const creatorOptions = creators.map((creator) => ({ id: creator.id, name: creator.name }));
  const rows = channels.map((channel) => ({ channel, stat: stats.get(channel.id) }));

  return (
    <div className="px-8 py-10">
      <FilterTransitionProvider>
        {/* items-start, not items-end: the right side swaps between a short button and a much taller
            form, and items-end would bottom-align the title against whichever is currently taller. */}
        <div className="mb-[18px] flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-[-0.6px]">Kênh</h1>
            <p className="mt-1.5 text-[13px] text-ink-3">{channels.length} kênh</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker from={from} to={to} />
            {isManager ? <CreateChannelForm creators={creatorOptions} /> : null}
          </div>
        </div>

        <FilterPendingOverlay>
          <ChannelsTable
            rows={rows}
            creators={creatorOptions}
            isManager={isManager}
            /* Demo account của reviewer TikTok: bỏ id đi là mất luôn nút sửa tên kênh
               (updateChannelNameAction đằng sau cũng đã chặn). Xem lib/auth.ts. */
            currentUserId={isDemoAccount(user) ? undefined : user.id}
            kpiByChannel={kpiByChannel}
          />
        </FilterPendingOverlay>
      </FilterTransitionProvider>
    </div>
  );
}
