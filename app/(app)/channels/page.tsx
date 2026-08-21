import { getCurrentUser } from "@/lib/auth";
import { listChannels } from "@/lib/channels";
import { listCreators } from "@/lib/creators";
import { getChannelPeriodStats, previousPeriod } from "@/lib/dashboard";
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

  const { from, to } = resolvePeriodParams(await searchParams);
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
          <div className="flex items-center gap-2">
            <DateRangePicker from={from} to={to} />
            {isManager ? <CreateChannelForm creators={creatorOptions} /> : null}
          </div>
        </div>

        <FilterPendingOverlay>
          <ChannelsTable rows={rows} creators={creatorOptions} isManager={isManager} />
        </FilterPendingOverlay>
      </FilterTransitionProvider>
    </div>
  );
}
