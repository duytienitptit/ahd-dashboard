import { PageHeaderSkeleton, Skeleton } from "../skeleton";

// Mirrors creators/page.tsx: a two-column card grid, not a table.
export default function CreatorsLoading() {
  return (
    <div className="px-8 py-10">
      <PageHeaderSkeleton />

      <div className="grid gap-3.5 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, card) => (
          <div key={card} className="overflow-hidden rounded-card border border-line">
            <div className="flex items-center gap-3 border-b border-line-soft p-[22px]">
              <Skeleton className="h-[46px] w-[46px] shrink-0 rounded-pill" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-44" />
              </div>
            </div>
            <Skeleton className="h-[74px] w-full border-b border-line-soft" />
            <div className="flex flex-col gap-3 p-[22px]">
              <Skeleton className="h-[5px] w-full" />
              <Skeleton className="h-[5px] w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
