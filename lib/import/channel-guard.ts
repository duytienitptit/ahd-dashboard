// Chặn import nhầm kênh — bẫy vận hành đã gây hỏng dữ liệu thật 2 lần (25/08 và 05/09/2026): người
// import kéo thả zip của kênh A trong khi dropdown "1. Chọn kênh" vẫn đang ở kênh B. Không có gì báo
// lỗi: `data_snapshot` ghi thẳng vào `channel_id` sai, và `content_video`'s upsert onConflict
// `tiktok_video_id` còn KÉO LUÔN video của kênh A sang kênh B (15 video, 05/09/2026).
//
// Hai bằng chứng dùng để bắt, xếp theo độ tin cậy:
//   1. `video_link` trong Content.csv — `https://www.tiktok.com/@handle/video/123`. Là nội dung file,
//      không phải tên file, nên không đổi được bằng cách rename. Bằng chứng mạnh nhất.
//   2. Tên file zip — TikTok Studio luôn nhúng handle vào: `Overview_2026-07-06_1788400185_
//      lam.nong.thong.thai.zip`. Dùng khi không có Content.csv (file này KHÔNG bắt buộc).
//
// Nguyên tắc: fail-closed khi CHỨNG MINH ĐƯỢC là lệch, fail-open khi không nhận ra handle nào (file
// bị rename, kênh mới đổi @handle...). Chặn nhầm một lần import thật thì người dùng đọc thông báo và
// sửa được; cho lọt một lần ghi nhầm kênh thì hỏng dữ liệu âm thầm hàng tuần liền.

/** Bỏ `@` đầu và hạ chữ thường — `channel.tiktok_handle` lưu kèm `@`, tên file thì không. */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

const VIDEO_LINK_HANDLE_RE = /tiktok\.com\/@([^/?#]+)/i;

/** Handle trong một link video TikTok, đã chuẩn hoá. `null` nếu link không đúng dạng. */
export function handleFromVideoLink(link: string): string | null {
  const match = link.match(VIDEO_LINK_HANDLE_RE);
  return match ? normalizeHandle(match[1]) : null;
}

/**
 * Handle (đã biết trong hệ thống) xuất hiện trong tên file. So khớp theo handle DÀI NHẤT trước, để
 * `vn.ca.hant` không nuốt mất `vn.ca.hant.2` nếu về sau có hai kênh tên lồng nhau.
 */
export function handleFromFilenames(filenames: string[], knownHandles: string[]): string | null {
  const candidates = [...new Set(knownHandles.map(normalizeHandle))].sort((a, b) => b.length - a.length);
  for (const filename of filenames) {
    const haystack = filename.toLowerCase();
    const hit = candidates.find((handle) => haystack.includes(handle));
    if (hit) return hit;
  }
  return null;
}

export type KnownChannel = { name: string; tiktokHandle: string };

export type ChannelMismatch = {
  /** Handle tìm thấy trong file đã tải lên. */
  foundHandle: string;
  /** Tên kênh trong hệ thống ứng với `foundHandle` — `null` nếu handle đó không thuộc kênh nào. */
  foundChannelName: string | null;
  evidence: "video_link" | "filename";
};

/**
 * `null` = không chứng minh được là lệch (khớp, hoặc không đọc ra handle nào). Khác `null` = CHẮC
 * CHẮN lệch, caller phải chặn.
 */
export function detectChannelMismatch(input: {
  selectedHandle: string;
  filenames: string[];
  videoLinks: string[];
  knownChannels: KnownChannel[];
}): ChannelMismatch | null {
  const selected = normalizeHandle(input.selectedHandle);
  const nameByHandle = new Map(input.knownChannels.map((c) => [normalizeHandle(c.tiktokHandle), c.name]));

  // 1. Nội dung file thắng tên file: link video chỉ đích danh chủ sở hữu.
  for (const link of input.videoLinks) {
    const handle = handleFromVideoLink(link);
    if (handle && handle !== selected) {
      return { foundHandle: handle, foundChannelName: nameByHandle.get(handle) ?? null, evidence: "video_link" };
    }
  }

  // 2. Không có Content.csv thì soi tên file — nhưng chỉ kết luận khi tên file mang handle của một
  //    kênh KHÁC đang có trong hệ thống. Tên file không chứa handle nào quen thuộc (bị rename, hoặc
  //    kênh vừa đổi @handle) thì im lặng cho qua, không đoán.
  const fromFilename = handleFromFilenames(input.filenames, [...nameByHandle.keys(), selected]);
  if (fromFilename && fromFilename !== selected) {
    return {
      foundHandle: fromFilename,
      foundChannelName: nameByHandle.get(fromFilename) ?? null,
      evidence: "filename",
    };
  }

  return null;
}

/** Thông báo lỗi tiếng Việt cho người import — nói rõ đang chọn kênh nào, file là của kênh nào. */
export function mismatchMessage(mismatch: ChannelMismatch, selectedChannelName: string, selectedHandle: string): string {
  const owner = mismatch.foundChannelName
    ? `kênh "${mismatch.foundChannelName}" (@${mismatch.foundHandle})`
    : `kênh @${mismatch.foundHandle}`;
  const where = mismatch.evidence === "video_link" ? "link video trong Content.csv" : "tên file zip";
  return (
    `File này là dữ liệu của ${owner}, nhưng bạn đang chọn kênh "${selectedChannelName}" ` +
    `(${selectedHandle}) ở bước 1. Đã chặn để không ghi nhầm kênh — căn cứ: ${where}. ` +
    `Hãy đổi lại dropdown "1. Chọn kênh" cho đúng rồi thử lại. ` +
    `(Nếu kênh vừa đổi @handle trên TikTok, hãy cập nhật handle của kênh trong hệ thống trước.)`
  );
}
