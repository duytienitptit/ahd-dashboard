"use client";

import { useState } from "react";

type ChannelOauthStatus = {
  channelId: string;
  channelName: string;
  expectedHandle: string;
  connected: boolean;
  refreshExpiresAt: string | null;
  daysUntilExpiry: number | null;
  lastSyncAt: string | null;
  lastSyncStatus: "ok" | "failed" | "rate_limited" | null;
  accountVerified: boolean;
  authorizedHandle: string | null;
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
  // account_mismatch was blocked outright (nothing saved) — needs its own shape so the banner can
  // offer both ways out (log out + retry, or update the channel's stored handle + retry). No more
  // one-click bypass — see app/api/oauth/callback/route.ts for why that was removed 24/08/2026.
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
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  async function refreshStatus() {
    const res = await fetch("/api/channels/oauth/status");
    if (res.ok) setStatus(await res.json());
  }

  async function handleConnect(channelId: string) {
    setConnectingId(channelId);
    setMessage(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/oauth/start`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Không tạo được URL kết nối.");
      window.location.assign(body.url);
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Đã có lỗi xảy ra." });
      setConnectingId(null);
    }
  }

  /** Lối ra thứ 2 khỏi banner "mismatch" — kênh đã đổi handle trên TikTok, không phải kết nối nhầm
   *  tài khoản. Cập nhật `channel.tiktok_handle` (Manager-only route, đã ghi audit_log sẵn) rồi thử
   *  kết nối lại ngay — không bắt người dùng tự mở form Sửa kênh rồi quay lại. */
  async function handleUpdateHandleAndRetry(channelId: string, newHandle: string) {
    setConnectingId(channelId);
    setMessage(null);
    try {
      const res = await fetch(`/api/channels/${channelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tiktokHandle: newHandle }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Cập nhật handle thất bại.");
      await handleConnect(channelId);
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

  /** Gỡ uỷ quyền phía TikTok (best-effort) rồi xoá kết nối đã lưu — xem lib/tiktok/disconnect.ts.
   *  confirm() gốc trình duyệt, không phải ConfirmDeleteForm gõ tên: việc này KHÔNG mất dữ liệu đã
   *  ghi (số liệu cũ giữ nguyên trong data_snapshot), chỉ ngừng đồng bộ tới khi kết nối lại — cùng
   *  mức rủi ro với xoá Team ở creator-form.tsx, không phải mức "xoá thật" của xoá Kênh/Nhân sự. */
  async function handleDisconnect(channelId: string, channelName: string) {
    if (!confirm(`Ngắt kết nối Display API của kênh "${channelName}"? Kênh sẽ ngừng có số liệu hằng ngày cho tới khi kết nối lại.`)) return;

    setDisconnectingId(channelId);
    setMessage(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/oauth/disconnect`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Ngắt kết nối thất bại.");
      await refreshStatus();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Đã có lỗi xảy ra." });
    } finally {
      setDisconnectingId(null);
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
          <p className="mt-1.5 text-[13px] text-ink-3">Đồng bộ tự động 23:30 mỗi ngày (giờ VN)</p>
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

          <div className="mt-3 border-t border-red-dark/20 pt-3">
            <div className="font-semibold text-red-dark">Nếu đăng nhập nhầm tài khoản TikTok</div>
            <div className="mt-1 text-red-dark">
              Đăng xuất tài khoản đó trên trình duyệt (hoặc dùng cửa sổ ẩn danh), đăng nhập đúng tài
              khoản của kênh này, rồi thử lại.
            </div>
            <button
              type="button"
              disabled={connectingId === message.channelId}
              onClick={() => handleConnect(message.channelId)}
              className="mt-2 flex h-8 items-center rounded-btn border border-red-dark px-3.5 text-[12.5px] font-bold text-red-dark hover:bg-red-bg/60 disabled:opacity-60"
            >
              {connectingId === message.channelId ? "Đang mở…" : "Thử lại"}
            </button>
          </div>

          <div className="mt-3 border-t border-red-dark/20 pt-3">
            <div className="font-semibold text-red-dark">Nếu kênh này đã đổi handle trên TikTok</div>
            {isManager ? (
              <>
                <div className="mt-1 text-red-dark">
                  Cập nhật handle của kênh thành đúng tài khoản vừa Authorize rồi kết nối lại.
                </div>
                <button
                  type="button"
                  disabled={connectingId === message.channelId}
                  onClick={() => handleUpdateHandleAndRetry(message.channelId, message.actual)}
                  className="mt-2 flex h-8 items-center rounded-btn bg-red px-3.5 text-[12.5px] font-bold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {connectingId === message.channelId ? "Đang xử lý…" : `Đổi handle thành @${message.actual} rồi kết nối lại`}
                </button>
              </>
            ) : (
              <div className="mt-1 text-red-dark">Nhờ Manager cập nhật handle kênh trong phần Kênh, rồi kết nối lại.</div>
            )}
          </div>
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
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[2.1fr_1.2fr_1.3fr_1.4fr_1.5fr] gap-3.5 bg-line-soft px-5 py-3 text-xs font-bold text-ink-2">
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
                const busy = connectingId === row.channelId || disconnectingId === row.channelId;

                return (
                  <div
                    key={row.channelId}
                    className="grid grid-cols-[2.1fr_1.2fr_1.3fr_1.4fr_1.5fr] items-center gap-3.5 border-t border-line-soft px-5 py-3.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-line-soft text-[11px] font-extrabold text-ink-2">
                        {initials(row.channelName)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-bold">{row.channelName}</div>
                        {/* Tài khoản TikTok đang thật sự đứng sau kết nối này — thường trực, không
                            phải banner 1 lần, cùng lý do với badge "Chưa xác minh" ở cột kế bên
                            (docs/DISPLAY_API.md bẫy #9 follow-up, 24/08/2026). */}
                        <div className="truncate text-[11px] text-ink-3">
                          {row.connected
                            ? row.authorizedHandle
                              ? `@${row.authorizedHandle.replace(/^@/, "")}`
                              : "chưa xác minh tài khoản"
                            : row.expectedHandle}
                        </div>
                      </div>
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

                    <div className="flex flex-wrap justify-end gap-2">
                      {row.connected && !row.accountVerified ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleVerify(row.channelId)}
                          title="Chỉ bấm khi chắc chắn tài khoản TikTok vừa Authorize đúng là kênh này"
                          className="flex h-8 items-center rounded-btn border border-amber-dark px-3.5 text-[12.5px] font-bold text-amber-dark hover:bg-amber-bg disabled:opacity-60"
                        >
                          {connectingId === row.channelId ? "Đang xác nhận…" : "Xác nhận đúng tài khoản"}
                        </button>
                      ) : null}
                      {row.connected ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleDisconnect(row.channelId, row.channelName)}
                          className="flex h-8 items-center rounded-btn border border-line px-3.5 text-[12.5px] font-bold text-ink-2 hover:bg-surface disabled:opacity-60"
                        >
                          {disconnectingId === row.channelId ? "Đang ngắt…" : "Ngắt kết nối"}
                        </button>
                      ) : null}
                      {showConnectButton ? (
                        <button
                          type="button"
                          disabled={busy}
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
