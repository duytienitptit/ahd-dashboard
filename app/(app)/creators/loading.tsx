import { PageHeaderSkeleton, Skeleton } from "../skeleton";

// Mirrors creators/page.tsx: a two-column card grid, not a table.
export default function CreatorsLoading() {
  return (
    <div className="px-8 py-10">
      <PageHeaderSkeleton />

      <div className="grid gap-3.5 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, card) => (
          <div key={card} className="rounded-card border border-line p-[22px]">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-pill" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-44" />
              </div>
            </div>
            <Skeleton className="mt-4 h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
