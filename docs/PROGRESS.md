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

## Quy trình kiểm chứng bằng browser thật (dùng lại mỗi milestone có UI)

Từ M2 trở đi, mọi milestone có UI đều kiểm chứng bằng cách tạo **tài khoản QA tạm qua service role**
(script tự `process.loadEnvFile(".env.local")`, không đọc file này bằng tay), đăng nhập thật qua
trình duyệt, click qua các màn, rồi **xoá tài khoản QA + revert mọi dữ liệu test đã tạo** trước khi
báo xong — không để lại dấu vết trong DB thật. Khi cần đổi Creator của 1 kênh thật để kiểm chứng nhánh
Creator, gán tạm rồi **gán lại đúng Creator cũ** sau khi xong, không chỉ gỡ về `null`.
