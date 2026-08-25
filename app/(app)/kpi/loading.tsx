import { PageHeaderSkeleton, Skeleton } from "../skeleton";

// Mirrors kpi/page.tsx: 3 grouped sections (Đang chạy/Sắp tới/Đã qua), each a bordered list of rows
// — avatar + name/dates + metric chips + health badge.
export default function KpiLoading() {
  return (
    <div className="px-8 py-10">
      <PageHeaderSkeleton />

      {Array.from({ length: 2 }, (_, group) => (
        <div key={group} className="mb-6">
          <Skeleton className="mb-2.5 h-4 w-24" />
          <div className="overflow-hidden rounded-card border border-line">
            <div className="divide-y divide-line-soft">
              {Array.from({ length: 3 }, (_, row) => (
                <div key={row} className="flex items-center gap-4 px-5 py-4">
                  <Skeleton className="h-9 w-9 shrink-0 rounded-pill" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="mt-2 h-3 w-40" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-6 w-24 rounded-pill" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
