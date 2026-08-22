"use client";

import { useState } from "react";

type ChannelOauthStatus = {
  channelId: string;
  channelName: string;
  connected: boolean;
  refreshExpiresAt: string | null;
  daysUntilExpiry: number | null;
  lastSyncAt: string | null;
  lastSyncStatus: "ok" | "failed" | "rate_limited" | null;
  accountVerified: boolean;
};

type SyncResult = {
  date: string;
  synced: number;
  failed: number;
  unverified: number;
  incomplete: { channelId: string; expectedVideos: number; gotVideos: number }[];
};

type Message =
  | { type: "error" | "warning" | "connected"; text: string }
  // account_mismatch was blocked outright (nothing saved) — needs its own shape so the "Vẫn kết
  // nối" button can retry oauth/start with ?ack=1 for the right channel.
  | { type: "mismatch"; channelId: string; expected: string; actual: string };

const WARN_THRESHOLD_DAYS = 30;

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function statusBadge(row: ChannelOauthStatus) {
  if (!row.connected) {
    return { label: "Mất kết nối", bg: "bg-red-bg", fg: "text-red-dark", dot: "bg-red" };
  }
  // Persistent, not a one-time banner — the 21/08/2026 wrong-account incident went unnoticed
  // exactly because the warning only showed once, right after connecting.
  if (!row.accountVerified) {
    return { label: "Chưa xác minh", bg: "bg-amber-bg", fg: "text-amber-dark", dot: "bg-amber" };
  }
  if ((row.daysUntilExpiry ?? Infinity) < WARN_THRESHOLD_DAYS) {
    return { label: "Sắp hết hạn", bg: "bg-amber-bg", fg: "text-amber-dark", dot: "bg-amber" };
  }
  return { label: "Đang chạy", bg: "bg-green-bg", fg: "text-green-dark", dot: "bg-green" };
}

const SYNC_STATUS_LABEL: Record<string, string> = {
  ok: "thành công",
  failed: "lỗi",
  rate_limited: "bị giới hạn tốc độ",
};

