# Nhật ký tiến độ

Lịch sử chi tiết từng milestone đã xong — quyết định lúc code, deviation so với đặc tả gốc, bug bắt
được lúc kiểm chứng, bài học. **Không cần đọc để bắt đầu một task mới** — CLAUDE.md mục "Trạng thái"
đã tóm tắt đủ để biết đang ở đâu và làm gì tiếp theo. Đọc file này khi cần nhớ lại **tại sao** một
quyết định cũ được đưa ra, hoặc trước khi sửa code ở một module đã "đã xong" từ milestone trước.

Thứ tự: cũ nhất trước, giống thứ tự code thật (`M0 → M1 → M2 → M3a → M3b → chuẩn bị M4 → M4 → M3c`).

---

## Kết luận M0 — Display API sandbox dùng được, đi tiếp M1

Đã OAuth + gọi API thật trên 3 tài khoản (`kidshoppppala` test, `vuonvuonvang` và `nong.nghiep.xanh.17`
— 2 trong 8 kênh công ty). Chi tiết đầy đủ + số liệu: [DISPLAY_API.md](DISPLAY_API.md) mục
"Bẫy cần đề phòng khi code", checklist gốc ở [TASKS.md](TASKS.md) M0.

**Đã xác nhận:**
- Sandbox gọi được `user.info.stats` + `video.list`, đủ cả 3 scope
- `video/list` trả thẳng `view_count`/like/comment/share qua `fields` — **không cần** `video/query` bổ
  sung như dự phòng ban đầu (giảm nửa số lệnh gọi/ngày)
- Đối chiếu video-level với CSV Studio thật: khớp tuyệt đối hoặc tăng hợp lý theo thời gian, không có
  sai lệch dữ liệu
- `refresh_token` **không** đổi ở lần refresh đầu — vẫn phải code theo hướng ghi đè, TikTok không cam
  kết ổn định
- `video_count` khớp `video/list` trên 2/3 tài khoản, lệch 1 trên `vuonvuonvang` (nghi 1 video riêng
  tư, chưa xác nhận cố định) — không chặn M1, xử lý khi viết `isComplete` ở M3b

**Còn treo — không chặn M1, làm song song:** phép đo gốc "view trong ngày" (delta 2 snapshot 24h) so
với `Overview.csv`. Token `nong.nghiep.xanh.17` đã lưu bền trong
`tools/m0-display-api-probe/out/tokens.json` (dùng `--as nong.nghiep.xanh.17`, không cần OAuth lại) —
chạy `node probe.mjs probe --as nong.nghiep.xanh.17` rồi `diff` khi đã cách lần đo trước ≥24h.

**2 lỗi thông tin đã sửa trong lúc kiểm chứng (đáng nhớ):**
- Redirect URI: TikTok từ chối **mọi** dạng `localhost`, kể cả `https://localhost` — phải dùng domain
  thật đã deploy, kể cả lúc test
- Tên file zip Studio (`Overview_2026-06-18_...`): đoạn ngày là rác, **không phải** ngày export — dùng
  `now()` server lúc upload, xem [CSV_FORMAT.md](CSV_FORMAT.md) mục 7

**8 kênh còn lại:** cố ý chưa OAuth — dồn lại làm 1 lượt khi M1 xong (có DB để lưu token thật), không
login rời rạc trước. Nhớ add đủ 8 kênh vào Sandbox Target Users **trước** buổi đó ít nhất 1 tiếng (thời
gian TikTok cần để tài khoản mới có hiệu lực).

## M1 đã xong — có gì dùng được ngay

- **7 migration** trong `supabase/migrations/` đã push lên DB thật (6 ở M1 + trigger ownership ở M2).
  Sửa schema thì thêm file mới, **không sửa file cũ đã push**.
- **`v_channel_daily`** — view chọn nguồn ưu tiên. Mọi query đọc số liệu đi qua đây.
- **RLS là tầng chặn thật**, không phải check ở route handler: Creator read-only toàn hệ thống,
  `channel_oauth` không vai trò đăng nhập nào đọc được, `audit_log` không sửa/xoá được.
- **`lib/auth.ts`** — `getCurrentUser()` / `requireManager()`. Mọi route chỉ-Manager gọi
  `requireManager()` ở dòng đầu.
- **`lib/supabase/`** — 3 client: `server` (theo session, RLS áp dụng, dùng mặc định) ·
  `client` (browser) · `admin` (service role, **bypass RLS** — chỉ Auth admin, `channel_oauth`, cron).
- **`lib/crypto/token.ts`** — mã hoá token Display API, M3b gọi lúc lưu.
- **`./scripts/dryrun/run.sh`** — áp toàn bộ migration lên Postgres tạm trong Docker + chạy assertion.
  **Chạy trước mỗi lần `db push`.**
- **`npm test`** (Vitest) — mọi milestone sau đều bắt buộc thêm test vào đây.

## M2 đã xong — có gì dùng được ngay

- **`/api/channels`, `/api/channels/:id`, `/api/creators`, `/api/creators/:id`** — route handler thật,
  logic nằm ở `lib/channels.ts` / `lib/creators.ts` (route handler và Server Action của UI cùng gọi
  vào đó, không tách hai đường hành vi). `lib/validation.ts` + `lib/http.ts` là tầng validate/error
  dùng chung, không thêm dependency ngoài.
- **`channel_ownership_history` tự đồng bộ bằng trigger DB**
  (`supabase/migrations/20260820000007_ownership_trigger.sql`) — đổi Creator của kênh chỉ cần
  `UPDATE channel SET current_creator_id = ...`, **không tự tay ghi vào bảng history**. Chi tiết cơ
  chế 3 nhánh + `to_date` nửa mở: [DATABASE_ERD.md](DATABASE_ERD.md).
- **`v_channel_latest`** (cùng migration) — 1 row mới nhất mỗi kênh, `GET /api/channels` đọc từ đây.
- **`app/(app)/`** — route group có layout dùng chung (header, nav theo vai trò, `requireUser()`
  chặn chưa đăng nhập). `/`, `/channels`, `/creators` đều nằm trong này.
- **`/channels`, `/creators`** — quản lý được thật: thêm/sửa kênh, gán/đổi/gỡ Creator, tạo/vô hiệu hoá
  tài khoản Creator. Cột số liệu (follower/view/sparkline/KPI) trong mockup lúc M2 đóng **chưa có** —
  đã làm ở M4, xem mục đó bên dưới.
- Luồng tạo → gán → gỡ đã kiểm chứng trên DB thật bằng 1 tài khoản Creator test (tạo, gán vào
  `@vuonvuonvang`, xác nhận `channel_ownership_history` đúng, rồi gỡ gán + vô hiệu hoá — xem
  [TASKS.md](TASKS.md) M2). **Cả 2 kênh giờ đã gán Creator thật (`sukai`)** — phát hiện lúc
  kiểm chứng UI M4 (21/08/2026), trạng thái đổi ngoài phiên nào ghi chú lại, không rõ khi nào/ai gán.

## M3a đã xong — có gì dùng được ngay

- **`lib/import/`** — parser CSV thuần (`csv.ts`, `date.ts`, `overview.ts`, `follower-history.ts`,
  `viewers.ts`, `follower-activity.ts`, `audience.ts`, `content.ts`), `zip.ts` (giải nén, nhận diện
  file theo tên CSV bên trong, không theo tên zip ngoài), và `plan-import.ts` — hàm **thuần không đụng
  Supabase** quyết định ngày nào ghi/bỏ qua/cảnh báo lệch, test trực tiếp bằng data thật trong `data/`
  không cần DB. `run-import.ts` là lớp mỏng bọc quanh, lo phần đọc/ghi Supabase + Storage.
- **`POST /api/channels/:id/import?dryRun=true|false`** — `dryRun=true` parse + trả kết quả, không ghi
  gì (bước "xem trước" trước khi Manager bấm "Lưu dữ liệu"). Field thêm so với đặc tả gốc:
  `?dryRun=`, response field `readDates` — xem [API_SPEC.md](API_SPEC.md).
- **`/import`** (tab "Dữ liệu", Manager-only) — chọn kênh, kéo-thả file zip, xem trước, lưu. **Không**
  test được thao tác kéo-thả qua browser automation (giới hạn bảo mật trình duyệt, không set được giá
  trị `<input type="file">` bằng script) — đã xác nhận UI render đúng, còn pipeline phía sau đã chạy
  thật (không qua UI) trên DB thật, xem dòng dưới.
- **Bucket Storage `studio-imports`** — zip gốc lưu tại `<channelId>/<batchId>/<tên file>`, RLS chỉ
  Manager, cùng mẫu `channel_oauth`. `data_snapshot.raw_file_ref` trỏ tới **thư mục batch**, không
  phải 1 file — xem [DATABASE_ERD.md](DATABASE_ERD.md).
- ⚠️ **Cửa sổ chốt (3 ngày) chỉ áp cho `data_snapshot`** — `follower_activity`/`audience_snapshot`/
  `content_video` luôn ghi toàn bộ file mỗi lần, không lọc theo ngày export. Lý do:
  `FollowerActivity.csv` chỉ giữ 7 ngày/lần, cửa sổ 7 ngày không chồng giữa các tuần — lọc sẽ mất dữ
  liệu vĩnh viễn thay vì bù được ở lần import sau.
- **`nong.nghiep.xanh.17` và `vuonvuonvang` đã có đủ 60 ngày `data_snapshot` thật** (chạy `runStudioImport`
  trực tiếp 1 lần trên DB thật cho cả 2 kênh, không qua UI — số khớp chính xác với data trong `data/`:
  60 ngày, 168 dòng `follower_activity`, 15 `content_video` mỗi kênh). Đây là dữ liệu thật, không phải
  test — không xoá.

## M3b đã xong (code) — có gì dùng được ngay

- **`lib/tiktok/`** — `provider.ts` (interface `TikTokDataProvider`, CLAUDE.md bắt buộc — business
  logic không được gọi thẳng Display API), `display-api-provider.ts` (implement interface, port từ
  `tools/m0-display-api-probe/probe.mjs` đã chạy thật, kể cả fallback `video/query` khi `video/list`
  thiếu metric), `oauth.ts` (authorize URL, đổi/refresh token — KHÔNG thuộc interface, gắn riêng
  Display API), `video-delta.ts` (hàm thuần tính view-trong-ngày, port từ `diffSnapshots()` của
  probe, có test), `sync.ts` (orchestrator 1 kênh + toàn bộ kênh active), `oauth-status.ts` (cho
  `/connections` + `GET /api/channels/oauth/status`).
- **OAuth CSRF qua cookie httpOnly** (`sameSite: 'lax'` — bắt buộc, `strict` sẽ làm mất cookie lúc
  TikTok redirect quay lại), không thêm bảng DB. `GET /api/channels/:id/oauth/start` (set cookie) →
  Authorize trên TikTok → `GET /api/oauth/callback` (public, đã có sẵn trong `PUBLIC_PATHS` của
  `proxy.ts`) đổi code lấy token, mã hoá, upsert `channel_oauth`.
- ⚠️ **Callback đối chiếu tài khoản TikTok vừa Authorize với `channel.tiktok_handle`** (qua
  `share_url` của 1 video, `lib/tiktok/verify-account.ts`) — TikTok không biết "kênh nào" đang kết
  nối, chỉ hỏi tài khoản đang đăng nhập trên trình duyệt có đồng ý không. Lệch handle → chặn hẳn,
  không lưu gì. Phát hiện lúc bàn với bạn 20/08/2026, xem [DISPLAY_API.md](DISPLAY_API.md) mục 9.
- **`GET /api/channels/:id/oauth/start` + `GET /api/channels/oauth/status` là M/C, không chỉ M** —
  quyết định sau khi bàn với bạn (20/08/2026): Creator tự Authorize được, nhưng **chỉ đúng kênh mình
  đang phụ trách** (`channel.current_creator_id = user.id`, sai thì `403`). Lý do đổi: Creator có sẵn
  tài khoản TikTok của chính kênh, Manager thì không — bắt Manager đăng nhập hộ 8 tài khoản không thực
  tế. `oauth-status.ts` nhận thêm `channelIds` để lọc theo Creator. Vẫn phải add Target Users trên
  developer portal trước khi bất kỳ ai (Manager hay Creator) bấm "Kết nối" thành công — giới hạn của
  TikTok Sandbox, không tránh được từ phía app.
- **`/api/sync/display-api` có 2 method** — `GET` cho Vercel Cron (luôn gửi GET, kiểm
  `Authorization: Bearer $CRON_SECRET`), `POST` cho nút "Chạy đồng bộ ngay" (`requireManager()` —
  **vẫn Manager-only**, đây là đồng bộ toàn bộ kênh active cùng lúc, khác với việc kết nối 1 kênh).
  `vercel.json`: `0 20 * * *` UTC = 03:00 giờ VN.
- **`/connections`** (Manager: sub-tab với `/import` qua `app/(app)/data-tabs.tsx`, thấy toàn bộ 8
  kênh + nút "Chạy đồng bộ ngay". Creator: nav riêng "Kết nối", chỉ thấy đúng kênh mình, không có nút
  đồng bộ, không có `DataTabs`) — bảng trạng thái kết nối, cảnh báo hạn <30 ngày. **Bỏ nút "Ngắt"** so
  với mockup — không có endpoint nào yêu cầu, tự thêm là lấn phạm vi.
- ⚠️ **`isComplete` của `vuonvuonvang` nhiều khả năng sẽ luôn `false`** khi kết nối — biết trước, không
  phải bug, xem [DISPLAY_API.md](DISPLAY_API.md) mục 1.
- **`data_snapshot(source=display_api)` chỉ ghi 3 chỉ số nhóm nóng** (`followers`, `video_count`,
  `video_views`) — không suy day-delta cho likes/comments/shares, ngoài phạm vi TASKS.md M3b.
- **Đã kiểm chứng bằng code, chưa kiểm chứng bằng OAuth thật** — không tự làm được, cần trình duyệt
  đăng nhập đúng tài khoản TikTok của từng kênh. `POST /api/sync/display-api` đã chạy thật qua UI cho
  2 kênh chưa kết nối, trả đúng `{synced:0, failed:2}`, không crash.
- ⚠️ **Review lại 1 lần sau khi code xong (20/08/2026) — tìm ra 2 lỗi P1 tự sửa**: sync đầu tiên
  (bootstrap) từng ghi nhầm tổng view luỹ kế cả kênh thành view/ngày (sai ~10 lần); cron 03:00 giờ VN
  từng gán nhầm ngày do chạy đúng lúc lệch sang ngày lịch mới. Cả 2 đã sửa + kiểm chứng lại bằng fake
  provider trên DB thật (không cần token TikTok thật) — xem [DISPLAY_API.md](DISPLAY_API.md)
  mục 10-11, [TASKS.md](TASKS.md) M3b. Bài học: **luôn tự review lại code liên quan tới
  tiền/số liệu tính thưởng sau khi viết xong, đừng chỉ tin build+test xanh** — cả 2 lỗi đều
  build/lint/test pass bình thường, chỉ lộ ra khi đọc lại logic bằng con số thật.

## Chuẩn bị trước M4 đã xong (21/08/2026) — có gì dùng được ngay

Phiên 21/08 phát hiện production deploy trước đó hỏng nặng (thiếu gần hết route — deploy nhầm từ
`app/.vercel` sót lại), sửa xong rồi tiện thể dọn luôn phần hạ tầng còn thiếu trước khi vào M4:

