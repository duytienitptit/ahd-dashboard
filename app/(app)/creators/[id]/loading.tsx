import { Skeleton, TableSkeleton } from "../../skeleton";

// Mirrors channels/[id]/loading.tsx's shape (breadcrumb + header + stat row + chart + table), swapped
// to this page's own sections (4 stat tiles, trend chart, kênh phụ trách table, daily table).
export default function CreatorDetailLoading() {
  return (
    <div className="px-8 py-10">
      <Skeleton className="mb-4 h-4 w-32" />

      <div className="mb-5 flex items-center gap-4">
        <Skeleton className="h-14 w-14 shrink-0 rounded-pill" />
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-2 h-3.5 w-64" />
        </div>
      </div>

      <div className="mb-3.5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, tile) => (
          <div key={tile} className="rounded-card border border-line px-[18px] py-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-3 h-7 w-20" />
            <Skeleton className="mt-2.5 h-3 w-24" />
          </div>
        ))}
      </div>

      <Skeleton className="mb-3.5 h-[280px] w-full rounded-card" />

      <div className="mb-3.5">
        <TableSkeleton columns="2fr 1fr 1fr 0.7fr 0.9fr" minWidth="640px" headers={["Kênh", "Follower", "Lượt xem", "Video", "Tương tác"]} rows={3} />
      </div>

      <TableSkeleton
        columns="1.1fr 1fr 1fr 1fr 0.8fr 1.2fr"
        minWidth="640px"
        headers={["Ngày", "Follower", "Thay đổi", "Lượt xem", "Video", "Nguồn"]}
        rows={5}
      />
    </div>
  );
}
