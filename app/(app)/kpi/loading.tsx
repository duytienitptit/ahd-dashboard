import { PageHeaderSkeleton, Skeleton } from "../skeleton";

// Mirrors kpi/page.tsx (channel-first, 26/08/2026): one KpiCard-shaped block per channel — header
// row (avatar + name/handle), a metric-bars area, no fixed count since the real page renders one per
// channel regardless of how many that turns out to be — 4 is just a plausible placeholder count.
export default function KpiLoading() {
  return (
    <div className="px-8 py-10">
      <PageHeaderSkeleton />

      {Array.from({ length: 4 }, (_, card) => (
        <div key={card} className="mb-3.5 rounded-card border border-line px-5 py-[18px]">
          <div className="mb-3.5 flex items-center gap-3">
            <Skeleton className="h-9 w-9 shrink-0 rounded-pill" />
            <div>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-1.5 h-3 w-24" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.1fr]">
            <Skeleton className="h-16 w-full rounded-input" />
            <div className="flex flex-col justify-center gap-3.5">
              {Array.from({ length: 2 }, (_, bar) => (
                <Skeleton key={bar} className="h-[26px] w-full" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
