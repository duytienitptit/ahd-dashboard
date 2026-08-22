import type { ActivityHeatmap, ChannelVideo, HashtagStat, ViewerRatio } from "@/lib/dashboard";
import { formatCompact, formatFullDate, formatRatePct, formatShortDate } from "@/lib/format";

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line px-5 py-[18px]">
      <div className="text-[15px] font-bold">{title}</div>
      {subtitle ? <div className="mt-[3px] text-xs text-ink-3">{subtitle}</div> : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-[12.5px] text-ink-3">{text}</p>;
}

export function NewViewerRatioCard({ ratio }: { ratio: ViewerRatio | null }) {
  return (
    <Card title="Tỷ lệ khán giả mới" subtitle="newViewers / totalViewers, chỉ có ở nguồn đã đối chiếu">
      {ratio === null ? (
        <Empty text="Chưa có dữ liệu Viewers.csv được import." />
      ) : (
        <>
          <div className="mb-1.5 flex items-baseline gap-2">
            <div className="text-[30px] font-extrabold leading-none tracking-[-1.1px]">{formatRatePct(ratio.ratio, 1)}</div>
            <div className="text-xs text-ink-3">khán giả mới</div>
          </div>
          <div className="mb-3 flex h-[7px] overflow-hidden rounded-pill bg-line-soft">
            <div className="h-[7px] rounded-pill bg-cyan" style={{ width: `${Math.min(100, ratio.ratio * 100)}%` }} />
          </div>
          <div className="flex items-center justify-between text-[12px] text-ink-3">
            <span>{formatCompact(ratio.newViewers)} người xem mới</span>
            <span>{formatCompact(ratio.totalViewers)} tổng người xem</span>
          </div>
          <div className="mt-2 text-[11px] text-ink-3">Số liệu ngày {formatFullDate(ratio.date)}</div>
        </>
      )}
    </Card>
  );
}

const HOUR_LABEL_STEP = 3;

/** Ô đậm nhất trong lưới — nếu ngày/giờ nào chạm mốc này, hiện số ngay trên ô thay vì chỉ có màu,
 *  vì đây là điểm dữ liệu người xem chắc chắn muốn đọc được không cần hover. */
function isPeakCell(value: number | null, max: number): boolean {
  return value !== null && max > 0 && value === max;
}