export function ConnectionsClient({
  initialStatus,
  initialMessage,
  isManager,
}: {
  initialStatus: ChannelOauthStatus[];
  initialMessage: Message | null;
  isManager: boolean;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState(initialMessage);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  async function refreshStatus() {
    const res = await fetch("/api/channels/oauth/status");
    if (res.ok) setStatus(await res.json());
  }

  async function handleConnect(channelId: string, opts: { ack?: boolean } = {}) {
    setConnectingId(channelId);
    setMessage(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/oauth/start${opts.ack ? "?ack=1" : ""}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Không tạo được URL kết nối.");
      window.location.assign(body.url);
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Đã có lỗi xảy ra." });
      setConnectingId(null);
    }
  }

  /** Manual confirm for a connection Display API itself can't verify (zero-video TikTok account —
   *  see app/api/channels/[id]/oauth/verify/route.ts). Distinct from handleConnect: no new OAuth
   *  round trip, just flips account_verified on the connection already saved. */
  async function handleVerify(channelId: string) {
    setConnectingId(channelId);
    setMessage(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/oauth/verify`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Xác nhận thất bại.");
      await refreshStatus();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Đã có lỗi xảy ra." });
    } finally {
      setConnectingId(null);
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    setSyncResult(null);
    setMessage(null);
    try {
      const res = await fetch("/api/sync/display-api", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Đồng bộ thất bại.");
      setSyncResult(body as SyncResult);
      await refreshStatus();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Đã có lỗi xảy ra." });
    } finally {
      setSyncing(false);
    }
  }

  const deadCount = status.filter((s) => !s.connected).length;
  const warnCount = status.filter((s) => s.connected && (s.daysUntilExpiry ?? Infinity) < WARN_THRESHOLD_DAYS).length;

  return (
    <div>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.6px]">Kết nối Display API</h1>
          <p className="mt-1.5 text-[13px] text-ink-3">Đồng bộ tự động 03:00 mỗi ngày (giờ VN)</p>
        </div>
        {isManager ? (
          // Đồng bộ toàn bộ kênh active cùng lúc (POST /api/sync/display-api yêu cầu Manager) — ẩn
          // với Creator, họ chỉ quản lý kết nối của đúng kênh mình, không phải thao tác toàn hệ thống.
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={syncing}
            className="flex h-[38px] items-center gap-1.5 rounded-btn border border-line px-4 text-sm font-semibold hover:bg-surface disabled:opacity-60"
          >
            {syncing ? "Đang đồng bộ…" : "Chạy đồng bộ ngay"}
          </button>
        ) : null}
      </div>

      {message?.type === "mismatch" ? (
        <div role="alert" className="mb-3.5 rounded-card border border-line bg-red-bg px-[18px] py-3.5 text-[13px]">
          <div className="font-bold text-red-dark">
            Không kết nối — tài khoản TikTok vừa Authorize là{" "}
            <strong>@{message.actual}</strong>, nhưng kênh này là <strong>@{message.expected}</strong>.
          </div>
          <div className="mt-1.5 text-red-dark">
            Nếu đây đúng là tài khoản của kênh (ví dụ handle đổi tên gần đây), bấm nút dưới để vẫn kết
            nối. Nếu không chắc, đăng xuất tài khoản TikTok đó trên trình duyệt rồi thử lại.
          </div>
          <button
            type="button"
            disabled={connectingId === message.channelId}
            onClick={() => handleConnect(message.channelId, { ack: true })}
            className="mt-2.5 flex h-8 items-center rounded-btn border border-red-dark px-3.5 text-[12.5px] font-bold text-red-dark hover:bg-red-bg/60 disabled:opacity-60"
          >
            {connectingId === message.channelId ? "Đang mở…" : "Vẫn kết nối"}
          </button>
        </div>
      ) : message ? (
        <div
          role="alert"
          className={`mb-3.5 rounded-card border border-line px-[18px] py-3.5 text-[13px] font-medium ${
            message.type === "error"
              ? "bg-red-bg text-red-dark"
              : message.type === "warning"
                ? "bg-amber-bg text-amber-dark"
                : "bg-green-bg text-green-dark"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      {syncResult ? (
        <div className="mb-3.5 rounded-card border border-line px-[18px] py-3.5 text-[13px]">
          Đồng bộ xong: <strong>{syncResult.synced}</strong> kênh thành công,{" "}
          <strong>{syncResult.failed}</strong> lỗi
          {syncResult.unverified > 0 ? `, ${syncResult.unverified} kênh bỏ qua vì chưa xác minh` : ""}
          {syncResult.incomplete.length > 0 ? `, ${syncResult.incomplete.length} kênh thiếu video` : ""}.
        </div>
      ) : null}

      {deadCount > 0 || warnCount > 0 ? (
        <div className="mb-3.5 rounded-card border border-line bg-red-bg px-[18px] py-4">
          <div className="text-[13.5px] font-bold text-red-dark">
            {[deadCount > 0 ? `${deadCount} kênh mất kết nối` : null, warnCount > 0 ? `${warnCount} kênh sắp hết hạn` : null]
              .filter(Boolean)
              .join(", ")}
          </div>
          <div className="mt-1.5 text-[12.5px] leading-relaxed text-red-dark">
            Kênh mất kết nối sẽ ngừng có số liệu hằng ngày cho tới khi kết nối lại. Số cuối tuần từ
            file Studio vẫn về bình thường, nên dữ liệu không mất — chỉ chậm.
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-card border border-line">
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[1.9fr_1.2fr_1.3fr_1.5fr_1fr] gap-3.5 bg-line-soft px-5 py-3 text-xs font-bold text-ink-2">
              <div>Kênh</div>
              <div>Kết nối</div>
              <div>Đồng bộ gần nhất</div>
              <div>Hạn kết nối lại</div>
              <div className="text-right">Thao tác</div>
            </div>

            {status.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-ink-3">Chưa có kênh nào.</div>
            ) : (
              status.map((row) => {
                const badge = statusBadge(row);
                const pct =
                  row.daysUntilExpiry !== null ? Math.max(0, Math.min(100, Math.round((row.daysUntilExpiry / 365) * 100))) : 0;
                const showConnectButton = !row.connected || (row.daysUntilExpiry ?? Infinity) < WARN_THRESHOLD_DAYS;

                return (
                  <div
                    key={row.channelId}
                    className="grid grid-cols-[1.9fr_1.2fr_1.3fr_1.5fr_1fr] items-center gap-3.5 border-t border-line-soft px-5 py-3.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-line-soft text-[11px] font-extrabold text-ink-2">
                        {initials(row.channelName)}
                      </div>
                      <div className="truncate text-[13.5px] font-bold">{row.channelName}</div>
                    </div>

                    <div>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-bold ${badge.bg} ${badge.fg}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-pill ${badge.dot}`} />
                        {badge.label}
                      </span>
                    </div>

                    <div>
                      <div className="text-[12.5px] font-semibold">
                        {row.lastSyncAt ? new Date(row.lastSyncAt).toLocaleString("vi-VN") : "—"}
                      </div>
                      <div className="text-[11px] text-ink-3">
                        {row.lastSyncStatus ? SYNC_STATUS_LABEL[row.lastSyncStatus] : "chưa đồng bộ"}
                      </div>
                    </div>

                    <div>
                      {row.connected ? (
                        <>
                          <div className="mb-1 text-[12.5px] font-bold">Còn {row.daysUntilExpiry} ngày</div>
                          <div className="h-1 overflow-hidden rounded-pill bg-line-soft">
                            <div
                              className={`h-1 rounded-pill ${
                                (row.daysUntilExpiry ?? Infinity) < WARN_THRESHOLD_DAYS ? "bg-amber" : "bg-cyan"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </>
                      ) : (
                        <span className="text-[12.5px] font-bold text-red-dark">Chưa kết nối</span>
                      )}
                    </div>

                    <div className="flex justify-end gap-2">
                      {row.connected && !row.accountVerified ? (
                        <button
                          type="button"
                          disabled={connectingId === row.channelId}
                          onClick={() => handleVerify(row.channelId)}
                          title="Chỉ bấm khi chắc chắn tài khoản TikTok vừa Authorize đúng là kênh này"
                          className="flex h-8 items-center rounded-btn border border-amber-dark px-3.5 text-[12.5px] font-bold text-amber-dark hover:bg-amber-bg disabled:opacity-60"
                        >
                          {connectingId === row.channelId ? "Đang xác nhận…" : "Xác nhận đúng tài khoản"}
                        </button>
                      ) : null}
                      {showConnectButton ? (
                        <button
                          type="button"
                          disabled={connectingId === row.channelId}
                          onClick={() => handleConnect(row.channelId)}
                          className="flex h-8 items-center rounded-btn bg-red px-3.5 text-[12.5px] font-bold text-white hover:opacity-90 disabled:opacity-60"
                        >
                          {connectingId === row.channelId ? "Đang mở…" : row.connected ? "Kết nối lại" : "Kết nối"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
