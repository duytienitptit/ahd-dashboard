import { PageHeaderSkeleton, TableSkeleton } from "../skeleton";

// Mirrors channels/page.tsx: same grid template and min-width, so rows don't shift on arrival.
export default function ChannelsLoading() {
  return (
    <div className="px-8 py-10">
      <PageHeaderSkeleton />
      <TableSkeleton
        columns="2fr 1.3fr 0.9fr 1fr auto"
        minWidth="760px"
        headers={["Kênh", "Creator phụ trách", "Trạng thái", "Ngày thêm", ""]}
      />
    </div>
  );
}