export function ActivityHeatmapCard({ heatmap }: { heatmap: ActivityHeatmap }) {
  return (
    <Card title="Giờ vàng đăng bài" subtitle="Follower hoạt động theo giờ, 7 ngày gần nhất được đồng bộ">
      {heatmap.dates.length === 0 ? (
        <Empty text="Chưa có dữ liệu FollowerActivity.csv — cần import file Studio có kèm FollowerActivity.csv (tuỳ chọn, không phải mọi lần export đều có)." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <div style={{ minWidth: `${60 + heatmap.dates.length * 46}px` }}>
              <div className="grid gap-[3px]" style={{ gridTemplateColumns: `44px repeat(${heatmap.dates.length}, 1fr)` }}>
                <div />
                {heatmap.dates.map((d) => (
                  <div key={d} className="pb-1.5 text-center text-[10.5px] font-semibold text-ink-3">
                    {formatShortDate(d)}
                  </div>
                ))}

                {heatmap.hours.map((hour, hourIdx) => (
                  <div key={hour} className="contents">
                    <div className="flex items-center justify-end pr-1.5 text-[10px] text-ink-3">
                      {hour % HOUR_LABEL_STEP === 0 ? `${hour}h` : ""}
                    </div>
                    {heatmap.dates.map((d, dateIdx) => {
                      const value = heatmap.grid[hourIdx][dateIdx];
                      const pct = value === null || heatmap.max === 0 ? 0 : Math.round((value / heatmap.max) * 100);
                      return (
                        <div
                          key={d}
                          title={value === null ? "Không có dữ liệu" : `${value} follower hoạt động`}
                          className="flex h-[10px] items-center justify-center rounded-[2px] text-[7px] font-bold leading-none text-cyan-ink-2"
                          style={{
                            background:
                              value === null
                                ? "var(--color-line-soft)"
                                : `color-mix(in srgb, var(--color-cyan) ${Math.max(pct, 8)}%, white)`,
                          }}
                        >
                          {isPeakCell(value, heatmap.max) ? formatCompact(value!) : ""}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Thang màu + số — trước đây chỉ có màu, không biết đậm nhạt tương ứng số bao nhiêu
              (docs/TASKS.md Đợt 2 #1). Ô đậm nhất đã tự hiện số ngay trên lưới ở trên, đây là
              thang tham chiếu chung cho phần còn lại. */}
          <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-3">
            <span>Ít hoạt động</span>
            <div className="flex h-2 flex-1 max-w-[160px] overflow-hidden rounded-pill">
              {[8, 25, 45, 65, 85, 100].map((pct) => (
                <div key={pct} className="flex-1" style={{ background: `color-mix(in srgb, var(--color-cyan) ${pct}%, white)` }} />
              ))}
            </div>
            <span>
              Nhiều hoạt động · cao nhất <span className="font-semibold text-ink">{formatCompact(heatmap.max)}</span> follower/giờ
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

export function HashtagTable({ stats }: { stats: HashtagStat[] }) {
  const top = stats.slice(0, 10);
  const max = Math.max(1, ...top.map((s) => s.avgViews));

  return (
    <Card title="Hiệu quả theo hashtag" subtitle="View trung bình mỗi video mang hashtag này">
      {top.length === 0 ? (
        <Empty text="Chưa có video nào có đủ số view để tính — cần kết nối Display API hoặc import Content.csv có kèm số view." />
      ) : (
        <div className="flex flex-col gap-3">
          {top.map((s) => (
            <div key={s.hashtag}>
              <div className="mb-[5px] flex items-baseline justify-between">
                <span className="text-[12.5px] font-semibold">#{s.hashtag}</span>
                <span className="text-[12px] text-ink-3">
                  <span className="font-bold text-ink">{formatCompact(s.avgViews)}</span> view/video · {s.videos} video
                </span>
              </div>
              <div className="h-[5px] overflow-hidden rounded-pill bg-line-soft">
                <div className="h-[5px] rounded-pill bg-cyan" style={{ width: `${(s.avgViews / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function VideoList({ videos, totalVideoCount }: { videos: ChannelVideo[]; totalVideoCount: number | null }) {
  const top = videos.slice(0, 12);
  // `videos.length` is what OUR db has rows for (Content.csv 15-row cap, or however many Display
  // API has synced so far) — `totalVideoCount` is TikTok's own reported total (data_snapshot's
  // video_count). CLAUDE.md: don't silently swap one for the other — when they disagree, say both,
  // so "7 video đã biết" doesn't read as "kênh chỉ có 7 video".
  const subtitle =
    totalVideoCount !== null && totalVideoCount !== videos.length
      ? `${videos.length} video đã biết trong hệ thống · TikTok báo tổng ${totalVideoCount} video`
      : `${videos.length} video đã biết`;
  return (
    <Card title="Video gần đây" subtitle={subtitle}>
      {top.length === 0 ? (
        <Empty text="Chưa có video nào — import Content.csv hoặc kết nối Display API." />
      ) : (
        <div className="flex flex-col gap-3">
          {top.map((v) => (
            <a
              key={v.id}
              href={v.videoLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-start justify-between gap-3 rounded-input border border-line-soft px-3 py-2.5 hover:border-line"
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold">{v.title ?? v.videoLink}</div>
                <div className="mt-0.5 text-[11px] text-ink-3">
                  {v.postedAt ? formatFullDate(v.postedAt.slice(0, 10)) : "Không rõ ngày đăng"}
                </div>
              </div>
              <div className="shrink-0 text-right text-[13px] font-bold">
                {v.latestViews !== null ? formatCompact(v.latestViews) : "—"}
              </div>
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}
