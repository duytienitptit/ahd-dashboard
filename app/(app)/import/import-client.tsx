"use client";

import { useRef, useState } from "react";

type ChannelOption = { id: string; name: string; tiktokHandle: string };

type Discrepancy = { date: string; displayApi: number; studio: number; diffPct: number };

type ImportResult = {
  importedDates: string[];
  skippedRecentDates: string[];
  discrepancies: Discrepancy[];
  videosUpserted: number;
  readDates: number;
};

function StatTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="border-r border-line-soft px-[18px] py-3.5 last:border-r-0">
      <div className="mb-1.5 text-[11.5px] font-semibold text-ink-3">{label}</div>
      <div className="text-[19px] font-extrabold tracking-[-0.5px]" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

export function ImportClient({ channels }: { channels: ChannelOption[] }) {
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<"idle" | "loading" | "previewed" | "saved">("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    setFiles((prev) => {
      const byName = new Map(prev.map((f) => [f.name, f]));
      for (const file of Array.from(incoming)) byName.set(file.name, file);
      return [...byName.values()];
    });
    setPhase("idle");
    setResult(null);
    setError(null);
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
    setPhase("idle");
    setResult(null);
  }

  async function runImport(dryRun: boolean) {
    setPhase("loading");
    setError(null);

    const formData = new FormData();
    for (const file of files) formData.append("files[]", file);

    try {
      const res = await fetch(`/api/channels/${channelId}/import?dryRun=${dryRun}`, {
        method: "POST",
        body: formData,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Đã có lỗi xảy ra.");

      setResult(body as ImportResult);
      setPhase(dryRun ? "previewed" : "saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã có lỗi xảy ra.");
      setPhase("idle");
    }
  }

  const canPreview = channelId && files.length > 0 && phase !== "loading";

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[420px_minmax(0,1fr)]">
      <div className="flex flex-col gap-3.5">
        <div className="rounded-card border border-line p-5">
          <div className="mb-3 text-sm font-bold">1. Chọn kênh</div>
          <select
            value={channelId}
            onChange={(e) => {
              setChannelId(e.target.value);
              setPhase("idle");
              setResult(null);
            }}
            className="h-[52px] w-full rounded-input border border-ink bg-bg px-4 text-sm outline-none"
          >
            {channels.length === 0 ? <option value="">— Chưa có kênh —</option> : null}
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.tiktokHandle})
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-card border border-line p-5">
          <div className="mb-1 text-sm font-bold">2. Kéo thả 3-4 file zip</div>
          <p className="mb-3.5 text-[12.5px] leading-relaxed text-ink-3">
            Tải nguyên file <strong className="text-ink">.zip</strong> từ TikTok Studio — không cần
            giải nén. Bắt buộc: Overview, Followers, Viewers. Content (thư viện video) không bắt buộc.
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`mb-3.5 cursor-pointer rounded-card border-[1.5px] border-dashed px-5 py-[22px] text-center transition-colors ${
              dragOver ? "border-cyan bg-cyan-bg" : "border-cyan bg-cyan-bg"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
            <div className="text-[13.5px] font-bold text-cyan-ink">Kéo thả file vào đây</div>
            <div className="mt-1 text-xs text-cyan-ink-2">hoặc bấm để chọn</div>
          </div>

          {files.length > 0 ? (
            <div className="flex flex-col gap-2">
              {files.map((file) => (
                <div key={file.name} className="flex items-center gap-2.5 rounded-[6px] bg-line-soft px-3 py-2.5">
                  <div className="min-w-0 flex-grow">
                    <div className="truncate text-[12.5px] font-semibold">{file.name}</div>
                    <div className="text-[11px] text-ink-3">{(file.size / 1024).toFixed(0)} KB</div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(file.name);
                    }}
                    className="shrink-0 text-[11.5px] font-semibold text-ink-3 hover:text-red"
                  >
                    Xoá
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3.5">
        {error ? (
          <div role="alert" className="rounded-card border border-line bg-red-bg px-[18px] py-3.5 text-[12.5px] font-medium text-red-dark">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-card border border-line">
          <div className="border-b border-line-soft px-5 py-4">
            <div className="text-sm font-bold">3. Xem trước kết quả đọc file</div>
            <div className="mt-0.5 text-[12.5px] text-ink-3">
              {phase === "saved"
                ? "Đã lưu vào hệ thống."
                : "Kiểm tra trước khi lưu — chưa có gì ghi vào hệ thống."}
            </div>
          </div>

          {result ? (
            <>
              <div className="grid grid-cols-2 border-b border-line-soft sm:grid-cols-4">
                <StatTile label="Ngày đọc được" value={result.readDates} color="var(--color-ink)" />
                <StatTile label="Sẽ ghi" value={result.importedDates.length} color="var(--color-green-dark)" />
                <StatTile
                  label="Bỏ qua (trễ)"
                  value={result.skippedRecentDates.length}
                  color="var(--color-amber-dark)"
                />
                <StatTile
                  label="Lệch >10%"
                  value={result.discrepancies.length}
                  color="var(--color-red-dark)"
                />
              </div>

              {result.skippedRecentDates.length > 0 ? (
                <div className="border-b border-[#ffe0b3] bg-[#fffaf2] px-[18px] py-4">
                  <div className="text-[13px] font-bold text-amber-dark">
                    {result.skippedRecentDates.length} ngày gần nhất bị bỏ qua — đúng như thiết kế
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-amber-dark">
                    TikTok Studio trễ 2 ngày nên chưa có số cho {result.skippedRecentDates.join(", ")}.
                    Hệ thống giữ nguyên số tạm tính hiện có cho những ngày này, sẽ ghi đè ở lần nhập
                    tuần sau.
                  </p>
                </div>
              ) : null}

              {result.discrepancies.length > 0 ? (
                <div className="px-5 py-4">
                  <div className="mb-2.5 text-[12.5px] font-bold text-red-dark">Lệch &gt;10% so với số tạm tính</div>
                  <div className="grid grid-cols-4 gap-2 border-b border-line-soft pb-2 text-[11.5px] font-bold text-ink-2">
                    <div>Ngày</div>
                    <div className="text-right">Tạm tính</div>
                    <div className="text-right">Studio</div>
                    <div className="text-right">Lệch</div>
                  </div>
                  {result.discrepancies.map((d) => (
                    <div key={d.date} className="grid grid-cols-4 gap-2 border-b border-line-soft py-2 text-[12.5px]">
                      <div className="font-semibold">{d.date}</div>
                      <div className="text-right">{d.displayApi.toLocaleString("vi-VN")}</div>
                      <div className="text-right font-semibold">{d.studio.toLocaleString("vi-VN")}</div>
                      <div className="text-right font-bold text-red-dark">+{d.diffPct}%</div>
                    </div>
                  ))}
                </div>
              ) : null}

              {result.importedDates.length === 0 && result.discrepancies.length === 0 ? (
                <div className="px-5 py-10 text-center text-[13px] text-ink-3">
                  Không có ngày nào đủ điều kiện ghi trong lần đọc này.
                </div>
              ) : null}
            </>
          ) : (
            <div className="px-5 py-10 text-center text-[13px] text-ink-3">
              {phase === "loading" ? "Đang đọc file…" : "Chọn kênh và tải file để xem trước."}
            </div>
          )}
        </div>

        {result ? (
          <div className="flex items-center justify-between rounded-card border border-line px-5 py-4">
            <div className="text-[12.5px] text-ink-2">
              {phase === "saved" ? (
                "Đã lưu vào hệ thống."
              ) : (
                <>
                  Sẽ ghi <strong className="text-ink">{result.importedDates.length} ngày</strong> vào hệ
                  thống và cập nhật <strong className="text-ink">{result.videosUpserted} video</strong>
                </>
              )}
            </div>
            {phase !== "saved" ? (
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setPhase("idle");
                  }}
                  className="h-[38px] rounded-btn border border-line px-[18px] text-sm font-semibold hover:bg-surface"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  disabled={phase === "loading"}
                  onClick={() => runImport(false)}
                  className="h-[38px] rounded-btn bg-red px-5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {phase === "loading" ? "Đang lưu…" : "Lưu dữ liệu"}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            disabled={!canPreview}
            onClick={() => runImport(true)}
            className="h-[42px] self-start rounded-btn bg-ink px-5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40"
          >
            {phase === "loading" ? "Đang đọc…" : "Xem trước"}
          </button>
        )}
      </div>
    </div>
  );
}
