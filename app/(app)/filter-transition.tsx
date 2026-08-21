"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useTransition, type ReactNode } from "react";

type FilterTransitionValue = {
  isPending: boolean;
  /** `null` deletes the param, a string sets it. Merges into the current `?...` — a filter never
   *  has to know about params other controls own (e.g. DateRangePicker doesn't clear `creatorId`). */
  setParams: (updates: Record<string, string | null>) => void;
};

const FilterTransitionContext = createContext<FilterTransitionValue | null>(null);

/**
 * Wraps a page's filter controls + the content they filter. Fixes a real UX bug found 21/08/2026:
 * a searchParams-only navigation (`router.replace` for a date-range/Creator filter) does NOT trigger
 * the route's `loading.tsx`, even inside `startTransition` — that Suspense boundary only fires when
 * *entering* a route segment, not when its own searchParams change. Without this, clicking a filter
 * did nothing visible until the new RSC payload arrived — reads as the UI being stuck/janky. Fix:
 * hold the transition's `isPending` here and let `FilterPendingOverlay` dim the content directly,
 * instead of hoping a route-level skeleton shows up on its own. See `date-range-picker.tsx` /
 * `creator-filter.tsx` for the controls that call `setParams`, and DESIGN_SYSTEM.md "Trạng thái chờ"
 * for the general rule this is an exception to.
 */
export function FilterTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function setParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }

  return <FilterTransitionContext.Provider value={{ isPending, setParams }}>{children}</FilterTransitionContext.Provider>;
}

export function useFilterTransition(): FilterTransitionValue {
  const ctx = useContext(FilterTransitionContext);
  if (!ctx) throw new Error("useFilterTransition must be used inside a FilterTransitionProvider.");
  return ctx;
}

/** Dims + disables the wrapped content while a filter change is in flight, so the numbers visibly
 *  read as "about to change" instead of just sitting there unchanged for however long the round
 *  trip takes. Wrap the data area (stat tiles, charts, tables) — not the filter controls themselves,
 *  those show their own local spinner instead (see date-range-picker.tsx). */
export function FilterPendingOverlay({ children }: { children: ReactNode }) {
  const { isPending } = useFilterTransition();
  return (
    <div
      aria-busy={isPending}
      className={`transition-opacity duration-150 ${isPending ? "pointer-events-none opacity-40" : "opacity-100"}`}
    >
      {children}
    </div>
  );
}
