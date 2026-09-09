"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { CreatorRank, RollupStat } from "@/lib/dashboard";
import { avatarPalette, formatCompact, initialsFromEnd } from "@/lib/format";
import { METRIC_TEXT_CLASS, METRIC_TONE } from "@/lib/metric-tone";

import { Modal } from "../modal";
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

const RANK_STYLE: Record<CreatorRank, { label: string; bg: string; fg: string; medal?: boolean } | null> = {
  // "medal" — huy chương vàng cho người dẫn đầu view (08/09/2026, theo yêu cầu "trông nổi bật hơn").
  // Emoji 🥇 gánh phần "vàng"; màu amber giữ badge đọc được (amber ở chỗ khác là cảnh báo, nhưng 🥇 +
  // viền vàng quanh thẻ đã đủ tách nghĩa).
  leader: { label: "Dẫn đầu view", bg: "bg-amber-bg", fg: "text-amber-dark", medal: true },
  growth: { label: "Tăng trưởng tốt", bg: "bg-green-bg", fg: "text-green-dark" },
  attention: { label: "Cần chú ý", bg: "bg-red-bg", fg: "text-red-dark" },
  stable: null,
};

/** Sentinel key for the unassigned bucket (`group.id` is `null`, can't round-trip a URL param) —
 *  matches the `?team=` value the creator detail page's "Chưa gán team" pill links back to. */
function groupKey(id: string | null): string {
  return id ?? "_unassigned";
}

/** One compact stat inside a creator card / column header. */
function MiniStat({ label, value, tone }: { label: string; value: string; tone: (typeof METRIC_TONE)[keyof typeof METRIC_TONE] }) {
  return (
    <div className="min-w-0">
      <div className={`truncate text-[13px] font-bold ${METRIC_TEXT_CLASS[tone]}`}>{value}</div>
      <div className="truncate text-[10.5px] text-ink-3">{label}</div>
    </div>
  );
}

function CreatorCard({
  creator,
  teams,
  index,
  canManage,
}: {
  creator: CreatorRowData;
  teams: { id: string; name: string }[];
  index: number;
  /** `false` for a Creator viewing the board — hides the "Sửa" control + its Modal (09/09/2026). */
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const rankStyle = RANK_STYLE[creator.rank];
  const isLeader = creator.rank === "leader";
  const avatar = avatarPalette(index);

  return (
    <div
      className={`rounded-input border bg-bg px-3 py-3 ${
        isLeader ? "border-amber ring-1 ring-amber/30" : "border-line-soft hover:border-line"
      }`}
    >
      {canManage ? (
        <Modal open={editing} onClose={() => setEditing(false)} title={`Sửa nhân sự — ${creator.name}`}>
          <CreatorEditForm creator={creator} teams={teams} onClose={() => setEditing(false)} bare />
        </Modal>
      ) : null}

      <div className="flex items-start gap-2.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-xs font-extrabold"
          style={{ background: avatar.bg, color: avatar.fg }}
        >
          {initialsFromEnd(creator.name)}
        </div>
        <div className="min-w-0 flex-1">
          <Link href={`/creators/${creator.id}`} className="block truncate text-[13.5px] font-bold tracking-[-0.2px] hover:underline">
            {creator.name}
          </Link>
          <div className="truncate text-[11px] text-ink-3">{creator.username}</div>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 text-[12px] font-semibold text-red hover:opacity-80"
          >
            Sửa
          </button>
        ) : null}
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <MiniStat
          label="lượt xem"
          value={creator.totalViews !== null ? formatCompact(creator.totalViews) : "—"}
          tone={METRIC_TONE.views}
        />
        <MiniStat label="follower" value={formatCompact(creator.followersNow)} tone={METRIC_TONE.followers} />
        <MiniStat label="video" value={String(creator.videos)} tone={METRIC_TONE.videos} />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[10.5px] font-semibold ${
            creator.isActive ? "bg-green-bg text-green-dark" : "bg-line-soft text-ink-2"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-pill ${creator.isActive ? "bg-green" : "bg-ink-3"}`} />
          {creator.isActive ? "Đang hoạt động" : "Đã vô hiệu hoá"}
        </span>
        {rankStyle ? (
          <span
            className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[10.5px] font-semibold ${rankStyle.bg} ${rankStyle.fg} ${
              rankStyle.medal ? "ring-1 ring-amber/40" : ""
            }`}
          >
            {rankStyle.medal ? <span aria-hidden>🥇</span> : null}
            {rankStyle.label}
          </span>
        ) : null}
      </div>

      <div className="mt-2 truncate text-[11px] text-ink-3">
        {creator.channels.length > 0 ? (
          creator.channels.map((ch) => ch.name).join(", ")
        ) : (
          <span>Chưa phụ trách kênh nào</span>
        )}
      </div>
    </div>
  );
}

