import { Skeleton } from "./skeleton";

// Covers the overview route, and doubles as the fallback for any future segment in this group that
// ships without its own loading.tsx.
export default function AppLoading() {
  return (
    <div className="px-8 py-10">
      <Skeleton className="h-8 w-52" />

      <div className="mt-6 max-w-md rounded-card border border-line p-[22px]">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-2.5 h-3 w-48" />
        <Skeleton className="mt-3.5 h-6 w-24 rounded-pill" />
      </div>
    </div>
  );
}