- **Git + GitHub** — repo **private** `https://github.com/duytienitptit/ahd-dashboard`, branch
  `main`. Đã quét secret trước khi push (`.env.local`, token OAuth thật, zip dữ liệu thật trong
  `data/` — không cái nào lọt lên remote). `.claude/settings.local.json` thêm vào `.gitignore` —
  cấu hình riêng máy, khác `settings.json` là quy ước chung nên vẫn commit.
- **Function region = `hkg1`** (Hong Kong) — sửa qua Vercel Project Settings → Functions, TTFB từ
  2.1-2.5s xuống **~0.2s**. 2 cách đã thử mà KHÔNG dùng được, đừng thử lại:
  - `"regions"` trong `vercel.json` — Vercel bỏ qua với project Next.js, build vẫn ra `[iad1]`.
  - `export const preferredRegion` ở `app/layout.tsx` — deploy rồi vẫn bị setting dashboard ghi đè,
    và dù sao cũng không áp cho route handler trong `app/api/` (chúng không nằm dưới root layout).
- **`getCurrentUser()` bọc `cache()`** ([lib/auth.ts](../lib/auth.ts)) — layout + page trước đó tự gọi
  riêng, mỗi lần chuyển tab tốn gấp đôi round-trip tới Supabase Auth.
- **`loading.tsx` cho mọi route trong `app/(app)/`** — trước đó không có, chuyển tab bị đứng hình
  chờ server. Primitive dùng chung ở [app/(app)/skeleton.tsx](../app/(app)/skeleton.tsx), quy ước ghi
  ở [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) mục "Trạng thái chờ" — route mới phải thêm
  `loading.tsx` cùng lúc, không thêm sau.

⚠️ **Kiểm tra dữ liệu thật trước khi code M4, phát hiện 3 điều checklist không nói** (2/3 mục dưới đã
lạc hậu ngay trong lúc code M4 — xem đính chính ở mục "M4 đã xong"):
1. ~~Chưa kênh nào được gán Creator~~ — **sai, đính chính lúc code M4**: cả 2 kênh thật ra đã được
   gán cho Creator `sukai` (phát hiện khi kiểm chứng UI M4 bằng browser, 21/08/2026). Trạng thái đổi
   ở đâu đó ngoài phiên ghi chú này — không rõ khi nào/ai gán.
2. ~~"N ngày gần nhất" neo theo đâu — chưa quyết~~ — **đã quyết 21/08/2026**: neo theo **hôm nay**
   (`nowVnDateString()`), không neo theo ngày mới nhất có data. Đã code trong `lib/dashboard.ts`,
   xem mục "M4 đã xong".
3. Chỉ 2/8 kênh có data (đúng như kế hoạch, không phải thiếu sót) — dashboard hiển thị đúng 2,
   6 kênh còn lại chưa từng được thêm vào bảng `channel`. Vẫn đúng nguyên tại thời điểm M4 xong.

## M4 đã xong — có gì dùng được ngay

Toàn bộ chi tiết (deviation so với API_SPEC.md gốc, bug bắt được lúc kiểm chứng browser, quyết định
thiết kế UI không có mockup nguồn) đã ghi ở [TASKS.md](TASKS.md) mục M4 — đọc ở đó trước khi
đụng vào `lib/dashboard.ts` hay 4 màn UI. Tóm tắt nhanh những gì dùng lại được ngay:

- **`lib/dashboard.ts`** — nguồn số liệu DUY NHẤT cho Tổng quan/Kênh/Chi tiết kênh/Creator
  (`getChannelPeriodStats` dùng chung cả 4 màn). Mọi tính năng số liệu mới nên tái dùng hàm ở đây
  trước khi viết query mới.
- **`app/(app)/channels/[id]/`** — trang Chi tiết kênh, route mới. Heatmap giờ vàng + bảng hashtag là
  2 khối UI **không có mockup nguồn** trong `design/*.dc.html` — tự thiết kế theo token, đã ghi lại
  thành mẫu dùng chung trong [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) mục "Mẫu bắt buộc dùng lại".
- **`lib/import/content.ts` giờ parse cả view/like/comment/share** của Content.csv (M3a chỉ lấy
  title/link) — 15 video/kênh import trước đổi này **chưa có** số, bảng hashtag hiện trống thật cho
  tới lần import Studio kế tiếp hoặc khi kênh nối Display API.
- **Neo "N ngày gần nhất" = hôm nay thật** (không neo theo ngày mới nhất có data) — khi chưa kênh nào
  nối Display API, phần lớn ô gần đây trống là **đúng chủ đích**, không phải bug.
- **Bổ sung ngay sau khi xem bản đầu (21/08/2026, 3 phản hồi)**: chọn khoảng thời gian tuỳ ý (Tổng
  quan + Kênh, `date-range-picker.tsx`), lọc Creator ở Tổng quan (`creator-filter.tsx`,
  `getDashboard()` nhận `creatorId`), xuất CSV (Tổng quan/Kênh/Chi tiết kênh, `download-csv.ts` +
  `export-csv-button.tsx`). Kéo theo `previousPeriod()` mới trong `lib/dashboard.ts` — "so với kỳ
  trước" giờ giãn theo đúng độ dài kỳ đang chọn, không còn cố định 7 ngày. Chi tiết đầy đủ ở
  [TASKS.md](TASKS.md) mục M4.
- ⚠️ **Phản hồi thứ 2 cùng ngày: filter mới thêm ở trên "giật", không có phản hồi lúc chờ.** Nguyên
  nhân: `loading.tsx` không tự hiện khi chỉ đổi `searchParams` trên cùng route, kể cả bọc
  `startTransition` — đã kiểm chứng bằng `MutationObserver` thật. Sửa bằng cơ chế riêng
  (`app/(app)/filter-transition.tsx`, không dựa `loading.tsx`) — chi tiết + lý do kỹ thuật ở
  [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) mục "Trạng thái chờ". Route mới có filter kiểu `searchParams`
  phải theo mẫu này.
- **Phản hồi thứ 3 cùng ngày: chú thích cơ chế chọn nguồn ngay trên UI.** Thêm
  `app/(app)/source-priority-info.tsx` (icon ⓘ ở Tổng quan + Chi tiết kênh). Bản đầu liệt kê đủ 5
  nguồn kỹ thuật của `source_rank()` — rối, vì 2 trong đó (`business_api`, `vendor_scraping`) chưa có
  code nào ghi tới. Rút gọn UI xuống đúng 3 nguồn thật: Studio import → Display API → Nhập tay.
  `source_rank()` trong DB **không đổi** — vẫn 5 bậc, chỉ sửa phần giải thích cho khớp thực tế.
- ⚠️ **Bug thật bắt được lúc kiểm chứng browser, không phải lúc review code**: hàm gộp follower theo
  tuần ban đầu lấy "row cuối cùng theo ngày" trên danh sách gộp nhiều kênh — với ≥2 kênh, kết quả là
  follower của 1 kênh bất kỳ (tuỳ thứ tự sort), không phải tổng cả team. Sửa: gộp theo từng kênh trước
  rồi mới cộng — `bucketWeeklyLastFollowers()`. Bài học: build/lint/test xanh không phát hiện được vì
  hàm vẫn đúng KIỂU dữ liệu, chỉ sai NGHĨA nghiệp vụ — chỉ lộ ra khi nhìn đồ thị thật với ≥2 kênh có
  data (cùng dạng lỗi như 2 lỗi P1 ở M3b).
- ⚠️ **Còn treo**: `.github/workflows/` (CI) vẫn chưa có — build/lint/test vẫn chạy tay.

## M3c đã xong (21/08/2026, làm sớm theo yêu cầu) — có gì dùng được ngay

- **`lib/manual-entry.ts`** (`createManualEntry`) — dùng chung cho `POST /api/channels/:id/manual-entry`
  và Server Action UI. Nút "+ Nhập tay" (Manager-only) trên Chi tiết kênh, ngay trên bảng "Số liệu đã
  lưu theo ngày". 3 trường số đều optional, bắt buộc có ít nhất 1, không có trường lý do — cố tình hẹp
  đúng vai trò "miếng vá tạm" (docs/DATA_SOURCES.md).
- **Đã kiểm chứng trên DB thật qua UI** (không phải fake): 1 manual_entry cho ngày chưa có số nào (lên
  đúng, nhãn "chưa xác thực") + 1 manual_entry cho ngày **đã có `studio_import`** (xác nhận UI vẫn giữ
  số Studio gốc, không bị đè — đúng thứ tự ưu tiên). `audit_log` ghi đúng actor/note mỗi lần. Đã xoá
  cả 2 row test khỏi DB thật sau khi xác nhận xong.
- Chưa làm: chặn chốt sổ khi chu kỳ còn chứa `manual_entry` (đúng phạm vi M6, chưa tồn tại `kpi_cycle`
  nào để chốt).

## Đợt 1 sửa dữ liệu sau khi dùng thử bản deploy đầu (21/08/2026) — có gì dùng được ngay

Sau khi deploy M4 xong và kết nối Display API thật lần đầu, dùng thử phát hiện 11 vấn đề — tách 2
đợt: Đợt 1 sửa bug dữ liệu (đã xong, ghi ở đây), Đợt 2 thiết kế lại UI (chưa bắt đầu, đang chờ chốt
phạm vi với người dùng — xem CLAUDE.md).

- ⚠️ **Bug nghiêm trọng nhất: cả 2 kênh đã kết nối gắn CÙNG một tài khoản TikTok lạ**
  (`@kidshoppppala`, không phải kênh nào cả). Gốc rễ: guard chống sai tài khoản ở
  `app/api/oauth/callback/route.ts` (so `share_url` vừa Authorize với `channel.tiktok_handle`) **đã
  tồn tại từ M0 nhưng chỉ cảnh báo, không chặn** — token sai vẫn được lưu, sync hằng ngày vẫn chạy.
  **Đã sửa**: mismatch giờ chặn hẳn (không lưu token), kèm nút "Vẫn kết nối" có xác nhận rõ ràng cho
  trường hợp hiếm `share_url` sai định dạng (chưa từng xảy ra, chỉ đề phòng). Thêm cột
  `channel_oauth.account_verified` (migration `20260821000001`) — tài khoản TikTok chưa có video nào
  (không có `share_url` để đối chiếu) vẫn được lưu nhưng **không sync** cho tới khi có người xác nhận
  tay qua `POST /api/channels/:id/oauth/verify`. `/connections` hiện badge "Chưa xác minh" **thường
  trực** trên từng dòng, không phải banner 1 lần lúc kết nối xong (banner 1 lần chính là lý do sự cố
  lọt qua mà không ai để ý).
- ⚠️ **Bug thứ hai, hoàn toàn độc lập, phát hiện lúc dọn bug thứ nhất**: import file Studio của
  `vuonvuonvang` bị chọn NHẦM kênh `nong.nghiep.xanh.17` ở dropdown "1. Chọn kênh" — không có gì báo
  lỗi, 16 video thật của `vuonvuonvang` bị gắn nhầm `channel_id`. **Chưa sửa tại nguồn** (chưa có
  validation nào ở `/import` đối chiếu handle trong CSV với kênh đang chọn, kiểu guard OAuth ở trên) —
  mới dọn xong hậu quả 1 lần bằng tay. Cân nhắc làm ở Đợt 2 hoặc M6.
- **Cách dọn 2 bug trên khỏi DB thật** (`scripts/cleanup-wrong-account-sync.mjs`, mặc định dry-run,
  cần `--confirm` mới ghi): phân biệt "video thật bị gắn nhầm kênh" (Bug 2 → GẮN LẠI `channel_id`)
  với "video của tài khoản lạ, không thuộc kênh nào" (Bug 1 → XOÁ) **bằng chính `video_link`** —
  handle TikTok nhúng trong link luôn là sự thật, không dựa vào `first_seen_at` (cả 2 bug đều có thể
  xảy ra "hôm nay" nên timestamp không phân biệt được). Đã chạy trên DB thật: gắn lại 15 video, xoá
  24 video + snapshot của tài khoản lạ, xoá 2 dòng `data_snapshot` sai (151 follower), xoá 2 dòng
  `channel_oauth` (2 kênh cần "Kết nối" lại từ đầu, đi qua guard mới).
- **Null vs 0 xuyên suốt `lib/dashboard.ts`** — `sumViews([])`/mọi row `videoViews: null` giờ trả
  `null` (đọc là "chưa có số đo"), không phải `0` ("đo được, bằng 0"). Kéo theo: `bucketWeeklyViews`
  emit `null` cho tuần không có số đo (biểu đồ vẽ **đứt đoạn**, không tụt về 0 — sửa trong
  `trend-chart.tsx`'s `ChartSvg`, vẽ nhiều `<path>`/`<polyline>` riêng theo từng đoạn liền mạch thay
  vì 1 đường nối hết); `ChannelPeriodStat.views`/`previousViews` nullable, `viewShare`/`efficiency`
  lọc bỏ kênh không có số đo thay vì hiện "0%" gây hiểu lầm (cùng cách `growth` đã lọc `followersNow`
  từ trước). `videos` (đếm `content_video`) **không** đổi — luôn là số biết chắc, không có khái niệm
  "chưa đo" như `views`. Test mới ở `lib/dashboard.test.ts` khoá lại đúng case rows rỗng/toàn null —
  trước đó 121 test cũ đều pass dù chưa test case này, đúng như lo ngại lúc lập kế hoạch.
- **Tổng số video của kênh** (`data_snapshot.video_count`, Display API tự báo) **đã được lấy từ M3b,
  chỉ chưa hiển thị ở đâu cả**. Nối vào subtitle "Video gần đây": lệch với số `content_video` trong
  DB thì nói rõ cả hai ("N video đã biết trong hệ thống · TikTok báo tổng M video") thay vì im lặng
  chọn 1 trong 2.
- **`period.comparedFrom`/`comparedTo`** tách thành 2 trường ngày riêng thay vì chuỗi gộp
  `"2026-08-08/2026-08-14"` (tính đúng từ M4 nhưng **chưa màn nào hiển thị** — "so với kỳ trước"
  không ai biết là kỳ nào). Tổng quan giờ có dòng "So với kỳ trước (DD/MM – DD/MM)" ngay trên
  `TeamStatsRow`. `docs/API_SPEC.md` đã cập nhật ví dụ JSON.
- **Creator sửa được "Tên kênh" của kênh mình phụ trách; Handle TikTok vẫn chỉ Manager.** RLS trên
  `channel` là `for all using (is_manager())` (row-level, không có cột) nên không nới trực tiếp
  được — dùng hàm Postgres `security definer` `update_channel_name()` (migration `20260821000002`)
  tự kiểm tra `auth.uid() = channel.current_creator_id` trước khi cho sửa. Cố tình **không** mở rộng
  sang `tiktok_handle`: đó là mỏ neo guard chống sai tài khoản OAuth ở trên dùng để đối chiếu — cho
  Creator tự sửa thì guard mất tác dụng. Đổi handle (Manager, qua `PATCH /api/channels/:id` như cũ)
  giờ ghi `audit_log`.
- **Kiểm chứng bằng dữ liệu thật** (không phải chỉ tsc/vitest): viết 1 file test tạm
  (`lib/_verify-live.test.ts`, xoá ngay sau khi chạy) gọi thẳng `getDashboard()`/`getChannelPeriodStats()`
  bằng admin client vào DB thật — xác nhận `period.comparedFrom/comparedTo` đúng, 2 kênh không còn
  hiện follower 151 nữa, khoảng ngày không có dữ liệu trả `null` thật (không phải suy luận từ code).

## Team — nhóm Creator (21/08/2026, ngoài kế hoạch gốc) — có gì dùng được ngay

