import { PageHeaderSkeleton, Skeleton, TableSkeleton } from "../skeleton";
import { CHANNEL_TABLE_COLUMNS } from "./channel-form";

// Mirrors channels/page.tsx + channels-table.tsx: same grid template and min-width, so rows don't
// shift on arrival.
export default function ChannelsLoading() {
  return (
    <div className="px-8 py-10">
      <PageHeaderSkeleton />
      <Skeleton className="mb-3.5 h-[92px] w-full" />
      <TableSkeleton
        columns={CHANNEL_TABLE_COLUMNS}
        minWidth="900px"
        headers={["Kênh", "Follower", "Lượt xem", "Video", "View / video", "7 ngày", "Tiến độ KPI", ""]}
      />
    </div>
  );
}
