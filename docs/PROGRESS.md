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

## Quy trình kiểm chứng bằng browser thật (dùng lại mỗi milestone có UI)

Từ M2 trở đi, mọi milestone có UI đều kiểm chứng bằng cách tạo **tài khoản QA tạm qua service role**
(script tự `process.loadEnvFile(".env.local")`, không đọc file này bằng tay), đăng nhập thật qua
trình duyệt, click qua các màn, rồi **xoá tài khoản QA + revert mọi dữ liệu test đã tạo** trước khi
báo xong — không để lại dấu vết trong DB thật. Khi cần đổi Creator của 1 kênh thật để kiểm chứng nhánh
Creator, gán tạm rồi **gán lại đúng Creator cũ** sau khi xong, không chỉ gỡ về `null`.