Yêu cầu phát sinh giữa chừng lúc bàn Đợt 2 ("ví dụ 1 manager quản lý 2 team"). Trước khi viết
migration đã hỏi 2 câu quan trọng nhất (CLAUDE.md: schema/phân quyền là loại quyết định khó sửa về
sau, không tự suy đoán): **(1)** có nhiều Manager, mỗi người chỉ thấy team mình không? **(2)** Creator
trong team A có còn thấy số liệu team B không (hệ thống đang cố ý cho cross-channel visibility)?
Cả 2 câu đều chọn phương án ít rủi ro nhất → **Team chỉ là nhãn tổ chức/lọc, không đổi RLS, không đổi
ai-thấy-được-gì**. `docs/PRODUCT_SPEC.md` mục 2 hoá ra đã tiên liệu đúng việc này từ đầu dự án
("schema không hard-code 1 Manager").

- **Schema tối giản đúng 1 bảng + 1 cột**: `team (id, name)` + `creator.team_id` (nullable, FK).
  `channel` **không có** `team_id` riêng — team của 1 kênh luôn suy ra qua
  `current_creator_id → creator.team_id`, tránh 2 nguồn sự thật. Xoá 1 team không xoá Creator trong
  đó (`on delete set null`), chỉ làm họ thành chưa gán team — an toàn, dễ đảo ngược.
- **`lib/teams.ts`** mirror đúng pattern `lib/creators.ts` (list/create/update/delete, không tách
  admin client vì `team` có RLS đọc-mọi-người/ghi-Manager bình thường, không như `channel_oauth`).
- **`/creators`**: thêm `TeamManager` (tạo/sửa/xoá, Manager-only) phía trên nút "+ Tạo tài khoản";
  form tạo/sửa Creator có thêm `TeamSelect`; thẻ Creator hiện badge tên team cạnh tên.
- **Lọc Tổng quan theo team** (`TeamFilterSelect`, `?teamId=`) — cùng cơ chế `?creatorId=` đã có, có
  thể kết hợp cả hai cùng lúc (rỗng nếu không giao nhau, là câu trả lời đúng chứ không phải lỗi).
- ⚠️ **Bắt được lúc code, không phải lúc review**: filter Creator cũ có option mặc định ghi "Toàn
  team" — giờ "Team" là thực thể thật nằm ngay cạnh nó trong cùng hàng filter, chữ này sẽ đọc nhầm
  thành "chọn team". Đổi thành "Tất cả Creator" (khớp chữ `channels-table.tsx` đã dùng sẵn).
- **`GET/POST /api/teams`, `PATCH/DELETE /api/teams/:id`** — thêm cho khớp quy ước mọi resource khác
  trong `docs/API_SPEC.md` đều có route thật dù UI gọi thẳng lib function qua Server Action.
- **Kiểm chứng bằng dữ liệu thật, tự dọn sạch**: tạo 1 team QA, gán creator `sukai` (đang giữ cả 2
  kênh thật), gọi `getDashboard({teamId})` xác nhận lọc đúng `channelCount: 2`, rồi gỡ gán + xoá team
  — không để lại dấu vết trong DB thật.

## Creator upload file Studio (21/08/2026, Đợt 2 mục #9) — có gì dùng được ngay

Quyết định sản phẩm đã hỏi trước khi code (docs/USER_FLOW.md cũ nói Creator không có tab "Dữ liệu",
nhưng vận hành thực tế đã khác) — chốt: **Có**, Creator import được file Studio cho đúng kênh mình
phụ trách. `manual_entry` (tự gõ số tay) **không đổi**, vẫn chỉ Manager — khác nhau ở chỗ import là
nộp file máy TikTok sinh ra (không tự khai số), không phạm nguyên tắc "người hưởng thưởng không tự
khai số tính thưởng".

- **RLS là chỗ chặn thật** (`20260821000004_creator_studio_import.sql`), không phải check ở route —
  đúng triết lý đã ghi ngay đầu `0006_rls.sql`. Thêm policy INSERT+UPDATE (không DELETE) cho 5 bảng
  `runStudioImport()` ghi tới, scope theo `channel.current_creator_id = auth.uid()`.
- ⚠️ **Điểm dễ sai nhất, suýt bỏ sót**: `data_snapshot` có **2 đường ghi hợp lệ** (studio_import +
  manual_entry) dùng chung 1 bảng. Nới RLS cho Creator mà không thêm điều kiện `source = 'studio_import'`
  vào chính policy đó sẽ vô tình mở luôn đường cho Creator tự ghi `manual_entry` qua thẳng client SDK,
  bỏ qua `requireManager()` ở route — vì RLS mới là lớp chặn thật, check ở route chỉ là lớp phụ. 4
  bảng còn lại (`content_video`, `video_snapshot`, `follower_activity`, `audience_snapshot`) không có
  "biến thể tay" nên chỉ cần scope theo quyền sở hữu kênh, không cần thêm điều kiện nguồn.
- **Route** (`app/api/channels/[id]/import/route.ts`): `requireManager()` → `requireUser()` +
  check `current_creator_id === user.id` khi role là creator (pattern giống hệt `oauth/start`).
- **Nav Creator đổi "Kết nối" → "Dữ liệu"** (khớp Manager) — `/import` giờ M/C, `DataTabs` (sub-tab
  Nhập file Studio / Kết nối Display API) hiện cho cả 2 vai trò thay vì chỉ Manager.
- **Kiểm chứng bằng phiên đăng nhập THẬT, không phải service role** — đúng quy trình QA đã có của dự
  án (mục dưới), nhưng lần này qua `supabase-js` (`signInWithPassword`) thay vì browser, vì cái cần
  test là RLS SQL, không phải UI: tạo 1 creator QA, **gán tạm 1 kênh thật cho họ** (đúng quy ước "gán
  tạm rồi gán lại đúng Creator cũ"), rồi bằng phiên của chính họ — xác nhận ghi được `studio_import`
  cho kênh mình, **KHÔNG** ghi được `manual_entry` dù cùng kênh (đây chính là rò rỉ phải chặn), không
  đụng được kênh khác. Cả 5 case đều đúng như thiết kế. Khôi phục lại `current_creator_id` gốc + xoá
  tài khoản QA + xoá hết row test trước khi báo xong.

## Đợt 2 (phần 1) — biểu đồ theo tháng + polish thẻ Creator (21/08/2026)

- **`TrendChart`**: thêm toggle Tuần/Tháng, cả 2 mức chia tính sẵn server-side trong cùng 1 lần gọi
  (giống hệt cách 3 tab metric Lượt xem/Follower/Video đã bundle từ M4 — đổi granularity không refetch).
  `lib/dashboard.ts` refactor `bucketWeekly*` thành gọi lõi dùng chung tham số hoá theo `(keyOf, labelOf)`
  (`bucketViewsBy`/`bucketLastFollowersBy`/`bucketVideoCountsBy`), tránh viết lại 3 hàm gần giống hệt
  cho tháng. Cả team-level (`getDashboard`) lẫn channel-detail đều tận dụng chung 1 lần fetch 180 ngày
  (khớp `HISTORY_DAYS` sẵn có) — tuần chỉ là lọc-trong-bộ-nhớ của tập tháng, không query thêm.
- ⚠️ **`rankCreatorPerformance` — bug thật, đã có test khoá lại**: 1 creator đang hoạt động duy nhất
  luôn được gán badge "Dẫn đầu view" dù không có ai để so — `withChannels.reduce(...)` trên mảng 1
  phần tử luôn trả về chính phần tử đó. Sửa: chỉ gán "leader" khi có ≥2 creator có kênh.
- **Đã kiểm tra lại, KHÔNG sửa**: nhận định ban đầu "thanh progress dưới mỗi kênh vẽ full-width bất
  kể số" hoá ra sai — đọc lại code thấy `width` đã tính đúng theo tỉ lệ `channel.views / maxViews`
  từ trước. Bài học: đọc code trước khi "sửa", đừng tin hoàn toàn nhận định lúc chỉ xem ảnh chụp.
- **`/creators`**: tài khoản đã vô hiệu hoá tách khỏi lưới chính, gấp lại trong `<details>` — trước
  đây chiếm nửa màn hình ngang hàng với creator đang hoạt động dù toàn số 0/—.

## Tab "Nhập tay" ở `/import` (21/08/2026, Đợt 2 #5)

`/import/manual-entry` (Manager-only) — chọn kênh rồi tái dùng nguyên `ManualEntryForm` đã có ở Chi
tiết kênh (`manual-entry-picker.tsx` chỉ là 1 `<select>` bọc ngoài, `key={channelId}` để form tự
reset trạng thái đóng/mở khi đổi kênh). `DataTabs` giờ nhận `isManager` để chèn thêm tab "Nhập tay"
chỉ cho Manager — Creator vẫn thấy đúng 2 tab (Import Studio + Kết nối), không có Nhập tay.

## Chi tiết kênh — thiết kế lại (21/08/2026, Đợt 2 #1) — có gì dùng được ngay

- **Thứ tự khối đổi hẳn**: 4 ô số → biểu đồ + tỷ lệ khán giả mới → **"Số liệu đã lưu theo ngày" (+
  Nhập tay đi kèm)** → heatmap + hashtag → video gần đây. Trước đây bảng ngày — thứ chi tiết/đáng tin
  nhất, thấy được từng ngày/từng nguồn/ngày nào thiếu — nằm CUỐI trang, dưới cả video/hashtag ít quan
  trọng hơn. Khớp nguyên tắc đầu CLAUDE.md: "trả lời dữ liệu đang thế nào trước".
- **Heatmap "Giờ vàng đăng bài"** trước đây chỉ có màu, không số, không thang tham chiếu — không đọc
  ra kết luận gì được ngoài "đậm nhạt khác nhau". Thêm: ô đậm nhất (giá trị cao nhất) tự hiện số ngay
  trên lưới; thang màu 6 bậc + số "cao nhất N follower/giờ" ở dưới.
- **Empty state của heatmap/hashtag nói rõ thiếu gì**: "Chưa có dữ liệu FollowerActivity.csv — cần
  import file Studio có kèm FollowerActivity.csv (tuỳ chọn, không phải mọi lần export đều có)" thay
  vì chỉ "chưa có dữ liệu". Tương tự cho bảng hashtag.

## Team — thiết kế lại + rollup + trang chi tiết (21/08/2026, phản hồi sau khi dùng thử) — có gì dùng được ngay

Sau khi tính năng Team cơ bản xong (mục "Team — nhóm Creator" phía trên), dùng thử trực tiếp qua
Browser pane (đăng nhập thật) phát hiện panel quản lý Team quá sơ sài — chỉ chữ thuần, không avatar,
không đường phân cách, "Sửa"/"Xoá" là link chữ trần. Liền sau đó, thêm 3 yêu cầu: team hiện được số
liệu tổng hợp, bấm vào team xem được từng thành viên, đổi tên trang "Creator" → "Nhân sự".

- **`aggregateChannelStats(channelIds, statsByChannel)`** (mới, `lib/dashboard.ts`, có test) — rút ra
  từ logic rollup-theo-creator vốn đã viết inline trong `creators/page.tsx`, giờ dùng chung cho CẢ
  rollup-theo-creator lẫn rollup-theo-team (team chỉ là tập kênh rộng hơn — toàn bộ kênh của mọi
  creator trong team). Nhờ vậy `/creators` và `/creators/team/:id` không thể lệch số nhau — cùng đi
  qua 1 hàm. `RollupStat` gồm cả `followersNow` (tổng hiện tại) lẫn `followerGain` (tăng trong kỳ) —
  khớp đúng quy ước `TeamStatsRow` đã dùng ở Tổng quan (value = tồn kho, delta = tăng thêm).
- **`/creators/team/[id]`** (trang mới) — breadcrumb, 3 `StatTile` (Lượt xem/Follower/Tương tác) của
  cả team, danh sách từng thành viên tái dùng nguyên `CreatorCard`. Manager-only như trang chính.
- **`TeamSection` (creator-form.tsx)** — tên team giờ là `Link` sang trang chi tiết (bọc `<h2>`,
  không bọc luôn phần đếm creator/kênh — chỉ tên mới bấm được), kèm 3 `RollupStatChip` (Lượt xem/
  Follower/Tương tác) hiện ngay trên danh sách thẻ, không cần bấm vào mới thấy số.
- ⚠️ **`TeamManager`/`TeamRow` viết lại hoàn toàn** — bản đầu chỉ có text link "Sửa"/"Xoá" sát nhau,
  không avatar, không đường kẻ giữa các dòng, đọc "xấu" hẳn so với phần còn lại của app (đã dùng
  avatar tròn + `border-t border-line-soft` + nút bo viền ở `ConnectionsClient`/`ChannelRow` từ
  M3b/M4). Sửa: icon "người" trong vòng tròn cyan-bg mỗi team (giống avatar), pill đếm creator, nút
  "Sửa" bo viền thật, nút xoá icon-only (thùng rác, viền đỏ khi hover) thay vì chữ "Xoá" trần. Bài
  học: khi thêm 1 tính năng mới (Team) đừng chỉ lo đúng logic — style phải soi lại đúng những
  component list-row đã có sẵn trong app (`ConnectionsClient`, `ChannelRow`), không tự nghĩ ra một
  kiểu list-row mới.
- **Đổi tên trang "Creator" → "Nhân sự"** (`layout.tsx` nav label + H1) — **route giữ nguyên**
  `/creators`, không đổi URL (không có lý do đổi với app nội bộ, không ai bookmark theo dõi).
- **Kiểm chứng trực tiếp trong phiên đăng nhập thật** (Browser pane, không phải service role) sau
  mỗi vòng sửa — bắt được: (1) panel Team đầu tiên đúng là xấu như phản hồi, (2) sau khi viết lại,
  rollup + link + trang chi tiết đều hoạt động đúng bằng dữ liệu thật (team "test" có sukai, 2 kênh,
  737k view/-64%, 10,8k follower/+1.055, 3,52% tương tác — khớp đúng số của riêng sukai vì team đó
  hiện chỉ có 1 người).

## Team → Nhân sự → Kênh — dựng lại drill-down (21/08/2026, vòng 3 phản hồi) — có gì dùng được ngay

`/creators/team/[id]` (vòng 2 ở trên) dùng thử thêm một lần nữa thì lộ 2 vấn đề thật: thẻ Creator luôn
mở sẵn cho MỌI người bất kể đang xem team nào (chỉ có tiêu đề section phân biệt, không đóng/mở được —
4-5 người là cuộn dài); và bấm vào một Creator hay một kênh trong thẻ **không đi đâu cả** — `CreatorCard`
không có `Link`, danh sách kênh trong thẻ chỉ là `<span>`. Yêu cầu mới: team → xổ bảng thành viên → bấm
một người → trang riêng của người đó → trong đó bấm một kênh → sang trang kênh. Đã hỏi trước khi làm
(kiểu hiển thị dropdown, trang Nhân sự cần gì, giữ hay bỏ `/creators/team/[id]`, có thêm chọn kỳ không)
— quyết định: bảng dòng gọn (không giữ thẻ lớn), trang Nhân sự đủ 4 thẻ số + biểu đồ + bảng kênh + bảng
ngày + sửa tại chỗ, **bỏ hẳn** `/creators/team/[id]`, thêm `DateRangePicker`.

- **`lib/dashboard.ts` — 3 hàm dùng chung mới, có test đầy đủ:**
  - `RollupStat` thêm `videos`/`previousVideos`/`engagementRateDeltaPct` — trước đây rollup chỉ có
    view/follower/tương tác, trang Nhân sự cần thêm ô "Video đã đăng" và delta thật cho tương tác
    (trang team cũ hiển thị cứng `deltaText="—"` vì không có số).
  - `buildCreatorPerformance(creators, statsByChannel)` — gom đúng cái vòng lặp rollup-theo-creator
    từng bị copy-paste giống hệt nhau ở `creators/page.tsx` và `creators/team/[id]/page.tsx` (khối
    "for creator of creators { aggregateChannelStats(...) }"). `/creators` và `/creators/[id]` giờ
    không thể lệch số nhau vì cùng đi qua 1 hàm.
  - `mergeDailyRowsByDate(rows, channelCount)` — gộp nhiều kênh của 1 người về 1 dòng/ngày cho
    `DailyTable` ở trang Nhân sự. Giữ đúng luật null-vs-0 (`sumViews`): 1 ngày `null` nếu KHÔNG kênh
    nào có số, chứ không phải 0 giả. `source` lấy nguồn **yếu nhất** trong ngày (đúng thứ tự CLAUDE.md)
    — 1 ngày gộp chỉ đáng tin bằng kênh tệ nhất. `isComplete` đòi cả 2: mọi dòng góp vào tự nó đã đủ,
    **và** đủ số kênh kỳ vọng góp mặt ngày đó (1 kênh im lặng vắng mặt — ví dụ bị rate-limit — không
    được đọc thành "đầy đủ"). Kiểm chứng bằng dữ liệu thật ngay khi build xong: 1 ngày (17/08) chỉ 1/2
    kênh của sukai đồng bộ → đúng như thiết kế, dòng đó tự hiện "đã đối chiếu · thiếu dữ liệu" và cột
    Video hiện "—" chứ không phải 0.
- **`/creators` viết lại** — `team-accordion.tsx` (file mới, client component): mỗi team là 1 panel
  đóng mặc định (mở sẵn nếu chỉ có đúng 1 team, hoặc khi tới từ link `?team=<id>`/`_unassigned`), tiêu
  đề panel luôn hiện 3 chip rollup dù đang đóng. Mở ra là bảng CSS-grid dòng gọn từng creator (tên +
  email + kênh phụ trách + view/follower/tương tác + trạng thái + badge) — thay hẳn thẻ lớn `CreatorCard`
  2 cột luôn-mở. Bấm tên → `/creators/[id]`; bấm "Sửa" → thay nguyên dòng bằng form (đúng pattern
  `ChannelRow` đã dùng, không phải panel bung riêng — nhất quán với phần còn lại của app thay vì bịa
  kiểu tương tác mới). Người đã vô hiệu hoá không còn tách `<details>` riêng ở cuối trang nữa — nằm
  cuối panel team của chính họ (badge trạng thái đủ phân biệt, đỡ thêm 1 lượt bấm). **Rank badge luôn
  tính trên TOÀN BỘ creator** (bug thật ở bản trước: cùng 1 người có thể "Dẫn đầu view" ở trang team
  nhưng "Cần chú ý" ở `/creators` vì mỗi màn hình tự tính rank trên tập dữ liệu khác nhau — giờ tính
  1 lần, dùng chung). Thêm `DateRangePicker` (bỏ cứng "7 ngày gần nhất").
- **`/creators/[id]` (route mới) — trang riêng từng Nhân sự**, bố cục bám `channels/[id]/page.tsx` để
  2 trang chi tiết đọc giống nhau: breadcrumb, avatar + pill team (bấm về `/creators?team=<id>`, accordion
  tự mở đúng panel + cuộn tới), `DateRangePicker`, 4 `StatTile`, `TrendChart` (tuần/tháng, 3 tab Lượt
  xem/Follower/Video — dùng thẳng `bucketWeeklyViews`/`bucketWeeklyLastFollowers`/`bucketWeeklyVideoCounts`
  trên dữ liệu RAW nhiều-kênh, không qua `mergeDailyRowsByDate` — các hàm bucket này đã tự gộp đúng
  nhiều kênh qua `groupByChannel`, đưa dữ liệu đã gộp vào sẽ làm sai phần follower theo tuần/tháng),
  bảng "Kênh phụ trách" bấm được sang `/channels/[id]` (đây là chỗ vá ngõ cụt chính), `DailyTable` với
  dữ liệu qua `mergeDailyRowsByDate`, nút "Sửa thông tin" mở `CreatorEditForm` (tách từ `CreatorCard`
  cũ, dùng chung với dòng trong accordion — 1 form, 2 nơi gọi).
- **`daily-table.tsx` nới props** — `channelHandle` (dùng để tự ghép tên file CSV) đổi thành
  `csvFilename` (caller tự ghép), thêm `subtitle?`/`emptyText?` — trang kênh giữ nguyên hành vi cũ qua
  giá trị mặc định, trang Nhân sự truyền câu chữ khác ("tổng hợp mọi kênh phụ trách...").
- **Xoá `/creators/team/[id]`** và `creator-form.tsx`'s `CreatorCard`/`TeamSection` (~230 dòng) — không
  còn ai gọi. `updateCreatorAction` thêm `revalidatePath('/creators/[id]')` (trước chỉ revalidate
  `/creators`, sửa từ trang chi tiết sẽ không thấy đổi ngay).
- **Kiểm chứng bằng phiên đăng nhập thật** (Browser pane, Manager thật, cùng tài khoản phiên trước) —
  đi hết cả vòng: `/creators` → mở panel "test" → bấm "sukai" → `/creators/[id]` đúng người, 4 thẻ số
  + biểu đồ + bảng kênh có số → bấm kênh "nong.nghiep.xanh.17" → sang đúng `/channels/[id]` → quay lại,
  bấm pill team "test" → về `/creators?team=<id>` panel tự mở + cuộn tới; đổi kỳ "30 ngày qua" → số đổi,
  `?team=` không mất (merge đúng); "Sửa" ở cả 2 nơi (dòng trong accordion, nút trên trang chi tiết) mở
  form, Lưu/Huỷ đều hoạt động, không lỗi console, mọi request 200. Bucket "Chưa gán team" + 1 tài khoản
  đã vô hiệu hoá/0 kênh (còn sót từ QA đợt M2) hiện đúng — số 0/"—" đúng chỗ, không badge rank.

## CRUD đầy đủ Nhân sự/Kênh (21/08/2026, theo yêu cầu) — có gì dùng được ngay

Team đã có đủ Create/Read/Update/Delete từ lúc làm tính năng Team (mục "Team — nhóm Creator" trên).
Creator và Kênh có C/R/U nhưng "Delete" chỉ là toggle `isActive` — chưa từng có cách xoá hẳn bản ghi.

Trước khi code: cảnh báo xoá thật (hard delete) sẽ xoá theo tầng (`on delete cascade`) toàn bộ
`data_snapshot`/`content_video`/`kpi_cycle`/`channel_ownership_history` của kênh, hoặc lịch sử phụ
trách của creator — đi ngược nguyên tắc "lưu trữ dữ liệu theo thời gian" mở đầu CLAUDE.md, và có thể
xoá luôn số liệu KPI đã chốt sổ dùng tính thưởng/lương. Đưa 3 phương án (chỉ vô hiệu hoá / xoá thật
nhưng chỉ khi chưa có dữ liệu / xoá thật hoàn toàn). Người dùng chọn: **xoá thật hoàn toàn, nhưng bắt
gõ đúng tên để xác nhận, chỉ Manager được xoá.**

- **`ConfirmDeleteForm`** (mới, `app/(app)/confirm-delete-form.tsx`) — pattern "gõ đúng tên mới bật
  nút xoá" kiểu GitHub xoá repo, dùng chung cho cả Creator lẫn Channel (component đầu tiên được chia
  sẻ giữa 2 khu vực thay vì mỗi nơi tự viết `ErrorBox` riêng như quy ước cũ — đủ phức tạp để đáng chia
  sẻ). Ô gõ tên gửi kèm form dưới dạng `confirmName` ẩn — chỉ để ghi vào `audit_log.note` cho dễ đọc,
  KHÔNG phải cơ chế bảo mật (quyền thật vẫn là `requireManager()` + id đã bind sẵn ở server action).
