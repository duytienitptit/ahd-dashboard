"use client";

import { useState } from "react";

import { CreatorEditForm } from "../creator-form";

/** Small client wrapper so the (server component) detail page can offer the same inline edit form
 *  the accordion row uses, without the whole page needing "use client". */
export function CreatorEditToggle({
  creator,
  teams,
}: {
  creator: { id: string; name: string; isActive: boolean; team: { id: string; name: string } | null };
  teams: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState(false);

  if (editing) return <CreatorEditForm creator={creator} teams={teams} onClose={() => setEditing(false)} />;

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="flex h-9 items-center rounded-btn border border-line px-3.5 text-[12.5px] font-semibold hover:bg-surface"
    >
      Sửa thông tin
    </button>
  );
}
