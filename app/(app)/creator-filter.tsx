"use client";

import { useFilterTransition } from "./filter-transition";

/** URL-param-driven (`?creatorId=`) team-data filter for Tổng quan — Kênh's own Creator filter is
 *  separate (client-side only, over already-fetched rows) and unaffected by this. Must render inside
 *  a `FilterTransitionProvider` — see filter-transition.tsx for why the pending state lives there
 *  instead of a local `useTransition`. */
export function CreatorFilterSelect({
  creators,
  selected,
}: {
  creators: { id: string; name: string }[];
  selected: string | null;
}) {
  const { isPending, setParams } = useFilterTransition();

  if (creators.length === 0) return null;

  return (
    <select
      value={selected ?? "all"}
      onChange={(e) => setParams({ creatorId: e.target.value === "all" ? null : e.target.value })}
      disabled={isPending}
      className="h-[38px] rounded-btn border border-line bg-bg px-3 text-sm font-semibold outline-none disabled:opacity-60"
    >
      {/* "Tất cả Creator", not "Toàn team" — "Team" is now a real entity (TeamFilterSelect sits right
          next to this), the old wording would read as if it meant that instead of "mọi Creator". */}
      <option value="all">Tất cả Creator</option>
      {creators.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
