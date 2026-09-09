import { initialsFromEnd } from "@/lib/format";

/**
 * Người **dẫn đầu lượt xem toàn team** (`rankCreatorsAllTime` → "leader") được trang chi tiết tô
 * khác đi: avatar cúp vàng + huy hiệu "TOP 1" cạnh tên (09/09/2026, theo yêu cầu). Cùng nghĩa với
 * huy chương 🥇 ở `/creators` và thông báo `leader_flex`, chỉ đậm hơn vì đây là trang của riêng người
 * đó. Không phải leader → avatar xám thường, không huy hiệu.
 *
 * Dùng token `amber` (accent KPI/dẫn đầu) — không phải bộ `metric-tone`; khớp `RANK_STYLE.leader`
 * trong `team-board.tsx`.
 */

export function CreatorAvatar({ name, isLeader }: { name: string; isLeader: boolean }) {
  if (!isLeader) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-pill bg-line-soft text-lg font-extrabold text-ink-2">
        {initialsFromEnd(name)}
      </div>
    );
  }
  return (
    <div className="relative shrink-0">
      <div className="flex h-14 w-14 items-center justify-center rounded-pill bg-gradient-to-br from-amber to-amber-dark text-lg font-extrabold text-white shadow-[0_3px_12px_rgba(245,166,35,0.4)] ring-2 ring-amber/35 ring-offset-2 ring-offset-bg">
        {initialsFromEnd(name)}
      </div>
      <span
        className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-pill bg-bg text-[15px] leading-none shadow-[0_1px_5px_rgba(0,0,0,0.2)]"
        aria-hidden="true"
      >
        🏆
      </span>
    </div>
  );
}

export function LeaderBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-amber-bg px-2.5 py-[3px] text-[12px] font-extrabold text-amber-dark ring-1 ring-amber/30">
      <span aria-hidden="true">🏆</span>
      TOP 1 lượt xem toàn team
    </span>
  );
}
