"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { CreatorRank, RollupStat } from "@/lib/dashboard";
import { avatarPalette, formatCompact, initialsFromEnd } from "@/lib/format";
import { METRIC_TEXT_CLASS, METRIC_TONE, type MetricTone } from "@/lib/metric-tone";

import { CreatorEditForm, TeamGlyph } from "./creator-form";

export type CreatorRowData = {
  id: string;
  name: string;
  username: string;
  isActive: boolean;
  team: { id: string; name: string } | null;
  channels: { id: string; name: string; tiktokHandle: string }[];
  /** `null` = nothing measurable this period — render "—", never "0" (lib/dashboard.ts `sumViewsOrNull`). */
  totalViews: number | null;
  followersNow: number;
  videos: number;
  rank: CreatorRank;
};

export type TeamGroupData = {
  /** `null` = the synthetic "Chưa gán team" bucket — never a real team id. */
  id: string | null;
  name: string | null;
  rollup: RollupStat;
  creators: CreatorRowData[];
};

const RANK_STYLE: Record<CreatorRank, { label: string; bg: string; fg: string } | null> = {
  leader: { label: "Dẫn đầu view", bg: "bg-cyan-bg", fg: "text-cyan-ink" },
  growth: { label: "Tăng trưởng tốt", bg: "bg-green-bg", fg: "text-green-dark" },
  attention: { label: "Cần chú ý", bg: "bg-red-bg", fg: "text-red-dark" },
  stable: null,
};

const CREATOR_ROW_COLUMNS = "2.1fr 1.7fr 0.95fr 0.9fr 0.8fr 1.15fr 40px";

/** Sentinel accordion key for the unassigned bucket (`group.id` is `null` there, which can't round-trip
 *  through a URL query param) — matches the `?team=` value the creator detail page's "Chưa gán team"
 *  pill links back to. */
