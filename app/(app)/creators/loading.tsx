import { PageHeaderSkeleton, Skeleton } from "../skeleton";

// Mirrors creators/page.tsx: team board — a row of columns, each with a header + a couple of
// creator cards.
export default function CreatorsLoading() {
  return (
    <div className="px-8 py-10">
      <PageHeaderSkeleton />

      <div className="mb-4 overflow-hidden rounded-card border border-line">
        <div className="flex items-center justify-between px-5 py-[18px]">
          <div>
            <Skeleton className="h-4 w-16" />
            <Skeleton className="mt-2 h-3 w-48" />
          </div>
          <Skeleton className="h-8 w-24 rounded-btn" />
        </div>
      </div>

      <div className="flex gap-3.5 overflow-hidden">
        {Array.from({ length: 3 }, (_, col) => (
          <div key={col} className="w-[320px] shrink-0 rounded-card border border-line">
            <div className="border-b border-line-soft px-4 py-3.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-7 shrink-0 rounded-pill" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="mt-2 h-3 w-24" />
            </div>
            <div className="flex flex-col gap-2.5 p-3">
              {Array.from({ length: 2 }, (_, card) => (
                <div key={card} className="rounded-input border border-line-soft px-3 py-3">
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="h-9 w-9 shrink-0 rounded-pill" />
                    <div className="flex-1">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="mt-1.5 h-3 w-16" />
                    </div>
                  </div>
                  <Skeleton className="mt-3 h-8 w-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
