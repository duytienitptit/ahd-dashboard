/**
 * Nhật ký thông báo phía client — `localStorage`. Server (`lib/notifications.ts`) tính ra danh sách
 * thông báo ĐANG liên quan mỗi lần vào Tổng quan; hàm này gộp cái mới vào nhật ký, giữ cả cái đã đọc
 * để "danh sách thông báo gần đây" (chuông ở header) còn thấy.
 *
 * Cố tình chưa có bảng DB (08/09/2026, theo yêu cầu "chưa triển khai nhiều") — hệ quả: nhật ký theo
 * từng trình duyệt, xoá cache là mất. Khi cần đồng bộ nhiều máy / lưu lâu dài thì thêm bảng
 * `notification` + `notification_read`, giữ nguyên `AppNotification` làm shape.
 */

export type NotificationKind = "leader_flex" | "runner_up" | "import_reminder" | "kpi_assigned" | "kpi_achieved";

export type AppNotification = {
  /** Định danh ổn định — MÃ HOÁ SỰ THẬT đứng sau (vd `kpi-achieved:<cycleId>`). Đổi khi sự thật đổi
   *  → coi như thông báo mới. Trạng thái "đã đọc" bám theo id này. */
  id: string;
  kind: NotificationKind;
  /** Emoji to bên trái. */
  icon: string;
  message: string;
  /** Nút hành động — link nội bộ. */
  cta?: { label: string; href: string };
  /** `true` = hiện lại modal MỖI lần vào Tổng quan, kể cả đã bấm "Đã xem" (09/09/2026, theo yêu cầu
   *  — cho Creator: nhắc liên tục). "Đã xem" chỉ đóng cho lần tải trang đó; vào lại là hiện tiếp.
   *  `false`/bỏ trống = hiện một lần rồi thôi (bám `readAt`). */
  repeat?: boolean;
};

/**
 * Màu + sắc thái từng loại — client tô theo `kind` (đây là "cơ chế vui", không phải badge dữ liệu
 * nên dùng màu thoải mái hơn quy tắc `metric-tone`). `bar` = viền trên modal + chấm ở chuông;
 * `bubble` = nền vòng tròn emoji; `btn` = nút CTA.
 */
export const NOTIF_STYLE: Record<NotificationKind, { bar: string; bubble: string; btn: string }> = {
  leader_flex: { bar: "bg-amber", bubble: "bg-amber-bg", btn: "bg-amber-dark hover:bg-amber-dark/90" },
  runner_up: { bar: "bg-crimson", bubble: "bg-crimson-bg", btn: "bg-crimson hover:bg-crimson/90" },
  import_reminder: { bar: "bg-orange", bubble: "bg-orange-bg", btn: "bg-orange hover:bg-orange/90" },
  kpi_assigned: { bar: "bg-blue", bubble: "bg-blue-bg", btn: "bg-blue hover:bg-blue/90" },
  kpi_achieved: { bar: "bg-green", bubble: "bg-green-bg", btn: "bg-green-dark hover:bg-green-dark/90" },
};

export type LoggedNotification = AppNotification & {
  /** `Date.now()` lần đầu client thấy thông báo này. */
  firstSeenAt: number;
  /** `null` = chưa đọc (còn hiện ở modal giữa màn hình + đếm ở chuông). */
  readAt: number | null;
};

const KEY = "ahd:notif-log";
const MAX = 30;
const CHANGE_EVENT = "ahd:notif-log-changed";
const EMPTY = "[]";

export function readLog(): LoggedNotification[] {
  return parseLog(rawLogSnapshot());
}

/** Chuỗi JSON thô của nhật ký — dùng làm `getSnapshot` cho `useSyncExternalStore`. So sánh bằng
 *  chuỗi (theo giá trị) nên nội dung không đổi thì React thấy không đổi. */
export function rawLogSnapshot(): string {
  try {
    return localStorage.getItem(KEY) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}

/** `getServerSnapshot` cho `useSyncExternalStore` — SSR không có `localStorage`, coi như rỗng. */
export function serverLogSnapshot(): string {
  return EMPTY;
}

export function parseLog(raw: string): LoggedNotification[] {
  try {
    const parsed = JSON.parse(raw) as LoggedNotification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(log: LoggedNotification[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(log.slice(-MAX)));
  } catch {
    // localStorage bị chặn — bỏ qua, thông báo sẽ tính lại ở lần vào sau.
  }
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* SSR / môi trường không có window */
  }
}

/** Gộp danh sách thông báo server vừa tính vào nhật ký. Cái nào chưa có (theo `id`) → thêm, đánh dấu
 *  chưa đọc. Trả về nhật ký sau khi gộp. */
export function mergeIntoLog(current: AppNotification[]): LoggedNotification[] {
  const log = readLog();
  const known = new Set(log.map((l) => l.id));
  let changed = false;
  for (const n of current) {
    if (!known.has(n.id)) {
      log.push({ ...n, firstSeenAt: Date.now(), readAt: null });
      changed = true;
    }
  }
  if (changed) write(log);
  return changed ? readLog() : log;
}

export function markRead(ids: string[]) {
  if (ids.length === 0) return;
  const set = new Set(ids);
  const now = Date.now();
  write(readLog().map((l) => (set.has(l.id) && l.readAt === null ? { ...l, readAt: now } : l)));
}

export function markAllRead() {
  markRead(readLog().filter((l) => l.readAt === null).map((l) => l.id));
}

/** `subscribe` cho `useSyncExternalStore` — nhật ký đổi trong tab (custom event) lẫn giữa các tab
 *  (`storage`). */
export function subscribeLog(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
