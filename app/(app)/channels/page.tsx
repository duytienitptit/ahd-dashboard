import { getCurrentUser } from "@/lib/auth";
import { listChannels } from "@/lib/channels";
import { listCreators } from "@/lib/creators";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ChannelRow, CreateChannelForm } from "./channel-form";

// M2 scope: manage channels + who's assigned. The metrics-heavy table from design/Channels.dc.html
// (follower/view/sparkline/KPI columns) is M4 work, once data_snapshot actually has rows — showing
// those columns empty here would violate docs/DESIGN_SYSTEM.md "không bịa thêm dữ liệu mẫu".
export default async function ChannelsPage() {
  const user = await getCurrentUser();
  if (!user) return null; // layout already redirects signed-out visitors

  const supabase = await createSupabaseServerClient();
  const [channels, creators] = await Promise.all([listChannels(supabase), listCreators(supabase)]);

  const isManager = user.role === "manager";
  const creatorOptions = creators.map((creator) => ({ id: creator.id, name: creator.name }));

  return (
    <div className="px-8 py-10">
      {/* items-start, not items-end: the right side swaps between a short button and a much taller
          form, and items-end would bottom-align the title against whichever is currently taller. */}
      <div className="mb-[18px] flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.6px]">Kênh</h1>
          <p className="mt-1.5 text-[13px] text-ink-3">{channels.length} kênh</p>
        </div>
        {isManager ? <CreateChannelForm creators={creatorOptions} /> : null}
      </div>

      {/* overflow-x-auto + min-width: the grid below has fixed column proportions, not a fluid
          wrap — on a narrower viewport it must scroll horizontally rather than squish and overlap. */}
      <div className="overflow-hidden rounded-card border border-line">
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[2fr_1.3fr_0.9fr_1fr_auto] gap-3 bg-line-soft px-5 py-3 text-xs font-bold text-ink-2">
              <div>Kênh</div>
              <div>Creator phụ trách</div>
              <div>Trạng thái</div>
              <div>Ngày thêm</div>
              <div />
            </div>

            {channels.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-ink-3">Chưa có kênh nào.</div>
            ) : (
              channels.map((channel) => (
                <ChannelRow
                  key={channel.id}
                  channel={channel}
                  creators={creatorOptions}
                  isManager={isManager}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
