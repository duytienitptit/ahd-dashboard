"use client";

import { useFilterTransition } from "./filter-transition";

/** URL-param-driven (`?teamId=`) dashboard filter — sibling of `CreatorFilterSelect`, same pattern.
 *  Team is purely an organizational grouping (CLAUDE.md, 21/08/2026): selecting one narrows
 *  `getDashboard()` down to channels whose current Creator belongs to it. Independent of the Creator
 *  filter — both can be set at once (an empty result if they don't overlap is an honest answer, not
 *  a bug to prevent). */
export function TeamFilterSelect({
  teams,
  selected,
}: {
  teams: { id: string; name: string }[];
  selected: string | null;
}) {
  const { isPending, setParams } = useFilterTransition();

  if (teams.length === 0) return null;

  return (
    <select
      value={selected ?? "all"}
      onChange={(e) => setParams({ teamId: e.target.value === "all" ? null : e.target.value })}
      disabled={isPending}
      className="h-[38px] rounded-btn border border-line bg-bg px-3 text-sm font-semibold outline-none disabled:opacity-60"
    >
      <option value="all">Tất cả Team</option>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
