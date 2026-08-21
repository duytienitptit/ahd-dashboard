/**
 * Placeholder block for the `loading.tsx` files in this route group.
 *
 * Every screen here is server-rendered against Supabase, so a navigation cannot paint until the
 * queries come back. A `loading.tsx` turns that wait into an instant skeleton instead of a frozen
 * old page — the shell appears immediately and the real content streams in behind it.
 *
 * Skeletons must mirror the real layout's box sizes, otherwise the content jumps when it arrives.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[6px] bg-line-soft ${className}`} />;
}

/** Title + subtitle block that every screen in this group opens with. */
export function PageHeaderSkeleton() {
  return (
    <div className="mb-[18px]">
      <Skeleton className="h-8 w-44" />
      <Skeleton className="mt-2.5 h-4 w-32" />
    </div>
  );
}

/**
 * Table skeleton. `columns` is the same `grid-template-columns` value the real table uses, so the
 * placeholder rows line up with the header that replaces them.
 */
export function TableSkeleton({
  columns,
  minWidth,
  headers,
  rows = 5,
}: {
  columns: string;
  minWidth: string;
  headers: string[];
  rows?: number;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-line">
      <div className="overflow-x-auto">
        <div style={{ minWidth }}>
          <div
            className="grid gap-3 bg-line-soft px-5 py-3 text-xs font-bold text-ink-2"
            style={{ gridTemplateColumns: columns }}
          >
            {headers.map((header) => (
              <div key={header}>{header}</div>
            ))}
          </div>

          {Array.from({ length: rows }, (_, row) => (
            <div
              key={row}
              className="grid items-center gap-3 border-t border-line-soft px-5 py-3.5"
              style={{ gridTemplateColumns: columns }}
            >
              {headers.map((header, column) => (
                <div key={header} className="flex items-center gap-2.5">
                  {column === 0 ? <Skeleton className="h-8 w-8 shrink-0 rounded-pill" /> : null}
                  <Skeleton className="h-4 w-full max-w-[120px]" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
