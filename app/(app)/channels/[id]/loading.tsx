import { Skeleton } from "../../skeleton";

// Mirrors channels/[id]/page.tsx's section shapes so nothing jumps when the real data arrives.
export default function ChannelDetailLoading() {
  return (
    <div className="px-8 py-10">
      <Skeleton className="mb-4 h-4 w-32" />

      <div className="mb-5 flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-pill" />
        <div>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-2 h-3.5 w-64" />
        </div>
      </div>

      <div className="mb-3.5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[104px] w-full" />
        ))}
      </div>

      <div className="mb-3.5 grid gap-3.5 lg:grid-cols-[1fr_320px]">
        <Skeleton className="h-[280px] w-full" />
        <Skeleton className="h-[280px] w-full" />
      </div>

      <div className="mb-3.5 grid gap-3.5 lg:grid-cols-2">
        <Skeleton className="h-[220px] w-full" />
        <Skeleton className="h-[220px] w-full" />
      </div>

      <Skeleton className="mb-3.5 h-[240px] w-full" />
      <Skeleton className="h-[300px] w-full" />
    </div>
  );
}
