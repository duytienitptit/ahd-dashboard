import { genderLabelVi, territoryLabelVi } from "@/lib/audience-labels";
import type { ActivityHeatmap, AudienceShare, AudienceSnapshot, HashtagStat, ViewerRatio } from "@/lib/dashboard";
import { formatCompact, formatFullDate, formatRatePct, formatShortDate } from "@/lib/format";
import { METRIC_TEXT_CLASS, METRIC_TONE } from "@/lib/metric-tone";

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

/** Người xem trong NGÀY (không phải follower): bao nhiêu người xem video kênh hôm đó là người mới
 *  (chưa từng xem kênh này) vs quay lại. Chỉ `studio_import` (Viewers.csv) có — `display_api` không.
 *  "Lượt xem trang cá nhân" (Overview.csv) ghi chung row nên hiện cùng chỗ nếu ngày đó có. */
export function NewViewerRatioCard({ ratio }: { ratio: ViewerRatio | null }) {
  return (
    <Card
      title="Người xem: mới vs quay lại"
      subtitle="Trong ngày, bao nhiêu người xem video kênh là người mới (chưa từng xem) — chỉ có ở dữ liệu Studio đã đối chiếu"
    >
      {ratio === null ? (
        <Empty text="Chưa có dữ liệu Viewers.csv được import." />
      ) : (
        <>
          <div className="mb-1.5 flex items-baseline gap-2">
            <div className="text-[30px] font-extrabold leading-none tracking-[-1.1px]">{formatRatePct(ratio.ratio, 1)}</div>
            <div className="text-xs text-ink-3">là người xem mới</div>
          </div>
          <div className="mb-3 flex h-[7px] overflow-hidden rounded-pill bg-line-soft">
            <div className="h-[7px] rounded-pill bg-cyan" style={{ width: `${Math.min(100, ratio.ratio * 100)}%` }} />
          </div>
          <dl className="flex flex-col gap-1 text-[12px] text-ink-3">
            <div className="flex items-center justify-between">
              <dt>Người xem mới</dt>
              <dd className="font-semibold text-ink-2">{formatCompact(ratio.newViewers)}</dd>
            </div>
            {ratio.returningViewers !== null ? (
              <div className="flex items-center justify-between">
                <dt>Người xem quay lại</dt>
                <dd className="font-semibold text-ink-2">{formatCompact(ratio.returningViewers)}</dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <dt>Tổng người xem</dt>
              <dd className="font-semibold text-ink-2">{formatCompact(ratio.totalViewers)}</dd>
            </div>
            {ratio.profileViews !== null ? (
              <div className="flex items-center justify-between border-t border-line-soft pt-1.5">
                <dt>Lượt xem trang cá nhân</dt>
                <dd className="font-semibold text-ink-2">{formatCompact(ratio.profileViews)}</dd>
              </div>
            ) : null}
          </dl>
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

          {/* Thang màu + số — trước đây chỉ có màu, không biết đậm nhạt tương ứng số bao nhiêu.
              Ô đậm nhất đã tự hiện số ngay trên lưới ở trên, đây là
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
                  <span className={`font-bold ${METRIC_TEXT_CLASS[METRIC_TONE.views]}`}>{formatCompact(s.avgViews)}</span> view/video ·{" "}
                  {s.videos} video
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

function ShareRows({ shares, labelOf }: { shares: AudienceShare[]; labelOf: (key: string) => string }) {
  return (
    <div className="flex flex-col gap-3">
      {shares.map((s) => (
        <div key={s.key}>
          <div className="mb-[5px] flex items-baseline justify-between">
            <span className="text-[12.5px] font-semibold">{labelOf(s.key)}</span>
            <span className="text-[12px] text-ink-3">{formatRatePct(s.ratio, 1)}</span>
          </div>
          <div className="h-[5px] overflow-hidden rounded-pill bg-line-soft">
            {/* Bề rộng = tỷ lệ tuyệt đối trên 100% (không chuẩn hoá theo max) — đây là phần trăm thật,
                VN ~80% thì phải áp đảo về thị giác. */}
            <div className="h-[5px] rounded-pill bg-cyan" style={{ width: `${Math.min(100, s.ratio * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Nhân khẩu học khán giả — ảnh chụp mới nhất từ `audience_snapshot` (FollowerGender.csv +
 *  FollowerTopTerritories.csv). Một thẻ, không phải hai: cùng một bản chụp, một nguồn, và 4/9 kênh
 *  chưa từng có studio_import nên trạng thái rỗng là trường hợp thường gặp — tách hai thẻ sẽ nhân
 *  đôi cả chú thích lẫn empty state. */
export function AudienceCard({ snapshot }: { snapshot: AudienceSnapshot | null }) {
  return (
    <Card title="Khán giả của kênh" subtitle="Giới tính & khu vực follower, từ file Studio import">
      {snapshot === null ? (
        <Empty text="Chưa có dữ liệu nhân khẩu học — cần import file Studio (Followers_*.zip) có kèm FollowerGender.csv / FollowerTopTerritories.csv." />
      ) : (
        <>
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <div>
              <div className="mb-3 text-[12px] font-bold text-ink-2">Giới tính</div>
              {snapshot.gender.length > 0 ? (
                <ShareRows shares={snapshot.gender} labelOf={genderLabelVi} />
              ) : (
                <p className="text-[12px] text-ink-3">Không có dữ liệu giới tính.</p>
              )}
            </div>
            <div>
              <div className="mb-3 text-[12px] font-bold text-ink-2">Top khu vực</div>
              {snapshot.territories.length > 0 ? (
                <ShareRows shares={snapshot.territories.slice(0, 8)} labelOf={territoryLabelVi} />
              ) : (
                <p className="text-[12px] text-ink-3">Không có dữ liệu khu vực.</p>
              )}
            </div>
          </div>
          <div className="mt-4 text-[11px] text-ink-3">
            Ảnh chụp ngày {formatFullDate(snapshot.capturedOn)} · không có lịch sử, chỉ cập nhật khi import Studio
          </div>
        </>
      )}
    </Card>
  );
}