- **`deleteChannel()` (`lib/channels.ts`) chặn hẳn nếu kênh có `kpi_cycle.status = 'final'`** — áp
  đúng luật đã có sẵn trong CLAUDE.md ("KPICycle final → khoá số liệu, mọi thay đổi phải audit_log")
  thay vì để xoá bypass luôn luật đó. `kpi_cycle` hiện chưa có row nào (M5 chưa làm) nên check này
  chưa từng chặn thật, nhưng phải có sẵn trước khi M5 tạo ra cycle đầu tiên.
- **`deleteCreator()` xoá Auth user, không xoá thẳng row `creator`** — `creator.id references
  auth.users(id) on delete cascade` tự lo phần đó, đối xứng với `createCreator()` tạo Auth user
  trước. Cascade phụ: `channel_ownership_history` của creator này mất theo (chấp nhận được — người
  dùng đã chọn xoá thật); kênh đang phụ trách chỉ thành "chưa gán" (`on delete set null`), không mất.
- **`resetCreatorPassword()`** — Manager đặt mật khẩu tạm mới cho Creator bất kỳ lúc nào, không cần
  Creator tự đổi trước (docs/PRODUCT_SPEC.md mục 8 đã ghi thiếu tính năng này). Hiện mật khẩu mới
  đúng 1 lần, cùng UX với lúc tạo tài khoản (`CreatedNotice`).
- **`CreatorEditForm` đổi từ 1 form thành 3 panel** (sửa / đổi mật khẩu / xoá) chuyển đổi tại chỗ —
  không hiện đồng thời, để một thao tác phá huỷ không bao giờ nằm cạnh nút "Lưu" thông thường chỉ
  cách 1 cú click nhầm. `ChannelRow`'s edit form thêm nút "Xoá kênh" theo cùng logic.
