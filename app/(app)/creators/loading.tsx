import { PageHeaderSkeleton, Skeleton } from "../skeleton";

// Mirrors creators/page.tsx: team panels collapsed by default, so the loading shell is a stack of
// closed accordion headers (chevron + name + count + rollup chips), not the old card grid.
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

      <Skeleton className="mb-4 h-[38px] w-40 rounded-btn" />

      <div className="flex flex-col gap-3.5">
        {Array.from({ length: 3 }, (_, panel) => (
          <div key={panel} className="flex items-center justify-between gap-4 rounded-card border border-line px-5 py-4">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-4 w-4 shrink-0 rounded-[3px]" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="flex items-center gap-5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