function groupKey(id: string | null): string {
  return id ?? "_unassigned";
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-ink-3 transition-transform duration-150"
      style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** Compact inline stat in a team's header row — same 3 numbers a member row shows, rolled up over
 *  every member's channels (`aggregateChannelStats`). Visible whether the panel is open or closed,
 *  so a Manager gets the team total at a glance without expanding it. */
function RollupStatChip({
  label,
  value,
  tone,
  deltaText,
  deltaGood,
}: {
  label: string;
  value: string;
  tone: MetricTone;
  /** Omit both to render just the value — "Tổng số like" has no period-over-period counterpart
   *  (current total, same as `TeamStatsRow`'s "Tổng số like" tile), unlike Lượt xem/Follower here. */
  deltaText?: string;
  deltaGood?: boolean | null;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[11.5px] text-ink-3">{label}</span>
      <span className={`text-[13px] font-bold ${METRIC_TEXT_CLASS[tone]}`}>{value}</span>
      {deltaText ? (
        <span className={`text-[11px] font-semibold ${deltaGood === null ? "text-ink-3" : deltaGood ? "text-green-dark" : "text-red-dark"}`}>
          {deltaText}
        </span>
      ) : null}
    </div>
  );
}

function CreatorRow({
  creator,
  teams,
  index,
}: {
  creator: CreatorRowData;
  teams: { id: string; name: string }[];
  index: number;
}) {
  const [editing, setEditing] = useState(false);
  const rankStyle = RANK_STYLE[creator.rank];
  const avatar = avatarPalette(index);

  if (editing) {
    return (
      <div className="border-t border-line-soft px-5 py-4">
        <CreatorEditForm creator={creator} teams={teams} onClose={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="grid items-center gap-3 border-t border-line-soft px-5 py-3.5" style={{ gridTemplateColumns: CREATOR_ROW_COLUMNS }}>
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-pill text-xs font-extrabold"
          style={{ background: avatar.bg, color: avatar.fg }}
        >
          {initialsFromEnd(creator.name)}
        </div>
        <div className="min-w-0">
          <Link href={`/creators/${creator.id}`} className="block truncate text-sm font-bold tracking-[-0.2px] hover:underline">
            {creator.name}
          </Link>
          <div className="truncate text-[11.5px] text-ink-3">{creator.username}</div>
        </div>
      </div>

      <div className="min-w-0 truncate text-[12.5px] text-ink-2">
        {creator.channels.length > 0 ? creator.channels.map((ch) => ch.name).join(", ") : <span className="text-ink-3">Chưa phụ trách kênh nào</span>}
      </div>

      <div className={`text-right text-sm font-bold ${METRIC_TEXT_CLASS[METRIC_TONE.views]}`}>
        {creator.totalViews !== null ? formatCompact(creator.totalViews) : "—"}
      </div>

      <div className={`text-right text-sm font-bold ${METRIC_TEXT_CLASS[METRIC_TONE.followers]}`}>{formatCompact(creator.followersNow)}</div>

      <div className={`text-right text-sm font-bold ${METRIC_TEXT_CLASS[METRIC_TONE.videos]}`}>{creator.videos}</div>

      <div className="flex flex-col items-end gap-1">
        <span
          className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-semibold ${
            creator.isActive ? "bg-green-bg text-green-dark" : "bg-line-soft text-ink-2"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-pill ${creator.isActive ? "bg-green" : "bg-ink-3"}`} />
          {creator.isActive ? "Đang hoạt động" : "Đã vô hiệu hoá"}
        </span>
        {rankStyle ? (
          <span className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold ${rankStyle.bg} ${rankStyle.fg}`}>{rankStyle.label}</span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => setEditing(true)}
        className="justify-self-end text-[12.5px] font-semibold text-red hover:opacity-80"
      >
        Sửa
      </button>
    </div>
  );
}

function TeamPanel({
  group,
  teams,
  defaultOpen,
  index,
}: {
  group: TeamGroupData;
  teams: { id: string; name: string }[];
  defaultOpen: boolean;
  index: number;
}) {
  const searchParams = useSearchParams();
  const requestedTeam = searchParams.get("team");
  const key = groupKey(group.id);
  const sectionRef = useRef<HTMLDivElement>(null);

  // Lazy initializer, not an effect — the URL param only ever needs to decide the FIRST render's
  // open state (arriving here via a "Xem team" link elsewhere), so this avoids the extra
  // render+setState-in-effect a `useEffect(() => setOpen(true), [])` would cost for the same result.
  const [open, setOpen] = useState(() => defaultOpen || requestedTeam === key);

  useEffect(() => {
    if (requestedTeam === key) sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Scroll-on-arrival only, once — not meant to re-fire on later unrelated searchParam changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `!== null` rather than `> 0`: a team whose views are unmeasured this period can still have real
  // followers/gain worth showing, and the views chip below renders "—" for it.
  const hasNumbers =
    (group.rollup.totalViews !== null && group.rollup.totalViews > 0) ||
    group.rollup.followersNow > 0 ||
    group.rollup.followerGain !== 0;
  const heading = group.name ?? "Chưa gán team";
  const avatar = avatarPalette(index);

  return (
    <div ref={sectionRef} id={`team-${key}`} className="overflow-hidden rounded-card border border-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-x-5 gap-y-2 px-5 py-4 text-left hover:bg-surface"
      >
        <div className="flex items-center gap-2.5">
          <ChevronIcon open={open} />
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill"
            style={{ background: avatar.bg, color: avatar.fg }}
          >
            <TeamGlyph />
          </div>
          <h2 className={`text-[15px] font-extrabold tracking-[-0.3px] ${group.name ? "text-ink" : "text-ink-2"}`}>{heading}</h2>
          <span className="text-[12.5px] text-ink-3">
            {group.creators.length} nhân sự · {group.creators.reduce((sum, c) => sum + c.channels.length, 0)} kênh
          </span>
        </div>

        {hasNumbers ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <RollupStatChip
              label="Lượt xem"
              value={group.rollup.totalViews !== null ? formatCompact(group.rollup.totalViews) : "—"}
              tone={METRIC_TONE.views}
            />
            <RollupStatChip label="Follower" value={formatCompact(group.rollup.followersNow)} tone={METRIC_TONE.followers} />
            <RollupStatChip label="Video" value={String(group.rollup.videos)} tone={METRIC_TONE.videos} />
          </div>
        ) : null}
      </button>

      {open ? (
        group.creators.length === 0 ? (
          <p className="border-t border-line-soft px-5 py-6 text-center text-[12.5px] text-ink-3">Team này chưa có nhân sự nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[820px]">
              <div className="grid gap-3 border-t border-line-soft bg-line-soft px-5 py-2.5 text-xs font-bold text-ink-2" style={{ gridTemplateColumns: CREATOR_ROW_COLUMNS }}>
                <div>Nhân sự</div>
                <div>Kênh phụ trách</div>
                <div className={`text-right ${METRIC_TEXT_CLASS[METRIC_TONE.views]}`}>Lượt xem</div>
                <div className={`text-right ${METRIC_TEXT_CLASS[METRIC_TONE.followers]}`}>Follower</div>
                <div className={`text-right ${METRIC_TEXT_CLASS[METRIC_TONE.videos]}`}>Video</div>
                <div className="text-right">Trạng thái</div>
                <div />
              </div>
              {group.creators.map((creator, i) => (
                <CreatorRow key={creator.id} creator={creator} teams={teams} index={i} />
              ))}
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}

/**
 * Team list as a set of collapsible panels — replaces the old always-expanded card grid grouped by
 * team (creator-form.tsx's former `TeamSection` + `CreatorCard`). Closed by default so a Manager
 * with several teams isn't staring at a long scroll of every member's card; opens automatically when
 * there's exactly one group, or when `?team=<id>` names it (the creator detail page's team pill links
 * back this way — "_unassigned" for the no-team bucket, see `groupKey`).
 */
export function TeamAccordion({ groups, teams }: { groups: TeamGroupData[]; teams: { id: string; name: string }[] }) {
  const soleGroup = groups.length === 1;
  return (
    <div className="flex flex-col gap-3.5">
      {groups.map((group, i) => (
        <TeamPanel key={groupKey(group.id)} group={group} teams={teams} defaultOpen={soleGroup} index={i} />
      ))}
    </div>
  );
}
