import { Skeleton } from "./skeleton";

// Covers the Tổng quan route, and doubles as the fallback for any future segment in this group
// that ships without its own loading.tsx. Deliberately does NOT render the Creator-only "Kênh của
// tôi" block or "Chỉ xem" badge — role isn't known yet at loading time (docs/DESIGN_SYSTEM.md).
export default function AppLoading() {
  return (
    <div className="px-8 py-10">
      <Skeleton className="h-8 w-52" />
      <Skeleton className="mt-2.5 h-4 w-64" />

      <div className="mb-3.5 mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[104px] w-full" />
        ))}
      </div>

      <div className="mb-3.5 grid gap-3.5 lg:grid-cols-[1fr_320px]">
        <Skeleton className="h-[280px] w-full" />
        <Skeleton className="h-[280px] w-full" />
      </div>

      <div className="grid gap-3.5 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[220px] w-full" />
        ))}
      </div>
    </div>
  );
}
