"use client";

import Link from "next/link";
import { useState } from "react";

import { avatarPalette, formatFullDate, initialsFromStart } from "@/lib/format";
import type { KpiCycleWithProgress } from "@/lib/kpi";
import { METRIC_TEXT_CLASS, METRIC_TONE, type MetricTone } from "@/lib/metric-tone";

import { ConfirmDeleteForm } from "../confirm-delete-form";
import { deleteKpiCycleAction } from "./actions";
import { KpiHealthBadge, metricText } from "./kpi-widgets";

type ChannelInfo = { id: string; name: string; tiktokHandle: string };

type MetricKey = "views" | "videos" | "followers";

const METRIC_ROWS: { key: MetricKey; targetKey: "targetViews" | "targetVideos" | "targetFollowers"; unit: string; tone: MetricTone }[] = [
  { key: "views", targetKey: "targetViews", unit: "view", tone: METRIC_TONE.views },
  { key: "videos", targetKey: "targetVideos", unit: "video", tone: METRIC_TONE.videos },
  { key: "followers", targetKey: "targetFollowers", unit: "follower", tone: METRIC_TONE.followers },
];

function actualFor(cycle: KpiCycleWithProgress, key: MetricKey): number | null {
  if (key === "views") return cycle.actuals.views;
  if (key === "videos") return cycle.actuals.videos;
  return cycle.actuals.followersNow;
}

function pctFor(cycle: KpiCycleWithProgress, key: MetricKey): number | null {
  if (key === "views") return cycle.progress.viewsPct;
  if (key === "videos") return cycle.progress.videosPct;
  return cycle.progress.followersPct;
}

/** One `/kpi` list row — Manager gets Sửa/Xoá, Creator gets a read-only row (RLS lets a Creator read
 *  any cycle, docs/API_SPEC.md already narrows the LIST to their own channels server-side; this
 *  component just never renders the action buttons for that role). */
export function KpiRow({
  cycle,
  channel,
  index,
  isManager,
}: {
  cycle: KpiCycleWithProgress;
  channel: ChannelInfo;
  index: number;
  isManager: boolean;
}) {
  const [deleting, setDeleting] = useState(false);
  const canDelete = isManager && cycle.status === "draft";
  const boundDelete = deleteKpiCycleAction.bind(null, cycle.id, channel.id);

  if (deleting) {
    return (
      <div className="px-5 py-4">
        <ConfirmDeleteForm
          action={boundDelete}
          entityName={`${channel.name} ${formatFullDate(cycle.periodStart)}-${formatFullDate(cycle.periodEnd)}`}
          fieldLabel="kênh + khoảng ngày"
          warning="Xoá chu kỳ KPI này — chỉ xoá được khi còn ở trạng thái nháp, không phục hồi được."
          onCancel={() => setDeleting(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4 px-5 py-4">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-[12px] font-extrabold"
        style={{ background: avatarPalette(index).bg, color: avatarPalette(index).fg }}
      >
        {initialsFromStart(channel.name)}
      </span>

      <div className="min-w-[160px] flex-1">
        <Link href={`/channels/${channel.id}`} className="text-sm font-semibold hover:underline">
          {channel.name}
        </Link>
        <div className="text-[11.5px] text-ink-3">
          {formatFullDate(cycle.periodStart)} – {formatFullDate(cycle.periodEnd)}
          {cycle.status === "final" ? " · đã chốt sổ" : ""}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {METRIC_ROWS.map(({ key, targetKey, unit, tone }) => {
          const target = cycle[targetKey];
          if (target === null) return null;
          const actual = actualFor(cycle, key);
          const pct = pctFor(cycle, key);
          return (
            <div key={key} className="text-[11.5px]">
              <span className={`font-bold ${METRIC_TEXT_CLASS[tone]}`}>
                {pct !== null ? `${pct}%` : "—"}
              </span>{" "}
              <span className="text-ink-3">{metricText(actual, target, unit)}</span>
            </div>
          );
        })}
      </div>

      <KpiHealthBadge health={cycle.health} />

      {isManager ? (
        <div className="flex shrink-0 items-center gap-3">
          {cycle.status === "draft" ? (
            <Link href={`/kpi/${cycle.id}/edit`} className="text-[12.5px] font-semibold text-red hover:opacity-80">
              Sửa
            </Link>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              onClick={() => setDeleting(true)}
              className="text-[12.5px] font-semibold text-ink-3 hover:text-red-dark"
            >
              Xoá
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