- **`audit_log`** ghi sau khi xoá thành công (không ghi trước — tránh log "đã xoá" cho thao tác vừa
  fail ở bước chặn KPI). `entity_id` cố tình không có FK (comment sẵn trong migration: "survives
  account deletion") — đúng thiết kế cho use case này.
- `DELETE /api/creators/:id`, `DELETE /api/channels/:id` — thêm cho đủ quy ước "mọi resource có
  route" dù UI hiện tại gọi server action, không gọi route này (giống cách Team đã làm).

## Đăng nhập bằng username (22/08/2026, theo yêu cầu) — có gì dùng được ngay

Phát sinh từ phản hồi UI của tính năng CRUD ở trên: người dùng không muốn Creator phải có email thật
để đăng nhập, chỉ cần tên đăng nhập + mật khẩu. Ràng buộc thật sự: Supabase Auth **bắt buộc phải có
email** ở tầng dưới — không có khái niệm username thuần. Đã hỏi trước khi đụng schema (đây là đổi khó
sửa lại, ảnh hưởng tài khoản Manager đang dùng để đăng nhập thật) — 2 quyết định: (1) Manager cũng
chuyển sang username luôn, dùng chung 1 ô "Tên đăng nhập" cho cả 2 vai trò; (2) migrate cả tài khoản
Manager thật đang có (`username: "andang"`, người dùng tự chọn) — **không đổi mật khẩu/email hiện có
của ai**, chỉ thêm cột tra cứu mới, không ai bị đăng xuất hay mất quyền truy cập giữa chừng.

- **Migration `20260822000001_username.sql`** — cột `username` (unique, not null,
  `^[a-z0-9._-]{3,32}$`) trên cả `manager` và `creator`. Bảng `creator` lúc migrate đang **rỗng**
  (đã kiểm tra trước — 2 tài khoản test/thật trước đó không còn, chắc người dùng đã tự xoá thử tính
  năng xoá vừa xong) nên không cần backfill; chỉ backfill Manager thật.
- **`resolveLoginEmail()` (mới, `lib/auth.ts`)** — tra `username → email` thật trước khi gọi
  `signInWithPassword()`. Đây là chỗ DUY NHẤT trong app dùng admin client mà không đứng sau
  `requireManager()` trước — hợp lý vì lúc này chưa có phiên đăng nhập nào cả để RLS cho đọc bảng
  `manager`/`creator`. Gõ nguyên email cũ (có dấu `@`) vẫn được — không tra cứu, để thẳng cho
  `signInWithPassword` tự nhận/từ chối, tránh 1 lượt query thừa cho trường hợp hiếm.
- **`createCreator()` sinh email nội bộ `{username}@creator.internal`** — Supabase Auth vẫn cần 1
  email hợp lệ để tạo user, nhưng giá trị này không ai thấy hay gõ lại; `email_exists` từ Auth được
  dịch thành thông báo "tên đăng nhập đã có tài khoản" (đúng nghĩa, vì email sinh 1:1 từ username).
- **Tài khoản cũ (Manager thật) giữ nguyên hoàn toàn ở tầng Auth** — chỉ thêm `username` vào row, mật
  khẩu và email thật (`duytien@gmail.com`) không đổi. Đây là lý do chọn cách này thay vì đổi
  `auth.users.email` sang giá trị tổng hợp cho tài khoản cũ — tránh mọi rủi ro liên quan tới
  session/re-confirm của Supabase Auth khi đổi email một tài khoản đang hoạt động thật.
- **`audit_log.actor` đổi từ `.email` sang `.username`** ở cả 6 nơi ghi — comment gốc của cột này
  ("Email of the acting user... survives account deletion") giờ hơi lệch chữ nghĩa (không sửa lại
  bằng migration riêng, chỉ 1 chuỗi comment, không đáng thêm 1 migration cho việc này).
- **`scripts/seed.mjs` + `.env.example`** thêm `SEED_MANAGER_USERNAME` — script vẫn idempotent
  (`upsert` theo `id`) nên chạy lại ở môi trường đã seed không làm mất `username` đã gán, nhưng môi
  trường mới hoàn toàn (chưa từng seed) sẽ cần biến này vì cột `username` giờ `not null`.
- **Nhân tiện đổi "Mật khẩu tạm" → "Mật khẩu"** (yêu cầu riêng, làm cùng lúc vì cùng form) — chữ "tạm"
  ngụ ý sẽ phải đổi sau, nhưng thực tế chưa từng ép đổi mật khẩu lần đầu (đã ghi ở PRODUCT_SPEC.md
  mục 8 từ trước) nên chữ "tạm" không đúng với hành vi thật.

## Tổng quan — thay Tỷ lệ tương tác bằng Tổng số like (22/08/2026, theo yêu cầu) — có gì dùng được ngay

- **4 thẻ số ở Tổng quan (`teamStats`) đổi "Tỷ lệ tương tác" → "Tổng số like"**, và **bỏ hẳn badge
  "so với kỳ trước" trên cả 4 thẻ** (theo yêu cầu, xem xu hướng qua biểu đồ bên dưới thay vì lặp lại
  ở từng thẻ). Ngoại lệ CLAUDE.md ("engagement rate luôn hiển thị ngang hàng view/follower") chỉ áp
  dụng cho màn này — `channels/[id]`, `creators/[id]`, `team-accordion` **không đổi gì**, vẫn hiển thị
  Tỷ lệ tương tác đầy đủ với badge như cũ (dùng chung `StatTile` nhưng khác lời gọi).
- **`sumLatestVideoLikes()` (mới, `lib/dashboard.ts`)** — tổng like **hiện tại** (không phải trong kỳ),
  cùng kiểu với `followers`: cộng `like_count` mới nhất của từng video (bảng `video_snapshot`), không
  phải sum theo ngày như `views`. Vì vậy **không đổi theo bộ lọc ngày** — chọn 7 ngày hay Toàn bộ thời
  gian, Tổng số like vẫn như nhau, giống hệt cách Follower toàn team hoạt động.
- Cân nhắc rồi bỏ: dùng thẳng `data_snapshot.likes` (đã có cột, dùng cho engagement rate) thay vì
  cộng theo video — **không dùng** vì cột đó chỉ `studio_import` ghi (cuối tuần), trong khi 3 thẻ kia
  cập nhật hằng ngày qua Display API; Tổng số like sẽ đứng yên cả tuần nếu theo cách đó, nhìn như treo.
- Cân nhắc rồi bỏ: tạo view/RPC Postgres cho "like mới nhất mỗi video" (nhanh hơn) — **không làm**,
  vì cần 1 migration mới phải tự tay áp dụng lên Supabase (không có Supabase CLI trong máy), trong khi
  scale thật hiện tại (~1-8 kênh) nhỏ vừa đủ để lặp dedup ở JS như `fetchChannelVideos()` đã làm —
  giống hệt pattern hiện có, không thêm khái niệm mới. Nếu số kênh/video tăng nhiều, đây là chỗ tối ưu
  đầu tiên nên nhìn tới.

## Tổng quan — mặc định "Toàn bộ thời gian" thay vì "7 ngày qua" (22/08/2026, theo yêu cầu)

- Chỉ đổi **giá trị mặc định lúc mới vào trang Tổng quan** (`app/(app)/page.tsx`, khi URL chưa có
  `?from=`/`?to=`) — `resolvePeriodParams()` dùng chung và 3 trang còn lại gọi nó (Kênh, Nhân sự,
  Creator chi tiết) **không đổi**, vẫn mặc định 7 ngày. Lý do đổi: kênh vừa kết nối lại thì cửa sổ 7
  ngày gần như luôn rỗng — "Video đã đăng" nhảy từ 14 (7 ngày) lên 51 (toàn bộ) sau khi đổi, khớp đúng
  tổng số video thật của kênh.
- **`ALL_TIME_FROM = "2020-01-01"` (mới, `lib/time.ts`)** — mốc cố định, không suy từ ngày hiện tại
  (khác `defaultDays`-based fallback của `resolvePeriodParams`) — cố tình, để không bị trôi theo thời
  gian: nếu dùng "N ngày trước hôm nay" cho khái niệm "mãi mãi", N cố định sẽ dần cắt mất dữ liệu thật
  càng về sau công cụ càng chạy lâu. `DateRangePicker` thêm preset "Toàn bộ thời gian" dùng chung hằng
  số này (nhận diện đúng làm preset đang chọn thay vì hiện dải ngày thô) — dùng được luôn ở Kênh/Creator
  chi tiết dù mặc định 2 trang đó không đổi, vì component picker là 1 cái dùng chung.
- ⚠️ **Phát hiện lúc kiểm chứng, không phải do đổi mặc định:** "Lượt xem"/"Tương tác" vẫn "—"/0 kể cả
  ở Toàn bộ thời gian — kiểm tra bảng "Số liệu đã lưu theo ngày" ở `/channels/[id]` thì `data_snapshot`
  của kênh `vuonvuonvang` hiện **chỉ có đúng 1 dòng** (hôm nay, `video_views = null` vì là lần sync
  bootstrap sau khi kết nối lại — docs/DISPLAY_API.md bẫy #10). Người dùng xác nhận đã tự xoá dữ liệu
  khác lúc dọn (chỉ giữ 1 kênh + 1 Creator) — nhiều khả năng lịch sử `data_snapshot` cũ (từng có, dùng
  để tính view/engagement) bị xoá theo, trong khi `content_video`/`video_snapshot` (nguồn của "Video
  đã đăng" 51 và "Tổng số like" 108k) thì còn nguyên. **Không phải bug** — số Lượt xem thật sẽ bắt đầu
  tích luỹ lại từ lần sync kế tiếp (cron 03:00 mai). Muốn có lại lịch sử Lượt xem cũ: import lại file
  Studio gốc của kênh này qua `/import` nếu người dùng còn giữ file.

## Đăng nhập bằng email — siết chặt, bỏ hẳn (22/08/2026, theo yêu cầu)

- Từ khi chuyển sang username (mục "Đăng nhập bằng username" ở trên), `resolveLoginEmail()` vẫn giữ
  1 lối tắt: input có dấu "@" được coi là email thật và cho thẳng qua `signInWithPassword`, không tra
  `username` — tức **email thật (kể cả không hiển thị/không gõ được ở UI khác) vẫn đăng nhập được**
  nếu ai đó nhớ/đoán ra. Phát hiện lúc soát lại code lúc debug 1 ca sai mật khẩu thật (không phải do
  lỗi này — mật khẩu đúng là sai) trong phiên làm việc, người dùng yêu cầu bỏ hẳn.
- **Sửa:** `resolveLoginEmail()` giờ trả `string | null` — chỉ trả email khi `username` khớp đúng 1
  hàng trong `manager`/`creator`; không khớp (kể cả input dạng email, vì `@` không bao giờ khớp được
  `username` do ràng buộc regex `^[a-z0-9._-]{3,32}$`) → trả `null`. `app/login/actions.ts` chặn ngay
  khi `null`, không gọi `signInWithPassword` nữa — email thật không còn đường nào vào được, kể cả gõ
  đúng 100%.
- Không có test cho `resolveLoginEmail()` (dùng `createSupabaseAdminClient()` thật, chưa có hạ tầng
  mock Supabase admin trong bộ test hiện tại — cùng lý do các hàm dùng admin client khác cũng chưa
  test). Đã kiểm bằng tay: login thật với `username` đúng vẫn qua bình thường sau khi sửa (build +
  141 test khác không ảnh hưởng); **chưa** tự kiểm được ca "gõ email thật vẫn bị từ chối" vì cần nhập
  mật khẩu thật — nhờ người dùng tự xác nhận nếu cần chắc 100%.

## Tỷ lệ tương tác → Lượt tim, toàn app (22/08/2026, theo yêu cầu) — có gì dùng được ngay

- Mở rộng quyết định "Tổng quan thay Tỷ lệ tương tác bằng Tổng số like" (mục trên) ra **toàn bộ 4 chỗ
  còn lại** hiển thị tỷ lệ tương tác: `channels/[id]` (thẻ số), `creators/[id]` (thẻ số +
  `creator-channels-table.tsx` cột theo kênh), `team-accordion.tsx` (2 chỗ: rollup Team + cột theo
  Creator). Quy tắc CLAUDE.md cũ "luôn hiển thị ngang hàng view/follower" đã bỏ hẳn — không còn ngoại
  lệ nào giữ lại tỷ lệ tương tác ở UI.
- **`fetchLatestVideoLikesByChannel()` (mới, thay cho `sumLatestVideoLikes()` cũ, `lib/dashboard.ts`)**
  — cùng logic (like mới nhất mỗi video, cộng dồn) nhưng trả `Map<channelId, number>` thay vì 1 số —
  dùng chung được cho mọi cấp độ (1 kênh, Creator, Team, toàn team) bằng cách cộng đúng tập channelId
  cần. `sumLatestVideoLikes()` giữ lại làm wrapper mỏng (`[...map.values()].reduce(...)`) cho chỗ gọi
  cũ ở Tổng quan, không đổi behavior ở đó.
- **`ChannelPeriodStat`/`RollupStat`/`CreatorPerformanceChannel` (`lib/dashboard.ts`) bỏ hẳn
  `likes/comments/shares/previousLikes/previousComments/previousShares/engagementRate/
  engagementRateDeltaPct`, thêm `totalLikes: number`** — không phải theo kỳ (giống `followersNow`,
  không có `previous`/delta đi kèm), tính 1 lần trong `getChannelPeriodStats()` qua
  `fetchLatestVideoLikesByChannel()` (thêm vào `Promise.all` sẵn có, không thêm round-trip tuần tự) rồi
  cộng dồn ở `aggregateChannelStats()`/`buildCreatorPerformance()` như các field khác.
- Cân nhắc rồi bỏ: giữ `engagementRate`/`engagementRateDeltaPct` trong type nhưng chỉ ngừng render ở
  UI — **không làm**, vì người dùng yêu cầu rõ "bỏ tất cả", giữ field chết trong type/data layer trong
  khi không còn nơi nào tiêu thụ đúng là dead code nên xoá theo.
- **Không đổi**: `engagementRate()`/`sumEngagementParts()` (hàm thuần) và cột `data_snapshot.likes/
  comments/shares` — vẫn được `lib/import/*.ts` (parser Studio CSV) ghi và `lib/channels.ts`'s
  `latestStats.engagementRate` (`GET /api/channels`, không phải màn hình nào trong scope lần này)
  vẫn dùng. Không nằm trong 4 chỗ người dùng liệt — cố tình không đụng.
- `dashboard.test.ts`: bỏ 2 test kiểm `engagementRateDeltaPct` (kiểm hành vi đã xoá, không có gì thay
  thế hợp lý), sửa fixture `channelStat()` + 3 test còn lại của `aggregateChannelStats`/
  `buildCreatorPerformance` sang `totalLikes`. 141/141 test qua, build/typecheck sạch. Kiểm chứng
  trực quan bằng browser thật cả 4 vị trí (không chỉ dựa test) — số `108k` khớp nhau tuyệt đối ở
  Tổng quan, kênh, Creator, Team.

## Siết kết nối Display API + sửa cách tính view/ngày (24/08/2026, phát hiện lúc điều tra "bấm Kết nối không hiện màn login")

Bắt đầu từ câu hỏi thực tế: bấm "Kết nối" trên `/connections` không hiện màn hình TikTok nào cả, và
xoá-rồi-nối-lại một kênh cũng không cần Authorize lại. Điều tra ra nguyên nhân gốc + kéo theo phát
hiện 2 lỗi tính số liệu nghiêm trọng hơn câu hỏi ban đầu. Chẩn đoán bằng 2 script read-only
(`scripts/diagnose-oauth.mjs`, `scripts/diagnose-data.mjs`, giữ lại trong repo) trước khi sửa gì —
kết quả 24/08: dữ liệu production **sạch**, các lỗ hổng dưới đây chưa kịp gây thiệt hại thật. Chi
tiết kỹ thuật đầy đủ từng bẫy: [DISPLAY_API.md](DISPLAY_API.md) #9 (mở rộng), #10 (thay thế bởi B1),
#12, #13 (mới).

### Nhóm A — kết nối OAuth

- **`disable_auto_auth=1`** (`lib/tiktok/oauth.ts` `buildAuthorizeUrl()`) — đây là câu trả lời cho
  câu hỏi gốc. TikTok mặc định (`disable_auto_auth=0`) bỏ qua màn authorize khi trình duyệt còn
  session hợp lệ VÀ tài khoản đó từng cấp quyền cho app rồi. Với 9 kênh = 9 tài khoản TikTok dùng
  chung 1 OAuth client, mặc định này có nghĩa: không có bất kỳ màn hình nào để người bấm nhận ra
  mình đang cấp quyền bằng tài khoản của kênh khác — đúng cách sự cố `@kidshoppppala` 21/08 xảy ra,
  và suýt lặp lại 24/08 với `@ghientrongcay` (may mắn được guard so handle chặn). **Không** bắt đăng
  nhập lại — session TikTok còn thì màn authorize vẫn hiện sẵn tài khoản đó; đổi tài khoản vẫn phải
  tự đăng xuất tiktok.com. Xoá-kênh-rồi-nối-lại "không cần Authorize" hoá ra đúng bản chất: grant
  nằm trên server TikTok theo `(client_key, tài khoản)`, xoá hàng `channel_oauth` không liên quan gì
  tới grant đó — và chưa chỗ nào từng gọi revoke (xem "Ngắt kết nối" bên dưới).
- **`peekFirstVideoLink()` (`lib/tiktok/display-api-provider.ts`) đổi từ `string | null` sang union
  `{status: "ok"|"no_videos"|"failed"}`** — bug thật: mọi lỗi gọi API (rate limit, thiếu scope, lỗi
  mạng) từng bị gộp chung với "tài khoản 0 video" thành cùng một `null`, khiến callback lưu token và
  hiện "chưa xác minh — có thể do 0 video" cho một kết nối **thực ra chưa hề được kiểm tra**. Người
  vận hành đọc nhầm rồi bấm "Xác nhận đúng tài khoản" là đúng kịch bản 21/08 lặp lại qua cửa khác.
  Giờ `failed` chặn hẳn, không lưu gì.
- **Kiểm scope thực nhận** (`missingScopes()`, `lib/tiktok/oauth.ts`) — màn authorize cho bỏ tick
  scope, callback trước đây không kiểm và còn `scopes: scopeGranted || TIKTOK_SCOPES` (ghi cả scope
  chưa hề được cấp vào DB). Giờ thiếu `video.list`/`user.info.stats`/`user.info.basic` thì không lưu.
  Cố tình kiểm TRƯỚC bước đối chiếu handle — thiếu `video.list` thì `peekFirstVideoLink` chắc chắn
  fail, kiểm scope trước để báo đúng nguyên nhân thay vì "verify_failed" mập mờ.
- **Migration `20260824000001_oauth_hardening.sql` — `UNIQUE(tiktok_open_id)` + cột
  `authorized_handle`.** Người dùng xác nhận rõ: không có trường hợp hợp lệ nào 1 tài khoản TikTok
  nối 2 kênh → constraint chặn cứng ở tầng DB, lớp phòng thủ thứ hai độc lập với guard so handle ở
  tầng app (guard có đường vòng: không đối chiếu được, hoặc — trước đây — nút bypass). Kiểm production
  trước khi viết migration (kiểm 1 của `diagnose-oauth.mjs`): sạch, 6 open_id khác nhau, áp được ngay
  không cần dọn dữ liệu trước. **⚠️ Migration viết xong nhưng CHƯA áp lên Supabase** — máy này không
  có Supabase CLI, không có `psql`/gói `pg`, và `.env.local` chỉ chứa URL + REST key (không có DSN
  Postgres) nên không có cách nào tự chạy DDL. Cần chạy tay qua Supabase Dashboard → SQL Editor.
- **Bỏ hẳn nút "Vẫn kết nối"** (cờ `ack` xuyên suốt `lib/tiktok/oauth.ts` state cookie,
  `oauth/start/route.ts`, `connections-client.tsx`) — theo yêu cầu, sau khi chỉ ra: nguyên nhân thật
  duy nhất của một mismatch được xác nhận (không phải lỗi đối chiếu) là `channel.tiktok_handle` bị
  cũ (kênh đổi handle trên TikTok). Bypass lưu vĩnh viễn một mismatch thay vì sửa nguyên nhân của nó.
  Banner mismatch giờ có 2 lối ra thật: đăng xuất+thử lại, hoặc (Manager) nút cập nhật handle kênh
  rồi tự kết nối lại ngay (gọi `PATCH /api/channels/:id` rồi `handleConnect` lại, không bắt mở form
  Sửa kênh riêng).
- **Nút "Ngắt kết nối"** (`POST /api/channels/:id/oauth/disconnect`, quyền giống `/oauth/start` —
  Creator ngắt được kênh mình) gọi thật `POST /v2/oauth/revoke/` (best-effort, `lib/tiktok/oauth.ts`
  `revokeToken()`) rồi xoá hàng `channel_oauth`. Gọi từ **3 nơi** qua `lib/tiktok/disconnect.ts`: nút
  riêng, `DELETE /api/channels/:id`, và `deleteChannelAction`. ⚠️ **Bẫy thứ tự đã tránh**:
  `channel_oauth` cascade-xoá theo `channel` (migration 0003), và `deleteChannel()` có thể chặn (KPI
  final) — gọi revoke TRƯỚC `deleteChannel()` sẽ lỡ tay xoá mất kết nối của một kênh vẫn còn sống nếu
  delete bị chặn. Giải pháp: đọc token TRƯỚC `deleteChannel()`, chỉ thực sự gọi revoke SAU khi
  `deleteChannel()` đã xác nhận thành công (`readChannelOauthAccessToken` +
  `revokeAfterChannelDeleted`, tách riêng khỏi `revokeAndClearChannelOauth` dùng cho nút đứng riêng).
- **`authorized_handle` hiện thường trực** dưới tên kênh trên bảng `/connections` — trước đây không
  có màn nào cho biết một kết nối đang thực sự trỏ tới tài khoản TikTok nào, đúng lý do sự cố 21/08
  không ai để ý kịp thời (badge "chưa xác minh" từng chỉ là banner 1 lần).

### Nhóm B — cách tính view/ngày (B1)

Trong lúc điều tra nhóm A, dựng lại đường đi của con số `96.528` view/ngày bất thường ở kênh "Làm
Nông Thông Thái" (24/08) lộ ra 2 lỗi độc lập với nhóm A, nằm ở `lib/tiktok/sync.ts`:

1. **Bấm "Chạy đồng bộ ngay" nhiều lần/ngày CẮT CỤT số view của ngày đó** — `data_snapshot` upsert
   ghi đè theo `(channel_id, date, source)`, còn `determineSyncDate()` cũ gán ngày + tính delta dựa
   vào `last_sync_at` của lần TRƯỚC. Bấm sync lần 2 trong ngày → delta chỉ còn tính từ lần đầu (vài
   phút/giờ) thay vì từ hôm qua, đè mất phần đã tích luỹ trước đó.
2. **Kết nối lại không reset `last_sync_at`** → sync đầu sau khi nối lại gán delta vào NGÀY CỦA LẦN
   SYNC CŨ, so với baseline có thể của tài khoản cũ (rò view trọn đời — bẫy #10 kiểu cũ).

**Sửa gốc, không phải vá:** `computeViewsDelta()` (`lib/tiktok/video-delta.ts`) bỏ hẳn khái niệm
"bootstrap"/`last_sync_at`. Công thức mới: `view(D) = Σ_video max(0, luỹ_kế(video,D) −
luỹ_kế(video,D−1))`, đọc từ `video_snapshot` — baseline luôn là **đúng ngày `D−1`**, không phải "mới
nhất trong 30 ngày" (`HISTORY_LOOKBACK_DAYS` xoá luôn, không còn cần). Video không có baseline: cộng
trọn nếu `posted_at` rơi đúng ngày `D` (thật sự mới đăng), loại khỏi tổng nếu không (`is_complete =
false`) — đây là nơi bẫy #10 được giải quyết triệt để thay vì né bằng flag `isBootstrap`.

- **Idempotent thật sự**: `video_snapshot` upsert theo `(content_video_id, date)`, nên sync lại
  trong ngày chỉ làm mới ảnh chụp của đúng ngày đó — không bao giờ mất, không bao giờ cộng trùng.
  A8 (reset `last_sync_at` khi nối lại) trở nên **không cần thiết** — công thức mới không phụ thuộc
  `last_sync_at` nữa, một baseline thiếu tự nhiên rơi vào nhánh "thấy muộn" ở trên.
- **`null` vs `0` cho `video_views` — soát kỹ trước khi đổi, vì suýt sai.** Ý định ban đầu là "cứ
  ghi số thật + `is_complete=false`, không cần `null` nữa" — SAI: `lib/dashboard.ts`'s `sumViews()`
  chỉ lọc theo `videoViews !== null`, KHÔNG theo `is_complete`; biểu đồ xu hướng vẽ `null` thành
  khoảng trống còn `0` thành một điểm dữ liệu thật (đã có test khoá hành vi này,
  `dashboard.test.ts`). Ghi `0` cho ngày "không đo được gì" sẽ khiến biểu đồ vẽ sai một điểm coi như
  view thật sự bằng 0. Giữ nguyên quy tắc cũ: `null` khi KHÔNG video nào đóng góp được số nào (mọi
  video đều "thấy muộn"), số thật (kể cả một phần) khi có ít nhất 1 video đo được, `0` thật khi kênh
  đúng là không có video nào.
- **`sampleDateForRun()` (mới, `lib/time.ts`)** — ngày lịch VN của một lần sync; tự lùi 1 ngày nếu
  chạy trong khoảng 00:00–02:00 VN, chống Vercel Cron trôi qua nửa đêm làm mất hẳn mẫu cuối ngày.
  `hourCycle: "h23"` cố ý (không phải `hour12: false`) — một số bản ICU render nửa đêm thành "24"
  thay vì "00" dưới `hour12: false`, sẽ âm thầm vô hiệu hoá phép so `< 2`.
- **Cron `vercel.json`: `0 20 * * *` (03:00 VN) → `30 16 * * *` (23:30 VN)** — để `video_snapshot`
  ghi đúng nghĩa "ảnh chụp cuối ngày lịch D", lệch còn 30 phút thay vì 3 tiếng. Đây cũng là điều kiện
  để phép so `display_api` ↔ `studio_import` (mục "Vẫn còn thiếu phép đo gốc",
  [DISPLAY_API.md](DISPLAY_API.md) #5) có thể khớp được về sau.
- **`determineSyncDate()` xoá hẳn, cùng `lib/tiktok/sync.test.ts`** (toàn bộ file chỉ test hàm này).
  Test mới: `computeViewsDelta` thêm ca "video thấy muộn bị loại khỏi tổng" (`video-delta.test.ts`),
  `sampleDateForRun` 4 ca (`time.test.ts`, số học UTC↔VN xác minh bằng Node trước khi viết, không
  tính tay — một ví dụ tính tay ban đầu sai lệch 1 ngày, bắt được trước khi vào test). 141/141 test
  qua (số không đổi: -5 từ `sync.test.ts` xoá, +1 `video-delta.test.ts`, +4 `time.test.ts`).
- **`scripts/backfill-daily-views.mjs` (mới)** — tính lại `video_views`/`is_complete` cho những ngày
  đã bị 2 lỗi trên ghi sai, dùng đúng công thức B1 port thủ công (không import được từ `lib/` — script
  `.mjs` thuần, cùng quy ước với `diagnose-*.mjs`). Mặc định dry-run; `--from=`/`--to=` để giới hạn
  khoảng ngày (không hard-code 23-24/08). **Viết xong, chưa chạy** — cần migration áp lên trước
  (không bắt buộc về mặt kỹ thuật cho script này, nhưng nên làm nhóm A xong trước để tránh 1 lần dọn
  dữ liệu nữa nếu phát sinh thêm sai lệch trong lúc đó).

### Bug phát hiện lúc chạy backfill — `video_snapshot`/`data_snapshot` cũ lệch quy ước ngày

Chạy dry-run `backfill-daily-views.mjs` thật (24/08/2026) cho kết quả sai — bắt được TRƯỚC khi ai kịp
`--confirm`, nhờ so số ra với số gốc thay vì tin luôn kết quả "trông hợp lý". Số recompute cho ngày
`D` khớp **tuyệt đối, tới từng đơn vị** với số gốc đã lưu cho ngày `D-1`, ở cả 4/4 kênh bị đổi số
(Cùng Anh Đi Muôn Nơi, Vườn Của Hant, Vườn Của Mây, Bơ Trồng Gì Đấy?) — khớp chính xác kiểu này không
thể là trùng hợp.

**Nguyên nhân**: `sync.ts` CŨ (bản đang chạy thật, trước khi bản vá B1 ở trên được deploy) ghi 2 cột
ngày theo 2 quy ước khác nhau — `video_snapshot.date = today` (ngày đồng hồ lúc sync chạy) nhưng
`data_snapshot.date = nowVnDateString(last_sync_at)` (ngày của lần sync TRƯỚC, qua `determineSyncDate`
đã xoá). Với cron đều đặn 1 lần/ngày, 2 giá trị này **luôn lệch nhau đúng 1 ngày**. `backfill-daily-
views.mjs` giả định 2 cột dùng chung 1 ngày (đúng cho dữ liệu code MỚI sẽ ghi, sai cho dữ liệu đang
có) → join nhầm cặp `video_snapshot`, tính đúng công thức nhưng dán nhãn lùi 1 ngày. Ngày 24/08 còn
rối hơn (nhiều lần "Chạy đồng bộ ngay" thủ công trong ngày phá vỡ luôn quy tắc lệch-đều-1-ngày) — nên
không chỉ đơn giản là "cộng thêm 1 ngày vào label" là xong.

**Đã khoá `--confirm` trong `backfill-daily-views.mjs`** ngay khi phát hiện (comment đầu file giải
thích rõ, script vẫn giữ lại — hữu ích về sau cho dữ liệu nhất quán quy ước ngày viết bởi code mới).

**Quyết định (người dùng chọn, sau khi được trình bày 2 phương án)**: không cố dựng lại số cũ đầy rủi
ro đoán sai — **xoá sạch toàn bộ tầng dữ liệu display_api của cả 6 kênh đang kết nối** (không riêng 4
kênh bị lệch số — kể cả 2 kênh vừa nối sạch hôm nay, đồng nhất một điểm xuất phát mới cho mọi kênh) và
để code mới (B1) dựng lại từ đầu. `scripts/reset-display-api.mjs` (mới) — dry-run mặc định, `--confirm`
mới ghi thật:
- Gọi `POST /v2/oauth/revoke/` thật (best-effort) rồi xoá `channel_oauth` — **không chỉ xoá DB**, còn
  gỡ uỷ quyền phía TikTok thật, để lần kết nối lại đi qua đúng 1 lượt Authorize thật (không làm bước
  này thì lặp lại đúng lỗ hổng vừa vá ở A1/A5: grant cũ sống bên TikTok, kết nối lại không hiện màn
  authorize).
- Xoá `data_snapshot` **chỉ nơi `source = 'display_api'`** — không đụng `studio_import`/
  `manual_entry` cùng kênh/ngày (khác dòng theo unique constraint).
- Xoá `content_video` của kênh — `video_snapshot` cascade xoá theo (FK `on delete cascade`), không
  cần xoá riêng.
- Không đụng `follower_activity`/`audience_snapshot` — 2 bảng đó chỉ Studio ghi, không liên quan.
- Port thủ công `decryptToken()`/`revokeToken()` từ `lib/crypto/token.ts`/`lib/tiktok/oauth.ts` (script
  `.mjs` thuần không import được TS, cùng quy ước với các script khác trong `scripts/`). Cố tình
  **không** select cột `authorized_handle` — cột đó chỉ tồn tại sau migration 0824, script này phải
  chạy được bất kể migration đã áp hay chưa.
- Mỗi kênh ghi 1 dòng `audit_log` (`actor: "scripts/reset-display-api.mjs"` — thao tác chạy tay qua
  script, không qua UI nên không có username người dùng cụ thể).

✅ **Chạy thật 24/08/2026, `--confirm` — thành công toàn bộ 6/6 kênh, không kênh nào lỗi:**
`revoke TikTok: OK` cho Làm Nông Thông Thái, Vườn Của Mây, Vườn Của Hant, Mộc Đi Rừng, Bơ Trồng Gì
Đấy?, Cùng Anh Đi Muôn Nơi — mỗi kênh xoá đúng số `content_video` đã in ở dry-run (49/54/25/34/39/49),
không có sai lệch giữa dry-run và lúc chạy thật. Kết quả: **cả 9 kênh giờ đều KHÔNG kết nối** (0 hàng
`channel_oauth`) — kể cả 3 kênh chưa từng nối trước đó, tất cả cùng một điểm xuất phát sạch. Grant cũ
trên TikTok đã được gỡ thật (không chỉ xoá DB) — lần Authorize kế tiếp của mọi kênh sẽ là một lượt
cấp quyền thật từ đầu, không còn phụ thuộc session/grant cũ nào.

### Còn treo — việc của người dùng

1. ~~Áp migration `20260824000001_oauth_hardening.sql`~~ — **đã áp lên Supabase** (xác nhận 25/08/2026:
   `channel_oauth.authorized_handle` tồn tại, có dữ liệu thật).
2. ~~Chạy `scripts/reset-display-api.mjs`~~ — **đã xong**, xem mục trên.
3. ~~Kết nối lại cả 9 kênh ở `/connections`~~ — **đã xong 25/08/2026**, cả 9 kênh Authorize lại qua
   TikTok thật + đồng bộ thành công ít nhất 1 lần (`node scripts/diagnose-oauth.mjs` xanh: đủ scope,
   xác minh tài khoản, video đúng kênh). Làm qua local dev server đang chạy code M5 + nhóm vá
   OAuth/view-per-day ở mục này — **vẫn chưa commit/push**, nên việc reconnect thành công thực chất
   là bằng chứng sống cho cả 2 nhóm code đó, không chỉ là việc vận hành của người dùng.
4. Nhóm C (đối chiếu Studio↔display_api, hiện `is_complete` trên UI, cảnh báo lệch bất thường, route
   hoá script chẩn đoán) — tách đợt sau, chưa bắt đầu.
5. **Mới phát sinh**: commit + push code (M5 + nhóm vá này) rồi deploy — production (Vercel) vẫn đang
   chạy code cũ, chưa có gì ở mục 1-3 phản ánh lên đó.

## M5 — KPI Cycle (25/08/2026) — có gì dùng được ngay

Danh sách file/module đầy đủ: [docs/TASKS.md](TASKS.md) mục "M5 — KPI Cycle". Phần này ghi lại các
**quyết định và lệch** không nằm gọn trong checklist.

### Quyết định chốt trước khi code (hỏi người dùng, không đoán)

- **UI ở cả 2 nơi**: trang `/kpi` riêng (đúng nhãn nav USER_FLOW.md đã ghi từ trước) **và** card "KPI
  kỳ này" trên chi tiết kênh — không chọn 1 trong 2.
- **Form tạo: từng kênh một**, đúng `design/KpiForm.dc.html` — không làm bảng nhập hàng loạt 9 kênh
  dù vận hành thật là đặt KPI cả 9 kênh mỗi tuần. Lý do chọn đơn giản hơn: giảm rủi ro code, và Manager
  đã quen thao tác "1 kênh 1 lượt" từ các form khác trong app (Nhập tay, sửa kênh...).
- **Kênh chưa có `followers` nào**: chặn tạo hẳn (không cho nhập tay follower đầu kỳ trong form KPI),
  báo rõ + link sang `/import/manual-entry`. Lý do: `followers_at_start` là `NOT NULL`, chụp 1 lần,
  không sửa được — một số nhập tay ở ĐÚNG form này sẽ không có nguồn gốc rõ ràng như số nhập qua màn
  Nhập tay chính thức (không ghi `audit_log`, không qua `createManualEntry()` đã có).
- **3 chỉ tiêu**: bắt buộc ít nhất 1, `overallPct` trung bình theo số chỉ tiêu đã đặt — lệch công thức
  gốc `/3` cố định trong API_SPEC.md, đã sửa doc.

### Bẫy kỹ thuật gặp lúc code

**Vòng lặp import giữa `lib/kpi.ts` và `lib/dashboard.ts`.** Kế hoạch ban đầu định để
`getDashboard()` (`lib/dashboard.ts`) tự tính luôn `kpiSummary`/`myChannels`' phần KPI bằng cách gọi
thẳng `lib/kpi.ts`. Không được: `lib/kpi.ts` đã cần import runtime từ `lib/dashboard.ts`
(`fetchDailyRows`, `groupByChannel`, `latestFollowers`, `sumViews` — tái dùng đúng theo kế hoạch, để
không viết lại các câu query đã có) để tính `attachProgress()`. Hai module import lẫn nhau ở tầng
RUNTIME (không phải chỉ type) — về lý thuyết vẫn chạy được nhờ hoisting của function declaration,
nhưng là anti-pattern dễ vỡ khi ai đó thêm code chạy ở top-level module sau này, và Turbopack có thể
xử lý khác nhau tuỳ ngữ cảnh. Giải pháp: `lib/kpi.ts` mới có 2 hàm ghép (`buildDashboardKpiSummary()`
+ `mergeDashboardKpi()`), gọi TỪ BÊN NGOÀI sau khi `getDashboard()` đã chạy xong (ở
`app/(app)/page.tsx` và `app/api/dashboard/route.ts`), không phải từ bên trong `getDashboard()`.
Thêm field `channels: {id, name}[]` vào `DashboardResponse` để 2 lệnh gọi này dùng chung đúng 1 tập
kênh đã lọc theo role/`creatorId`/`teamId`, không phải lọc lại lần 2.

**Cùng lý do đó, `metricText`/`metricHint` phải tách ra `lib/kpi-format.ts` riêng.** Phát hiện lúc
`npm run build` (không phải lúc code, không phải lúc `tsc --noEmit` — cả hai đều pass bình thường):
Turbopack fail cứng khi `kpi-cycle-form.tsx` ("use client") import `metricText` xuyên qua
`kpi-widgets.tsx` → `lib/kpi.ts` → `lib/auth.ts` (dùng `AuthorizationError`) → `lib/supabase/server.ts`
→ `next/headers`. `next/headers` bị chặn tuyệt đối khỏi Client Component bundle — không quan trọng
việc `metricText` tự nó không đụng gì tới auth, cả module `lib/kpi.ts` bị kéo theo khi import BẤT KỲ
export nào của nó. Bài học: **một module server-only (import `lib/auth.ts` hoặc bất kỳ thứ gì đụng
`next/headers`) không được có bất kỳ export nào bị Client Component import trực tiếp hay gián tiếp**
— hàm thuần cần dùng cả 2 phía phải sống ở một file KHÔNG import gì server-only, tách hẳn khỏi hàm I/O.
`lib/kpi-format.ts` (mới) chỉ phụ thuộc `lib/format.ts` (không phụ thuộc gì khác) — `lib/kpi.ts`
re-export lại 2 hàm này cho phía server dùng nguyên như cũ.

**`is_complete = false` và câu hỏi "loại khỏi số nào".** CLAUDE.md nói "không dùng snapshot đó tính
KPI" nhưng không nói rõ áp dụng cho CẢ 3 chỉ số hay chỉ view. Quyết định (tự suy luận từ nguyên lý, không
hỏi lại vì đã có đủ căn cứ trong docs có sẵn — `is_complete` phản ánh độ đầy đủ của `video/list` phân
trang, một API call HOÀN TOÀN khác với `user/info` trả `follower_count`): chỉ loại view, giữ
nguyên follower/video. Ghi rõ lý do trong code comment (`attachProgress`/`computeDataGaps`) và
API_SPEC.md để không ai "sửa lại cho nhất quán" nhầm sau này.

### Bug thật phát hiện lúc kiểm chứng — không phải lỗi M5

Loading `/channels` (và Tổng quan, cùng nguyên nhân) crash `HeadersOverflowError` khi test bằng
browser thật với dữ liệu production — **`fetchLatestVideoMetricsByChannel`**/
**`fetchRecentVideoViewsByChannel`** (`lib/dashboard.ts`, code từ M4) build 1 câu
`.in("content_video_id", videoIds)` cho TOÀN BỘ video của TOÀN BỘ kênh cùng lúc — với ~300+ video thật
hiện có trên 9 kênh, URL PostgREST vượt 16KB (giới hạn header của undici). Lỗi này đã tồn tại từ M4,
chỉ chưa từng lộ ra vì lúc đó tổng số video ít hơn ngưỡng — Studio import hàng tuần liên tục thêm
video mới vào `content_video`, không xoá cái cũ, nên tổng dần vượt ngưỡng theo thời gian mà không cần
code nào đổi. Vá tại chỗ (không thuộc phạm vi M5 nhưng chặn hẳn việc kiểm chứng cột "Tiến độ KPI" mới
build, nên sửa luôn trong cùng phiên): thêm `chunkArray()` + chia `videoIds` thành lô 150, chạy song
song bằng `Promise.all`, gộp kết quả — không đổi shape trả về, không đổi hành vi nghiệp vụ, chỉ đổi
cách gọi Supabase. Nếu tổng video tiếp tục tăng nhiều lần nữa (hàng nghìn), 150/lô vẫn đủ an toàn
(150×37 ký tự ≈ 5,5KB, còn nhiều dư địa dưới 16KB) nhưng đáng nhớ lại nếu triệu chứng tương tự xuất
hiện ở chỗ khác.

### Tự bắt lỗi màu thanh tiến độ — không khớp quy tắc đã có sẵn

Bản đầu của `KpiMetricBar` (3 thanh Lượt xem/Video/Follower trong card "KPI kỳ này") tô theo
**metric-tone** (blue/orange/purple) — cùng hệ màu CLAUDE.md/DESIGN_SYSTEM.md gọi là "màu theo chỉ
số, áp toàn app". Lý do lúc code: `/kpi` là trang chưa tồn tại lúc quy tắc đó viết ra (24/08/2026),
nên áp dụng "toàn app" sang trang mới nghe hợp lý.

Sai — phát hiện lúc đọc lại `docs/DESIGN_SYSTEM.md` mục "Màu theo chỉ số" để viết ghi chú cho phần
này, **không phải lúc code**: dòng "KHÔNG áp dụng cho: ... thanh tiến độ KPI" đã ghi rõ ràng từ
24/08/2026, dự đoán trước đúng tình huống này. Lý do gốc (đọc lại thấy hợp lý): thanh tiến độ KPI
thể hiện "có đang đúng tiến độ không" — thuộc hệ màu "chiều hướng" (🟢🟡🔴, giống `KpiHealthBadge`),
không phải hệ màu "nhận diện chỉ số nào". Đã tự sửa trước khi báo xong task, không đợi được nhắc:
`KpiMetricBar` đổi từ `tone` (metric-tone, cố định theo chỉ số) sang `health` (tính riêng từng thanh
qua `resolveStatus(pctCủaChỉTiêuĐó, elapsedPct)`, cùng vốn từ 🟢🟡🔴 dùng khắp nơi khác trong M5) —
mỗi thanh giờ tự so với tiến độ thời gian của chính nó, không còn 1 màu cố định cho "đây là Video".
Kiểm chứng lại bằng browser thật (kênh test có 3 chỉ tiêu cố tình lệch nhau: Video vượt xa → xanh lá,
Follower tụt xa → đỏ, Lượt xem chưa có số đo → xám) — đúng như thiết kế lại.

### Kiểm chứng

Toàn bộ CRUD (tạo/409 trùng ngày/400 thiếu follower/sửa/xoá) + cả 2 nơi hiện dữ liệu (`/kpi`,
card "KPI kỳ này", cột "Tiến độ KPI" ở `/channels`, `KpiSummaryCard`/`MyChannelsBlock` ở Tổng quan) +
nhánh Creator (tài khoản QA tạm, gán/gán-lại kênh thật "Mộc Đi Rừng") — kiểm chứng bằng phiên đăng
nhập thật qua Manager `andang`, trên dữ liệu production thật (9 kênh, không phải data giả). Toàn bộ
số tính tay đối chiếu khớp với UI (vd. `elapsedPct` ngày thứ 4/7 ngày = 57%, `remaining.text` =
90000/2 ngày = 45000/ngày, ví dụ formula follower 16.689→18.000 đạt 17.476 → 60%). Dọn sạch: xoá 2
cycle test + 1 tài khoản QA tạm + gán lại đúng Creator gốc, xác nhận lại bằng script trước khi coi là
xong. `npm run build && npm run lint && npm test` xanh (181 test, không phải chỉ `tsc --noEmit`).

## Cửa sổ chốt import: `− 3` → `− 1` (25/08/2026, theo yêu cầu) — có gì dùng được ngay

**Triệu chứng người dùng báo:** trang chi tiết kênh hôm 25/08 nhảy từ 25/08 (`tạm tính`, display_api)
thẳng về 21/08 (`đã đối chiếu`) — thủng 22, 23, 24 dù file Studio export cùng ngày đã có số đầy đủ
đến 23/08.

**Nguyên nhân:** `settledBeforeDate()` trả `ngàyImport − 3`, còn `plan-import.ts` bỏ qua mọi
`date >= settledBefore`. Ghép lại, ngày mới nhất ghi được là `ngàyImport − 4` — không phải `− 3` như
tên hàm gợi ý. Import ngày 25 → dừng ở 21.

Hai hệ quả, cái thứ hai nặng hơn cái người dùng thấy:
1. Mỗi lần import vứt đi 2 ngày mà file đã có số đầy đủ.
2. **Chu kỳ tuần T2→CN không bao giờ chốt sổ được.** Import thứ Tư (26/08) chỉ ghi tới 22/08 = thứ
   Bảy, thiếu đúng Chủ Nhật 23/08 → điều kiện "mọi ngày trong kỳ có `studio_import`" vĩnh viễn không
   thoả. `DATA_SOURCES.md` khẳng định ngược lại ("import thứ Tư thì cả 7 ngày đủ số") — doc sai so
   với code từ M3a, chỉ lộ ra khi M6 sắp làm.

**Đã sửa:** `settledBefore = ngàyImport − 1` → ghi tới `ngàyImport − 2`, đúng ngày cuối cùng Studio
có số. Import thứ Tư giờ ghi tới thứ Hai, dư 1 ngày so với Chủ Nhật.

**Bẫy phát hiện lúc sửa — quan trọng hơn bản thân con số.** Bỏ ngày an toàn theo lịch thì phải có gì
đó thay thế, và hoá ra "ngày dở dang toàn `undefined`" là **sai**: chạy parser trên fixture thật, dòng
17/08 của export 18/08 ra
`{videoViews: null, ..., totalViewers: null, newViewers: 0, returningViewers: 0}` — TikTok ghi `0`
thật cho New/Returning trong khi Total là `undefined`. Hai số 0 đó lọt qua `hasAnyValue` → ghi ra một
row `studio_import` gần như rỗng → vì `studio_import` xếp trên `display_api` trong `v_channel_daily`
(chọn theo DÒNG, `distinct on`, không phải theo cột) nên nó **che** số display_api đang đúng của ngày
đó. Nếu chỉ nới cửa sổ mà không xử lý, mỗi lần upload muộn (file export hôm trước, upload hôm sau) sẽ
âm thầm làm rỗng 1 ngày.
→ `lib/import/viewers.ts` bỏ cả cụm New/Returning khi `Total Viewers` là `null`. Lớp bảo vệ giờ dựa
vào **dữ liệu** (ngày chưa xong thì không có gì để ghi) chứ không dựa vào **lịch** (đoán TikTok trễ
mấy ngày).

**Chốt sổ vẫn giữ thứ Tư, không chuyển sang thứ Ba.** Thứ Ba đủ số (ghi tới đúng Chủ Nhật) nhưng chưa
qua cổng `periodEnd + 3 ngày`; muốn chốt thứ Ba phải hạ luôn cổng đó xuống `+ 2`, tức gỡ cả hai lớp an
toàn cùng lúc trên số dùng tính thưởng. Thứ Tư còn dư 1 ngày đệm nếu tuần nào TikTok trễ hơn thường lệ.

**Cần làm sau khi deploy:** import lại chính bộ zip đã upload hôm nay để lấp 22-23. Ngày 24 không
nguồn nào có (kênh mới reconnect 25/08 nên `display_api` chưa chạy ngày đó, còn Studio export ngày 25
chưa có số cho 24) — sẽ tự đầy ở kỳ import sau, từ 26/08 trở đi.

**Kiểm chứng:** `npx vitest run` — 182/182 xanh. Trong đó fixture thật khẳng định 17/08 **không** còn
được ghi, cộng 1 test tổng hợp chốt đúng luật mới (import 25/08 → ghi 21-22-23, bỏ 24-25).

## M6 — Chốt sổ KPI (Finalize) (26/08/2026) — có gì dùng được ngay

`POST /api/kpi-cycles/:id/finalize` + `/kpi/[id]/finalize` — khoá 1 chu kỳ KPI dựa trên
`data_snapshot` đã có sẵn, không nhận file. 3 gate ([API_SPEC.md](API_SPEC.md) mục finalize) kiểm
**cùng lúc**, không dừng ở gate đầu tiên fail: `lib/kpi.ts` `checkFinalizeReadiness` trả về
`reasons[]`/`missingDates[]`/`manualEntryDates[]`/`unlockAt` — route và Server Action
(`finalizeKpiCycleAction`) dùng chung hàm này nên 2 lối vào (REST cho ngoài, Action cho UI) không
lệch logic.

**Gate 2 và gate 3 đọc 2 nguồn khác nhau, dễ nhầm là trùng nhau:** gate 2
(`findNonStudioDates`) đọc `v_channel_daily` — ngày nào chưa RESOLVE ra `studio_import` (còn
`display_api`, hoặc không có row nào) thì tính là thiếu. Gate 3 (`fetchManualEntryDates`) đọc thẳng
bảng thô `data_snapshot`, lọc `source = manual_entry` — vì `run-import.ts` không xoá row
`manual_entry` cũ khi `studio_import` đến cùng ngày, chỉ thêm row mới xếp hạng cao hơn
(`source_rank()`, migration 0005). Một ngày có thể qua gate 2 (view đã resolve đúng
`studio_import`) mà vẫn dính gate 3 nếu con `manual_entry` chưa được dọn — CLAUDE.md nói rõ "không
cho chốt sổ chu kỳ còn chứa nó", tính đúng theo raw table chứ không theo view.

**Response thành công là `KpiCycleWithProgress` đầy đủ** (giống 1 phần tử `GET /api/kpi-cycles`),
không phải field `%Final` riêng — không có cột nào lưu percent lúc chốt, vì `data_snapshot` trong
khoảng ngày đó coi như bất biến ngay khi 3 gate đã pass (không nguồn nào tin cậy hơn `studio_import`
có thể ghi đè), nên `attachProgress()` tính lại bình thường luôn ra đúng số đã chốt.

**UI dùng 1 trang cho cả 2 trạng thái** thay vì trang riêng cho "chốt sổ" và "xem lịch sử": cùng
`/kpi/[id]/finalize`, `cycle.status` quyết định render checklist+nút hay bảng read-only có "Người
chốt"/thời điểm. `/kpi`'s list row đổi "Sửa" → "Chốt sổ" (draft) hoặc "Xem chốt sổ" (final).

**Bỏ qua bảng "Đạt/Gần đạt/Chưa đạt" theo từng chỉ tiêu ở `design/Finalize.dc.html`** — mock chỉ có
3 điểm dữ liệu minh hoạ (97%→Gần đạt, 100%→Đạt, 33%→Chưa đạt), không đủ để biết ranh giới
vàng/đỏ thật sự nằm ở đâu, và CLAUDE.md nói rõ không được đoán mò cách tính KPI. Dùng lại
`KpiHealthBadge` đã duyệt sẵn (±10% quanh 100% elapsed, vì chu kỳ đã kết thúc) cho "Kết quả chung",
mỗi chỉ tiêu chỉ hiện số thật tô màu theo *metric identity* như mọi nơi khác trong app.

**`finalizeUnlockAt` (gate 1) giữ nguyên `periodEnd + 3`, không rút xuống theo cửa sổ import mới
(`− 1`, xong hôm qua).** Bàn với người dùng trước khi code: thứ Ba đã đủ số (ghi tới đúng Chủ Nhật)
nhưng vẫn chưa qua gate 1 vì gate này cố tình giữ nguyên biên an toàn gốc — chốt sổ là thao tác
KHÔNG THỂ HOÀN TÁC và dùng tính thưởng, trong khi 1 import sai còn sửa được bằng cách import lại.
Quyết định: vẫn chốt vào thứ Tư, không chuyển sang thứ Ba.

**Migration lộ ra lúc làm:** `deleteChannel` (`lib/channels.ts`) có comment cũ nói *"`kpi_cycle` có 0
row (M5/M6 chưa xây)"* — sai từ khi M5 lên `main` hôm qua, đã xoá comment lỗi thời (logic chặn xoá
kênh có cycle final thì vẫn đúng và không đổi).

⚠️ **Phát hiện lúc làm, chưa sửa (xem [TASKS.md](TASKS.md) mục M6):** import Studio không kiểm tra
`kpi_cycle.status = final` trước khi ghi `data_snapshot` — một import muộn/sửa lại có thể ghi đè số
của ngày đã khoá vĩnh viễn mà không qua `audit_log` nào. Chưa từng xảy ra thật (chưa có cycle final
nào tồn tại trước hôm nay) nhưng phải chặn trước khi số final được dùng thật cho tính thưởng.

**Kiểm chứng bằng browser thật** (quy trình chuẩn, mục dưới đây): tài khoản QA Manager tạm
(`qa_m6_finalize`) trên kênh thật `nong.nghiep.xanh.17` (58 ngày `studio_import` liên tục,
25/06–21/08, xác nhận không có `manual_entry` nào lẫn vào bằng query trực tiếp trước khi dùng) —
- Tạo cycle 20/08→24/08 (cố tình chưa đủ điều kiện): checklist hiện đúng 2 ✗ (`too_early` vì
  27/08 > hôm nay 26/08; `missing_studio_data` liệt kê đúng 22, 23, 24/08) + 1 ✓, nút khoá bị disable.
- Sửa lại 10/08→16/08 (nằm trọn trong 58 ngày sạch): cả 3 ✓, tick xác nhận, bấm "Chốt sổ & khoá" →
  khoá thành công, trang tự chuyển sang read-only đúng như thiết kế, `audit_log` có đúng 1 dòng
  `action: "finalized"`.
- Gọi thẳng `POST /api/kpi-cycles/:id/finalize` (fetch từ console, đã đăng nhập) lên cycle vừa
  chốt → đúng `409` + message như đặc tả.
- Dọn sạch sau khi xong: xoá cycle test + đúng 2 dòng `audit_log` của riêng nó (xác nhận không đụng
  2 dòng `audit_log` cũ của Manager thật, actor `thaiduytien`, không liên quan) + xoá tài khoản QA.

`npx vitest run` — 190/190 xanh (+8 test cho `finalizeUnlockAt`/`findNonStudioDates`).
`npm run build` (buộc phải chạy — xem "Bẫy Next.js typegen" dưới đây) + `npx tsc --noEmit` +
`npm run lint` đều sạch.

🐞 **Bẫy Next.js 16 Turbopack dev, không phải bug của code:** thêm route/page file mới
(`app/api/.../finalize/route.ts`, `app/.../[id]/finalize/page.tsx`) rồi chạy `next dev` — dev server
chạy đúng, cả 2 route hoạt động thật (verify bằng browser ở trên đã chứng minh), nhưng
`.next/types/routes.d.ts` (dùng bởi `RouteContext<...>` khi gõ `tsc --noEmit`) **không tự cập nhật**
dù đã restart dev server và tự gọi cả 2 route qua request thật. Chỉ hết khi chạy `npm run build` một
lần (build luôn quét lại toàn bộ cây route). Gặp lại tình huống này (thêm route mới, `tsc` báo
`AppRouteHandlerRoutes` không nhận literal route) thì chạy `npm run build` trước khi kết luận có lỗi
type thật — đừng sửa code theo hướng khác.

## `/kpi` đổi thành danh sách KÊNH thay vì danh sách CHU KỲ (26/08/2026, theo yêu cầu) — có gì dùng được ngay

**Trước:** 3 nhóm theo trạng thái thời gian (Đang chạy/Sắp tới/Đã qua), mỗi dòng là 1 CHU KỲ — 1 kênh
có thể xuất hiện ở nhiều nhóm khác nhau hoặc không xuất hiện chỗ nào nếu chưa từng đặt KPI. **Sau:**
mỗi KÊNH đúng 1 khối, luôn hiện dù chưa từng có KPI — đúng tinh thần CLAUDE.md "dữ liệu kênh trước,
KPI sau, đừng lấy % KPI làm trục sắp xếp mặc định". Không sắp lại theo %/trạng thái, giữ nguyên thứ
tự `listChannels()` (theo tên).

**Lý do đổi (từ hội thoại thật với người dùng):** test thử 1 cycle, thấy Lượt xem/Follower trống
trơn không rõ vì sao (hoá ra kênh đó chưa từng có `data_snapshot` — số liệu thật, không phải bug), lúc
giải thích xong thì người dùng nhận xét thẳng "ở trang KPI là danh sách các KPI thay vì các kênh" —
tức đúng cái lệch nói ở CLAUDE.md dòng đầu tiên của file, chỉ là chưa ai áp dụng vào `/kpi` khi xây
M5. Hỏi lại 1 câu trắc nghiệm (mỗi kênh 1 dòng, hay giữ danh sách chu kỳ nhưng nhóm theo kênh) —
chọn phương án đầu.

**Không viết lại từ đầu — dùng lại nguyên `KpiCard`** (component đã có sẵn ở trang chi tiết kênh từ
M5: active cycle + cảnh báo `dataGaps` + "Các kỳ trước"), chỉ thêm 1 prop `header` (avatar/tên/handle)
để dùng được trong ngữ cảnh liệt kê nhiều kênh. Nhờ vậy 2 thứ tự nhiên có kèm miễn phí, không phải
code thêm:
- Cảnh báo "Thiếu số liệu đáng tin cậy N ngày" — vốn CHỈ có ở trang chi tiết kênh, `/kpi` bản cũ
  không có, đúng thứ đã gây khó hiểu ở trên.
- Mỗi kênh chưa từng đặt KPI vẫn hiện, kèm "+ Đặt KPI cho kênh này" — trước đây kênh không có cycle
  nào thì biến mất khỏi `/kpi` hoàn toàn.

**Bẫy suýt bỏ sót:** `KpiCard`'s "Các kỳ trước" trước giờ **không có action nào** (chỉ hiện badge) —
vì trang chi tiết kênh không cần, có "Sửa chu kỳ này →" riêng cho active cycle rồi. Nhưng khi
`/kpi` (bản cũ) bị xoá, đó là nơi DUY NHẤT còn giữ nút Chốt sổ cho 1 draft cycle đã cũ (kịch bản
đúng cái vừa test ở trên: cycle đã qua `periodEnd`, vẫn `draft`, cần chốt). Nếu không thêm action vào
"Các kỳ trước", nút Chốt sổ sẽ biến mất hẳn ngay khi cycle đó bị 1 cycle mới hơn thế chỗ "active" —
mất tính năng vừa xây xong ở M6. Sửa bằng cách tách phần Sửa/Chốt sổ/Xem chốt sổ/Xoá ra component
riêng `kpi-cycle-actions.tsx` (nguyên là code cũ của `KpiRow`), dùng lại cho cả active cycle lẫn từng
dòng "Các kỳ trước" — Manager-only ở cả hai chỗ, Creator giữ nguyên chỉ thấy badge như trước giờ.

**Xoá hẳn `kpi-row.tsx`** — sau khi `/kpi/page.tsx` không còn gọi nó, không còn nơi nào dùng
(`KPI_METRIC_ROWS`/`kpiActualFor`/`kpiPctFor` nó từng có đã chuyển sang `kpi-widgets.tsx` từ lúc làm
M6 rồi, không mất gì).

**Kiểm chứng:** tài khoản QA Manager tạm, browser thật — cả 9 kênh đều hiện đúng 1 khối (8 kênh
"Chưa có KPI" + CTA, 1 kênh có cycle thật do chính người dùng tạo lúc tự test), bấm "Chốt sổ" từ
"Các kỳ trước" của kênh đó vẫn dẫn đúng `/kpi/[id]/finalize` và hiện đúng checklist. Xoá QA account
sau khi xong — xác nhận cycle thật của người dùng (`Bơ Trồng Gì Đấy? 17-23/08`) không hề bị đụng tới.
`npx tsc --noEmit` + `npm run lint` + `npx vitest run` (187 test) đều sạch.

### Vòng chỉnh tiếp theo cùng ngày, sau khi người dùng tự kiểm thử trực tiếp trên `main` local

Tất cả phát hiện được nhờ người dùng tự bấm thử trên dữ liệu thật, không phải tự tôi rà lại:

- **Ô "Chưa có KPI" mỗi kênh từng là 1 thẻ cao căn giữa, lặp lại 9 lần trông rất nặng** ("trông khá
  xấu") — gộp lại thành 1 dòng gọn: avatar/tên/handle trái, "Chưa có KPI · + Đặt KPI" phải. Chỉ áp
  dụng khi `header` được truyền (ngữ cảnh liệt kê nhiều kênh) — thẻ trên `/channels/[id]` (chỉ 1 card
  trên cả trang) giữ nguyên dạng đầy đủ, căn giữa như cũ.
- **Tab "Theo tuần" ở form tạo KPI để trắng 2 ô ngày** dù đã chọn sẵn "Theo tuần" — tự động điền tuần
  đang diễn ra (Thứ Hai → Chủ Nhật chứa hôm nay) ngay khi mở form, không bắt người dùng phải bấm vào ô
  "Từ ngày" trước mới thấy tuần tự tính. `lib/kpi.ts`'s `mondayOf`/`addDaysToDateString` dùng lại y
  nguyên, chỉ đổi thời điểm gọi (lúc khởi tạo `useState`, không phải chỉ lúc `onChange`).
- **Ô "Tuỳ chỉnh" của bộ lọc ngày (`/`, `/channels`) hiện `01/01/2020`** khi bộ lọc đang ở mặc định
  "Toàn bộ thời gian" — đó là sentinel `ALL_TIME_FROM` (lib/time.ts, cố tình chọn cực xa để không bao
  giờ cần sửa lại) bị lộ ra UI như một ngày thật. Để trống ô "Từ ngày" (hiện placeholder) thay vì hiện
  sentinel; "Đến ngày" giữ nguyên vì luôn là hôm nay, không có gì sai. **Không đổi** giá trị hằng số —
  chỉ sửa chỗ hiển thị. Mốc thật hệ thống bắt đầu 07/2026 (người dùng xác nhận, ghi vào bộ nhớ
  Claude, không phải vào code vì không có ý nghĩa vận hành nào cần dùng tới).
- **"Chốt sổ" bị coi là lòng vòng thừa** — "ở giao diện KPI đã có thể check các chỉ số rồi. Nên khi
  click chốt sổ là có thể chốt luôn". Bỏ yêu cầu bắt buộc phải qua `/kpi/[id]/finalize` mới chốt được:
  bấm "Chốt sổ" giờ mở hộp xác nhận **tại chỗ** (cùng vị trí, cùng kiểu tương tác với "Xoá") — tick
  xác nhận, bấm "Chốt sổ & khoá", `finalizeKpiCycleAction` chạy y nguyên 3 gate cũ, sai thì hiện lý do
  ngay trong hộp (không cần rời trang mới biết thiếu gì). Trang `/kpi/[id]/finalize` **không xoá** —
  đổi thành đích của link **"Xem chi tiết"** mới (Manager, cạnh Chốt sổ) cho ai muốn xem bảng đối
  chiếu đầy đủ trước khi quyết, và vẫn là nơi duy nhất xem chu kỳ **đã** chốt ("Xem chốt sổ"). Route
  `POST /api/kpi-cycles/:id/finalize` không đổi gì — cả trang lẫn nút tại chỗ đều gọi chung 1 action.

## Bug màu link: `a {}` viết trần đè cả `text-ink-2`/`text-ink-3` (26/08/2026) — có gì dùng được ngay

Phát hiện khi vừa thêm link "Xem chi tiết" (`text-ink-3`, xám) ở trên nhưng hiện ra **đỏ** — người
dùng chỉ đúng "trang này vẫn còn lỗi màu" dù tự tôi soi code lúc đầu không thấy gì sai (class truyền
vào đúng, chỉ là **class đó chưa từng có tác dụng**).

**Nguyên nhân:** `app/globals.css` có `a { color: var(--color-red); }` viết **trần, không nằm trong
`@layer` nào**. Theo CSS Cascade Layers: luật ngoài layer luôn thắng luật trong layer, bất kể độ cụ
thể hay thứ tự viết trong file — mà Tailwind v4 (`@import "tailwindcss"`) phát toàn bộ class tiện ích
(`text-ink-2`, `text-ink-3`, kể cả `text-red`) vào `@layer utilities`. Nên **mọi `<Link>` cố đặt màu
khác đỏ đều bị ép về đỏ**, âm thầm — `<button>` không dính vì không có luật `button {}` tương tự.
`text-red` "trông đúng" trên các link khác (Sửa, tên kênh...) chỉ vì trùng màu với luật trần, không
phải vì class đó thắng.

**Ảnh hưởng thật, không chỉ 1 chỗ:** rà theo pattern `<Link ...text-ink-2|text-ink-3>` ra ít nhất 2
chỗ khác cũng dính — "Xem chốt sổ" (chu kỳ đã chốt, cùng file) và "Đổi kênh khác"
(`kpi-cycle-form.tsx`, có từ trước M6) — 17 file trong repo có pattern này, chưa rà hết từng cái, chỉ
xác nhận cơ chế sẽ tự hết khi sửa gốc.

**Đã sửa:** bọc luật đó vào `@layer base` — 1 chỗ, hết bug ở toàn bộ pattern này cùng lúc, không phải
sửa từng nơi dùng `<Link>`. Kiểm chứng bằng cách đọc thẳng `getComputedStyle(...).color` trước/sau
(không đoán bằng mắt): "Xem chi tiết" từ `rgb(254,44,85)` (đỏ, sai) → `rgb(134,135,139)` (xám, đúng,
khớp "Xoá"); "Sửa" vẫn `rgb(254,44,85)` (đỏ, đúng — không đổi); nav-bar + `/channels` chụp lại không
thấy tác dụng phụ. Thay đổi thuần CSS, không đụng logic nên không chạy lại `vitest`.

**Quy ước mới để không lặp lại** — xem [CLAUDE.md](../CLAUDE.md) mục "Quy ước code": mọi CSS chọn
theo thẻ HTML trần trong `globals.css` phải nằm trong `@layer base`.

## Quy trình kiểm chứng bằng browser thật (dùng lại mỗi milestone có UI)

Từ M2 trở đi, mọi milestone có UI đều kiểm chứng bằng cách tạo **tài khoản QA tạm qua service role**
(script tự `process.loadEnvFile(".env.local")`, không đọc file này bằng tay), đăng nhập thật qua
trình duyệt, click qua các màn, rồi **xoá tài khoản QA + revert mọi dữ liệu test đã tạo** trước khi
báo xong — không để lại dấu vết trong DB thật. Khi cần đổi Creator của 1 kênh thật để kiểm chứng nhánh
Creator, gán tạm rồi **gán lại đúng Creator cũ** sau khi xong, không chỉ gỡ về `null`.
