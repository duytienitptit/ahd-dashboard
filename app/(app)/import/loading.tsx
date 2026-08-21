import { PageHeaderSkeleton, Skeleton } from "../skeleton";

// Mirrors import/page.tsx. Unlike /connections this screen redirects non-Managers, so the DataTabs
// bar is always present and worth reserving space for.
export default function ImportLoading() {
  return (
    <div className="px-8 py-10">
      <div className="mb-[18px] flex items-center gap-1">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-40" />
      </div>

      <PageHeaderSkeleton />

      <div className="rounded-card border border-line p-[22px]">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-2.5 h-[38px] w-full max-w-sm" />
        <Skeleton className="mt-5 h-[168px] w-full" />
      </div>
    </div>
  );
}