function TeamColumn({
  group,
  teams,
  index,
  canManage,
}: {
  group: TeamGroupData;
  teams: { id: string; name: string }[];
  index: number;
  canManage: boolean;
}) {
  const searchParams = useSearchParams();
  const requestedTeam = searchParams.get("team");
  const key = groupKey(group.id);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (requestedTeam === key) ref.current?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    // Scroll-on-arrival only, once — same rule as the old accordion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const heading = group.name ?? "Chưa gán team";
  const avatar = avatarPalette(index);
  const channelCount = group.creators.reduce((sum, c) => sum + c.channels.length, 0);
  const hasNumbers =
    (group.rollup.totalViews !== null && group.rollup.totalViews > 0) ||
    group.rollup.followersNow > 0 ||
    group.rollup.followerGain !== 0;

  return (
    <div
      ref={ref}
      id={`team-${key}`}
      className={`flex w-[320px] shrink-0 flex-col overflow-hidden rounded-card border ${
        requestedTeam === key ? "border-cyan" : "border-line"
      }`}
    >
      {/* Nền `line-soft` (cùng tông nền header bảng khắp app) + viền dưới → tách rõ vùng "tổng số
          liệu team" khỏi danh sách thẻ nhân sự nền trắng bên dưới (08/09/2026, theo yêu cầu). */}
      <div className="border-b border-line bg-line-soft px-4 py-3.5">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill"
            style={{ background: avatar.bg, color: avatar.fg }}
          >
            <TeamGlyph />
          </div>
          <h2 className={`truncate text-[14px] font-extrabold tracking-[-0.3px] ${group.name ? "text-ink" : "text-ink-2"}`}>
            {heading}
          </h2>
        </div>
        <div className="mt-1 text-[11.5px] text-ink-3">
          {group.creators.length} nhân sự · {channelCount} kênh
        </div>
        {hasNumbers ? (
          <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-line/70 pt-2.5">
            <MiniStat
              label="lượt xem"
              value={group.rollup.totalViews !== null ? formatCompact(group.rollup.totalViews) : "—"}
              tone={METRIC_TONE.views}
            />
            <MiniStat label="follower" value={formatCompact(group.rollup.followersNow)} tone={METRIC_TONE.followers} />
            <MiniStat label="video" value={String(group.rollup.videos)} tone={METRIC_TONE.videos} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-3">
        {group.creators.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-ink-3">Team này chưa có nhân sự nào.</p>
        ) : (
          group.creators.map((creator, i) => (
            <CreatorCard key={creator.id} creator={creator} teams={teams} index={i} canManage={canManage} />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Trang Nhân sự dạng bảng kanban — mỗi team một CỘT, mọi nhân sự hiện sẵn (08/09/2026, theo yêu cầu:
 * "vào trang là xem được toàn bộ nhân sự luôn"). Thay cho `TeamAccordion` gập/mở trước đó — accordion
 * đóng mặc định bắt Manager bấm từng team mới thấy người. Cột cuộn ngang khi nhiều team; "Chưa gán
 * team" là một cột như mọi cột khác. `?team=<id>` (từ pill team ở trang chi tiết Creator) cuộn cột đó
 * vào tầm nhìn + viền cyan.
 */
export function TeamBoard({
  groups,
  teams,
  canManage,
}: {
  groups: TeamGroupData[];
  teams: { id: string; name: string }[];
  /** `false` = a Creator viewing the board read-only — no "Sửa" on any card (09/09/2026). */
  canManage: boolean;
}) {
  return (
    <div className="scroll-thin flex gap-3.5 overflow-x-auto pb-2">
      {groups.map((group, i) => (
        <TeamColumn key={groupKey(group.id)} group={group} teams={teams} index={i} canManage={canManage} />
      ))}
    </div>
  );
}
