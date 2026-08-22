# Task Breakdown

Chia theo module. Mỗi task đủ nhỏ để hoàn thành trong 1 phiên vibe coding.
Đánh dấu `[x]` khi xong. Task có 🔒 = bị chặn bởi việc bên ngoài (TikTok duyệt Business API).

---

## M0 — Khởi tạo dự án

- [ ] 🔬 **Kiểm chứng Display API trước tiên** — tạo Developer app + sandbox, OAuth 1 kênh thật.
      (6/7 mục con xong — còn phép đo gốc "view trong ngày", xem dòng cuối)
      **Kiểm chứng 20/08/2026, 3 tài khoản: test `kidshoppppala`, kênh thật `vuonvuonvang` và
      `nong.nghiep.xanh.17`:**
      - [x] Sandbox gọi được `user.info.stats` + `video.list` — cả 3 scope xin đều được cấp, đúng cho
            cả 3 tài khoản (kênh thật: 43 video/5821 follower và 29 video/1121 follower)
      - [x] `video/list` trả thẳng `view_count`/`like_count`/`comment_count`/`share_count` qua `fields`
            — **không cần** bước `video/query` bổ sung như dự phòng ban đầu
      - [x] `video_count` khớp số video `video/list` trả về — **khớp trên 2/3 tài khoản** (test 24=24,
            `nong.nghiep.xanh.17` 29=29), **lệch 1 trên `vuonvuonvang`** (43 vs 42) dù phân trang đã
            chạy hết. Vì 2 kênh khác khớp hoàn toàn nên nhiều khả năng là đặc thù riêng của kênh đó
            (1 video riêng tư), không phải lỗi hệ thống. Vẫn nên đo lại `vuonvuonvang` ngày khác để
            xác nhận độ lệch cố định — xem [DISPLAY_API.md](DISPLAY_API.md) mục 1
      - [x] Phân trang chạy đúng, dừng khi `has_more = false` trên cả 3 tài khoản
      - [x] Đối chiếu cấp độ từng video với CSV Studio thật:
            `kidshoppppala` (cùng ngày 20/08) **15/15 khớp tuyệt đối** ·
            `nong.nghiep.xanh.17` (Studio 18/08 vs API 20/08, cách 2 ngày) **15/15 tăng hợp lý, không
            video nào giảm** — xem [DISPLAY_API.md](DISPLAY_API.md) mục #5
      - [x] `video/list` vs `video/query`: `vuonvuonvang` 3/42 lệch 1 view (bình thường, view mới phát
            sinh giữa 2 lệnh gọi) · `nong.nghiep.xanh.17` **0/29 lệch**, khớp hoàn toàn — xem
            [DISPLAY_API.md](DISPLAY_API.md) mục 1b
      - [ ] Phép đo gốc "view trong ngày" (delta 2 snapshot 24h) so với `Overview.csv` theo ngày —
            **chưa làm, việc cuối cùng còn lại của M0**. Token `nong.nghiep.xanh.17` đã lưu bền dưới
            `--as nong.nghiep.xanh.17` (không cần login lại) — mai (21/08) chạy
            `node probe.mjs probe --as nong.nghiep.xanh.17` rồi `diff` với snapshot d1 đã có, so kết
            quả với `Overview.csv` (nhớ Studio trễ 2-3 ngày). Không cần thêm `vuonvuonvang` — 1 kênh
            thật là đủ kết luận, kênh kia OAuth lại lúc M1 xong (quyết định 20/08: gộp OAuth 8 kênh vào
            1 lượt khi có DB để lưu, không login rời rạc trước)
      - [x] `refresh_token` có xoay vòng — **kiểm chứng 20/08: lần đầu KHÔNG đổi**, nhưng code vẫn phải
            ghi đè mỗi lần refresh (TikTok không cam kết ổn định) — xem [DISPLAY_API.md](DISPLAY_API.md)
      Script dùng: [`tools/m0-display-api-probe/`](../tools/m0-display-api-probe/README.md) — hỗ trợ
      `auth --callback <url>` để chạy không cần nhập tương tác (dùng khi thao tác qua trình duyệt tự động).
      **Kết luận: giả định kiến trúc lớn nhất đứng vững**, đi tiếp M1 song song với việc đo #5.
- [x] Sau khi có kết quả: bỏ dấu 🔬 trong [DISPLAY_API.md](DISPLAY_API.md) (đã làm — trừ câu #5)
- [x] Init Next.js (App Router, TypeScript, Tailwind) — xong 19/08/2026, dùng App Router + Tailwind v4
- [x] Tạo Supabase project, lấy connection string + anon/service key — xong 20/08/2026,
      project `ftdfmclxkjmrfikdipnt`, region Tokyo (ap-northeast-1)
- [x] `.env.example` + `.env.local` (không commit key thật)
- [x] Kết nối Supabase client (server + browser helper) — `lib/supabase/{server,client,admin}.ts`
- [x] Deploy skeleton lên Vercel, xác nhận build pass — `https://ahd-dashboard-dusky.vercel.app`,
      kèm `/terms` + `/privacy` (phục vụ luôn yêu cầu URL của TikTok app)

## M1 — Database & Auth

- [x] Migration: `manager`, `creator`, `channel`, `channel_ownership_history` — `20260820000001_identity.sql`.
      **`manager.id` / `creator.id` = `auth.users.id`**, không nối qua email (quyết định 20/08)
- [x] Migration: `data_snapshot`, `video_snapshot`, `content_video`, `follower_activity`, `audience_snapshot`
      — `20260820000002_data.sql`
- [x] Migration: `channel_oauth` — `20260820000003_channel_oauth.sql`. **Không dùng Supabase Vault**:
      pgsodium TCE đã bị deprecate → mã hoá AES-256-GCM ở tầng app (`lib/crypto/token.ts`,
      env `TOKEN_ENCRYPTION_KEY`). Xem [DATABASE_ERD.md](DATABASE_ERD.md) mục Bảo mật token
- [x] Migration: `kpi_cycle`, `audit_log` — `20260820000004_kpi_audit.sql`
- [x] Ràng buộc + index đầy đủ theo [DATABASE_ERD.md](DATABASE_ERD.md). Chống trùng kỳ KPI bằng
      `EXCLUDE USING gist` (cần `btree_gist`) → M5 chỉ cần bắt lỗi `23P01` trả 409
- [x] **Hàm/view chọn nguồn ưu tiên** cho `(channel_id, date)` — view `v_channel_daily` +
      hàm `source_rank()`, `20260820000005_source_resolver.sql`. Tạo với `security_invoker = on`
      (thiếu cờ này view chạy quyền owner và hở dữ liệu qua RLS)
- [x] RLS policy: Manager toàn quyền, Creator read-only — `20260820000006_rls.sql`.
      `channel_oauth` bật RLS + **0 policy** → không vai trò đăng nhập nào đọc được, kể cả Manager
- [x] Trang đăng nhập email/password (Supabase Auth) — `app/login/`, dựng theo `design/Login.dc.html`
- [x] Middleware bảo vệ route + phân biệt vai trò Manager/Creator — **`proxy.ts`, không phải
      `middleware.ts`** (Next 16 đổi tên convention, tên cũ vẫn chạy nhưng build cảnh báo deprecated).
      Vai trò resolve ở `lib/auth.ts`, không đặt trong proxy vì cần truy vấn DB
- [x] Seed 2 kênh thật đã có data (`nong.nghiep.xanh.17`, `vuonvuonvang`) — `npm run seed`, đã chạy
      20/08. Hai kênh **chưa gán Creator** (chưa có tài khoản Creator thật, gán qua UI ở M2).
      Seed đủ 8 kênh kèm Creator: điền `data/samples/channels_seed.csv` rồi chạy lại

**Kiểm chứng M1 (20/08/2026)** — schema chạy trên Postgres 17 thật trước khi đụng vào project:
`./scripts/dryrun/run.sh` áp cả 6 migration lên container tạm rồi chạy 9 assertion (thứ tự nguồn,
trùng kỳ KPI, 1 row sở hữu đang mở, RLS 2 vai trò). Đã thử đảo ngược 1 assertion để xác nhận bộ test
fail được thật, không pass rỗng. Trên DB thật: 11/11 kiểm tra pass — resolver trả đúng
`studio_import`, Creator đọc được kênh nhưng update trả 0 row, insert `data_snapshot` bị RLS chặn,
`channel_oauth` rỗng với cả Manager, `audit_log` không update được. Đăng nhập → thấy đúng vai trò →
đăng xuất chạy đúng trên trình duyệt.

## M2 — Quản lý kênh & Creator (Manager) — xong 20/08/2026

- [x] `GET/POST /api/channels`, `PATCH /api/channels/:id`
- [x] Đổi Creator → tự động đóng/mở row `channel_ownership_history` — làm bằng **trigger DB**
      (`20260820000007_ownership_trigger.sql`), không phải logic ở route handler. Route chỉ cần
      `UPDATE channel SET current_creator_id = ...`. Chi tiết: [DATABASE_ERD.md](DATABASE_ERD.md)
- [x] `GET/POST /api/creators` (tạo tài khoản Creator)
- [x] `PATCH /api/creators/:id` — ngoài phạm vi liệt kê ban đầu, thêm để Manager vô hiệu hoá Creator
      nghỉ việc (không xoá tài khoản). Xem [API_SPEC.md](API_SPEC.md)
- [x] UI: danh sách kênh + form thêm/sửa kênh — `app/(app)/channels/`
- [x] UI: danh sách Creator + form tạo tài khoản — `app/(app)/creators/`, Manager-only

**Kiểm chứng 20/08/2026:** `./scripts/dryrun/run.sh` xanh (thêm 4 assertion cho trigger ownership) →
`npx supabase db push`. `npm run build` + `npm run lint` + `npm test` pass. Kiểm chứng trực tiếp trên
DB thật qua UI: tạo 1 Creator test → gán vào `@vuonvuonvang` → xác nhận `channel_ownership_history` có
đúng 1 row mở, `creator_id` khớp (script service-role đọc trực tiếp) → gỡ gán → vô hiệu hoá tài khoản
test. Không kiểm chứng được luồng Creator bị 403 qua UI thật (cần mật khẩu đăng nhập, không tự làm) —
đã phủ bằng assertion RLS ở M1 (Creator update `channel` trả 0 row).

Cột số liệu (follower/view/sparkline/tiến độ KPI) trong `design/Channels.dc.html` **chưa làm** — để
M4, vì `data_snapshot` chưa có dữ liệu thật cho tới M3.

## M3 — Data Pipeline

Hai tầng theo [DATA_SOURCES.md](DATA_SOURCES.md). Làm tầng import trước (đã có 60 ngày data thật để
test ngay), tầng API sau khi M0 kiểm chứng xong.

**3a — Import Studio (nguồn chốt sổ, chạy thứ Tư cho tuần trước) — xong 20/08/2026**
- [x] Parser theo [CSV_FORMAT.md](CSV_FORMAT.md): strip BOM, parse ngày VN/EN không năm, `"undefined"` → `null`
      — `lib/import/csv.ts`, `lib/import/date.ts`
- [x] **Không parse ngày từ tên file zip Overview** — dùng `nowVnDateString()` (`lib/time.ts`) tại thời
      điểm route handler chạy làm `ngàyExport`
- [x] **Bỏ cột `Difference in followers from previous day`** — `lib/import/follower-history.ts` không đọc cột này
- [x] Nhận `.zip` trực tiếp (Overview/Followers/Viewers/Content), tự nhận diện file bên trong theo tên
      — `lib/import/zip.ts`, đọc theo tên CSV bên trong chứ không theo tên zip ngoài
- [x] `POST /api/channels/:id/import` — upsert `data_snapshot` (`source = studio_import`). Thêm
      `?dryRun=true` (không có trong đặc tả gốc, đã bàn với Manager) — xem [API_SPEC.md](API_SPEC.md)
- [x] **Cửa sổ chốt:** chỉ ghi đè ngày `< ngàyExport − 3`; ngày mới hơn giữ nguyên `display_api` —
      `lib/import/settle-window.ts` + `lib/import/plan-import.ts`. **Chỉ áp cho `data_snapshot`**, xem
      [DATABASE_ERD.md](DATABASE_ERD.md) lý do 3 bảng còn lại luôn ghi toàn bộ
- [x] Không ghi đè số thật bằng `undefined`/`null` — merge với row `studio_import` cũ trước khi upsert
- [x] Cảnh báo khi lệch >10% so với `display_api` cùng ngày — vẫn lấy Studio nhưng gắn cờ
- [x] Ghi `content_video` — dedup theo `videoLink` (chỉ phục vụ thư viện top video, **không** dùng đếm video)
- [x] Parse `FollowerActivity.csv` → bảng `follower_activity` (⚠️ chỉ 7 ngày/lần export, bỏ tuần là mất —
      xác nhận: ghi toàn bộ, không qua cửa sổ chốt, để không mất dữ liệu)
- [x] Parse `FollowerGender.csv` + `FollowerTopTerritories.csv` → `audience_snapshot` mỗi lần import
- [x] Lưu zip gốc vào Supabase Storage → `raw_file_ref` (bucket `studio-imports`,
      `20260820000008_studio_import_storage.sql`)
- [x] Test bằng data thật ở `data/` (2 kênh, 60 ngày) trước khi coi phần này xong —
      `lib/import/plan-import.test.ts` (parse+plan thuần, không cần DB) + chạy thật `runStudioImport`
      1 lần trên DB thật cho cả 2 kênh (script tạm, đã xoá) → cả 2 kênh giờ có đủ 60 ngày
      `data_snapshot`, 168 dòng `follower_activity`, `audience_snapshot`, 15 `content_video` — số khớp
      chính xác với data thật trong `data/`
- [x] UI: màn import — chọn kênh, kéo-thả file, xem kết quả parse + ngày nào bị bỏ qua do cửa sổ chốt
      — `app/(app)/import/`. Không kiểm chứng được thao tác kéo-thả file thật qua UI tự động (trình
      duyệt chặn set giá trị `<input type="file">` bằng script) — đã xác nhận UI render đúng qua
      screenshot, và toàn bộ pipeline phía sau qua chạy thật ở trên

**3c — Nhập tay dự phòng — xong 21/08/2026 (làm sớm hơn dự kiến, theo yêu cầu khi vừa xong M4)**
- [x] `POST /api/channels/:id/manual-entry` — **chỉ Manager**, ghi `source = manual_entry` + `audit_log`
- [x] Resolver chọn nguồn theo thứ tự ưu tiên → `manual_entry` tự bị thay khi `studio_import` về
- [x] UI: hiển thị số `manual_entry` khác biệt rõ (nhãn "chưa xác thực")

`lib/manual-entry.ts` (`createManualEntry`) là hàm dùng chung cho cả route handler
(`app/api/channels/:id/manual-entry/route.ts`) và Server Action UI
(`app/(app)/channels/[id]/actions.ts` → `manual-entry-form.tsx`, nút "+ Nhập tay" Manager-only trên
Chi tiết kênh, ngay trên bảng "Số liệu đã lưu theo ngày"). 3 trường `videoViews`/`followers`/
`videoCount` đều optional nhưng bắt buộc có ít nhất 1 — không có trường "lý do", cố tình hẹp đúng như
docs/DATA_SOURCES.md mô tả ("miếng vá tạm", không phải màn nhập liệu thoải mái). Không cần logic
"nhường chỗ" cho `studio_import` — `source_rank()` đã lo, chỉ set cột nào Manager thực sự nhập (upsert
bỏ qua cột vắng mặt thay vì ghi `null` đè).

**Kiểm chứng 21/08/2026 trên DB thật** (không phải fake/dry-run): tạo qua UI thật 1 manual_entry cho
ngày chưa có số nào (kênh hiện lên đúng với nhãn "chưa xác thực", stat/trend cập nhật đúng) và 1
manual_entry cho ngày **đã có `studio_import`** — xác nhận UI vẫn hiển thị số Studio gốc, không bị
đè, đúng thứ tự ưu tiên. Xác nhận `audit_log` có đúng 1 row mỗi lần, `actor` = uuid Manager, `note` mô
tả đủ số đã nhập. Sau khi xác nhận, xoá cả 2 row test (`data_snapshot` + `audit_log` liên quan) bằng
script service-role tạm — không để lại dữ liệu QA trong DB thật. `audit_log` bình thường append-only
(RLS không cho Manager sửa/xoá), xoá lần này chỉ vì đây là dữ liệu QA tự tạo trong phiên, không phải
thao tác nghiệp vụ thật.

**3b — Display API hằng ngày (số tạm tính) — code xong 20/08/2026, chờ bạn OAuth thật để kiểm chứng
cuối** — xem [DISPLAY_API.md](DISPLAY_API.md)
- [x] Luồng OAuth từng kênh, xin scope `user.info.stats` + `video.list` (khai báo tường minh) —
      `GET /api/channels/:id/oauth/start` + `GET /api/oauth/callback`, CSRF qua cookie httpOnly
      (`lib/tiktok/oauth.ts`), không thêm bảng DB. **M/C** — sau khi bàn với bạn, mở cho Creator tự
      Authorize **đúng kênh mình phụ trách** (403 nếu gọi cho kênh khác), không chỉ Manager — Creator
      có sẵn tài khoản TikTok của chính kênh. Vẫn phải add Target Users trên developer portal trước,
      không ai né được bước đó. Cập nhật [USER_FLOW.md](USER_FLOW.md), [API_SPEC.md](API_SPEC.md)
- [x] **Đối chiếu tài khoản TikTok vừa Authorize với kênh** — TikTok chỉ biết "tài khoản đang đăng
      nhập", không biết "kênh nào" phía app; lỡ đăng nhập nhầm tài khoản lúc bấm Kết nối sẽ ghi số sai
      vào đúng kênh, âm thầm không báo lỗi. `app/api/oauth/callback/route.ts` so `share_url` của 1
      video với `channel.tiktok_handle`, lệch thì chặn hẳn — xem [DISPLAY_API.md](DISPLAY_API.md)
      mục 9. Test thuần: `lib/tiktok/verify-account.test.ts`
- [x] Lưu token: **ghi đè `refresh_token` mới mỗi lần refresh** — `lib/tiktok/sync.ts` luôn ghi đè cả
      2 token dù giống hay khác
- [x] Màn hình theo dõi hạn token 8 kênh, cảnh báo trước ≥30 ngày — `/connections`
      (`app/(app)/connections/`), sub-tab chung với `/import` qua `app/(app)/data-tabs.tsx`
- [x] `TikTokDataProvider` (interface, CLAUDE.md) + `DisplayApiProvider` — `user/info` + `video/list`
      phân trang tới `has_more=false` (20/trang) — `lib/tiktok/provider.ts` + `display-api-provider.ts`,
      port trực tiếp từ `tools/m0-display-api-probe/probe.mjs` đã chạy thật
- [x] Nếu `video/list` không trả `view_count` → fallback `video/query` theo lô 20 id — đã code dù M0
      xác nhận chưa cần trong điều kiện hiện tại
- [x] Ghi `video_snapshot` mỗi ngày cho từng video
- [x] Tính view trong ngày = Σ chênh lệch **theo từng video**; video biến mất thì bỏ qua, không trừ —
      `lib/tiktok/video-delta.ts`, port từ `diffSnapshots()` đã kiểm chứng trong `probe.mjs`
- [x] Đặt `isComplete = false` khi số video lấy được ≠ `video_count` — **giữ nguyên phép kiểm gốc**,
      chưa đổi riêng cho `vuonvuonvang` (chưa đo lại xác nhận lệch cố định) — xem ghi chú mới trong
      [DISPLAY_API.md](DISPLAY_API.md) mục 1
- [x] Xử lý HTTP 429 `rate_limit_exceeded` — dừng phân trang, đánh dấu `isComplete=false`
      (`rateLimited`), không crash cả batch
- [x] Cron chạy hằng ngày (Vercel Cron) — `vercel.json`, `0 20 * * *` UTC = 03:00 giờ VN.
      **`GET /api/sync/display-api`**, không phải `POST` — Vercel Cron luôn gửi GET, đã sửa
      [API_SPEC.md](API_SPEC.md)
- [x] Unit test cho hàm tính delta: video mới, video bị xoá, response bị cắt ngắn —
      `lib/tiktok/video-delta.test.ts`, đủ 6 case kể cả kênh không có video nào

**Review 20/08/2026 (sau khi code M3b xong) — tìm ra 2 lỗi P1 tự chấm code cũ, đã sửa hết,
kiểm chứng lại trên DB thật bằng fake provider (không cần token TikTok thật) — xem
[DISPLAY_API.md](DISPLAY_API.md) mục 10-11:**
- [x] Lần sync đầu tiên (bootstrap) từng ghi tổng view luỹ kế trọn đời thành view/ngày — sai ~10 lần.
      Sửa: `video_views = null` khi chưa có baseline
- [x] Cron 03:00 giờ VN từng gán nhầm ngày (lệch 1 ngày so với ngày thực đo). Sửa: `date` suy từ
      `channel_oauth.last_sync_at`, không suy từ giờ chạy — hàm thuần `determineSyncDate()`
- [x] Đối chiếu tài khoản (mục OAuth ở trên) hạ từ "chặn hẳn" xuống "cảnh báo" — `share_url` cũng
      chưa được M0 xác nhận ổn định, không nên để 1 tín hiệu chưa chắc chặn hẳn kết nối hợp lệ
- [x] `content_video` upsert đồng bộ `onConflict` giữa M3a (`lib/import/run-import.ts`) và M3b
      (`lib/tiktok/sync.ts`) — cùng dùng `tiktok_video_id`, tránh crash `23505` nếu 2 nguồn cho
      `video_link` khác nhau cho cùng 1 video
- [x] Callback OAuth đổi từ gọi `listAllVideos()` (tới 60 trang, rủi ro timeout route) sang
      `peekFirstVideoLink()` — 1 lệnh gọi nhẹ, chỉ lấy 1 video để đối chiếu tài khoản
- [x] `disappearedVideoIds` từng luôn rỗng do chỉ tra cứu video *hôm nay* — sửa: tra cứu theo
      `channel_id` (toàn bộ video từng biết), không chỉ video lấy được hôm nay
- [x] `Promise.all([getUserInfo, listAllVideos])` đổi thành tuần tự — tránh unhandled rejection khi
      1 trong 2 lỗi trước

- [x] `GET /api/channels/:id/snapshots` — sửa tên field `videoViews`/`videoCount` (bản gốc) →
      `views`/`videos` khi code, khớp `latestStats` của `GET /api/channels` đang chạy thật — xem
      [API_SPEC.md](API_SPEC.md)

**Kiểm chứng 20/08/2026:** build+lint+test xanh. `POST /api/sync/display-api` chạy thật qua UI cho 2
kênh **chưa kết nối** → trả đúng `{synced:0, failed:2}`, không crash, không tạo `channel_oauth` rác
(update trên 0 row không sinh row mới — đúng thiết kế). **Chưa kiểm chứng được luồng OAuth thật** —
cần trình duyệt đăng nhập đúng tài khoản TikTok của kênh, việc chỉ bạn làm được. Sau khi bạn kết nối ít
nhất 1 kênh qua `/connections`, còn treo: đo view-trong-ngày thật so với `Overview.csv` (mục 5 🔬 còn
lại của [DISPLAY_API.md](DISPLAY_API.md)), và xác nhận `isComplete` của `vuonvuonvang`.

## M4 — Dashboard (dùng data thật từ M3)

**Làm trước khi vào task Dashboard (quyết định 21/08/2026):**
- [x] **Đưa code vào Git + đẩy GitHub** (21/08/2026) — repo **private**
      `https://github.com/duytienitptit/ahd-dashboard`, branch `main`, 1 commit gốc gồm 148 file.
      Đã quét secret trước khi push: `.env.local`, `tools/m0-display-api-probe/out/tokens.json` và
      các zip dữ liệu thật trong `data/` đều **không** lên remote (`.gitignore` chặn đúng). Thêm
      `.claude/settings.local.json` vào `.gitignore` — cấu hình riêng từng máy, khác với
      `.claude/settings.json` là quy ước chung nên vẫn commit. Từ đây làm việc có commit
- [ ] ⚠️ **Chưa có `.github/workflows/` (CI)** — build/lint/test hiện chỉ chạy tay dưới local. Cân
      nhắc thêm workflow chạy `npm run lint && npm test && npm run build` trên mỗi push. Chưa làm vì
      chưa bàn, không chặn M4
- [ ] **Tắt Docker Desktop** nếu đang chạy — chỉ cần cho `./scripts/dryrun/run.sh` (chạy trước mỗi lần
      thêm migration mới). M4 chỉ đọc bảng đã có từ M1-M3, không cần migration mới → tắt an toàn ngay
      bây giờ, không cần đợi tới lúc bắt đầu M4. Bật lại nếu M4 hoá ra cần đổi schema

- [x] `GET /api/dashboard` — một endpoint, server rẽ nhánh theo `role` (xem [API_SPEC.md](API_SPEC.md))
- [x] UI Tổng quan: **một route, một component**, rẽ nhánh theo vai trò — không tạo 2 trang song song
- [x] Tab Kênh: bảng + bộ lọc (tìm kiếm, dropdown, chip lọc nhanh, sắp xếp, sparkline)
- [x] Trang Chi tiết kênh: biểu đồ + bảng số liệu lưu theo ngày + danh sách video
- [x] Tab Creator: thẻ hiệu suất từng người
- [x] **Engagement rate** `(like+comment+share)/view` — chỉ số dẫn báo, hiện cùng cấp với view/follower
- [x] Tỷ lệ khán giả mới `newViewers/totalViewers` — trên trang chi tiết kênh
- [x] Biểu đồ giờ vàng đăng bài từ `follower_activity` (heatmap giờ × ngày)
- [x] Bảng hiệu quả theo hashtag — tách `#(\w+)` từ tiêu đề, gộp view trung bình
- [x] Trạng thái rỗng / loading / lỗi — quan trọng vì ban đầu chỉ có 2/8 kênh có data

**M4 xong 21/08/2026 — có gì dùng được ngay**

- **`lib/dashboard.ts`** — module trung tâm của M4, dùng chung cho cả 4 màn: hàm thuần có test
  (`pctChange`, `isoWeekStart/Label`, `bucketWeekly*`, `aggregateHashtagStats`, `buildActivityHeatmap`,
  `rankCreatorPerformance`, `latestViewerRatio`) + lớp gọi Supabase (`getChannelPeriodStats` — 1 hàm
  per-channel dùng lại ở cả Tổng quan/Kênh/Chi tiết kênh/Creator, `getDashboard`,
  `fetchChannelVideos`, `fetchActivityHeatmap`, `fetchDataFreshness`). Theo đúng mẫu M3a/M3b
  (thuần tách khỏi I/O, test hàm thuần bằng data giả, không cần DB).
- **Mốc "N ngày qua" neo theo hôm nay** (`nowVnDateString()`), không neo theo ngày mới nhất có data —
  quyết định 21/08/2026 khi bắt đầu code M4 (đã hỏi, xem CLAUDE.md). Nghĩa là lúc chưa kênh nào nối
  Display API, các ô gần đây sẽ trống thay vì đẹp giả — đúng chủ đích, không phải bug.
- ⚠️ **Content.csv giờ được parse đủ `Total views/likes/comments/shares`** (`lib/import/content.ts`,
  `lib/import/run-import.ts`) — M3a chỉ lấy title/link/hashtags vì lúc đó chưa có tính năng nào cần
  số view. Bảng hiệu quả hashtag (M4) cần số này; ghi vào `video_snapshot` giống hệt cách M3b ghi từ
  Display API. **15 video/kênh đã import trước khi có đổi này (M3a) không có `video_snapshot`** —
  bảng hashtag hiện trống thật (không phải lỗi), sẽ tự có số ở lần import Studio kế tiếp (thứ Tư) hoặc
  ngay khi kênh nối Display API (kéo lại toàn bộ video kèm view). Cố tình không viết script backfill
  tạm để dồn dữ liệu cho đẹp — không phải việc của phiên code, và dữ liệu trống là trạng thái đúng đắn
  cần xử lý tốt (xem mục "Trạng thái rỗng" ở trên), không phải thứ cần che đi.
- **`GET /api/channels/:id/oauth/status` không đổi** — Tổng quan/Kênh/Chi tiết kênh/Creator đều đọc số
  liệu qua `v_channel_daily`/`data_snapshot`/`content_video`/`video_snapshot`/`follower_activity`,
  không đụng `channel_oauth` (bảng đó không role đăng nhập nào đọc được, kể cả từ M4).
  Trạng thái kết nối vẫn chỉ xem ở `/connections` (M3b), không lặp lại ở đây.
- **`app/(app)/channels/channel-form.tsx`** — `ChannelRow` đổi hẳn layout: từ
  Kênh/Creator/Trạng thái/Ngày thêm/Sửa (M2) sang
  Kênh/Follower/Lượt xem/Video/View-per-video/Sparkline/Tiến độ KPI/Sửa, đúng như ghi chú "để M4" lúc
  M2 đóng. `CHANNEL_TABLE_COLUMNS` export dùng chung giữa header (`channels-table.tsx`), row, và
  skeleton (`loading.tsx`) — 1 nguồn layout duy nhất. **"Tiến độ KPI" luôn hiện chip "Chưa đặt KPI"**
  (chưa có `kpi_cycle` nào) thay vì phần trăm giả.
- **Cột lọc nhanh KHÔNG theo trạng thái KPI** (mockup gốc: Vượt tiến độ/Ổn định/Cần tăng tốc) — đổi
  thành lọc theo dữ liệu thật (Đang giảm view / Chưa gán Creator / Ngừng hoạt động), đúng nguyên tắc ở
  đầu CLAUDE.md "đừng lấy % KPI làm trục sắp xếp mặc định". Tương tự nhãn "rank" ở thẻ Creator
  (`rankCreatorPerformance`) đổi từ dựa-KPI sang dựa-view-share/xu-hướng.
- **`app/(app)/channels/[id]/`** — trang mới, chưa có trong `design/ChannelDetail.dc.html` gốc:
  heatmap giờ vàng (`detail-widgets.tsx` → `ActivityHeatmapCard`, tô màu bằng `color-mix()`, không
  cần thư viện chart) và bảng hashtag (`HashtagTable`) là 2 khối **không có mockup nguồn** — tự thiết
  kế theo đúng token màu/bo góc/spacing của [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), chưa cập nhật lại
  file đó với 2 mẫu mới (xem ghi chú trong DESIGN_SYSTEM.md). Card "KPI tuần này"/"Các kỳ đã chốt" của
  mockup gốc **bỏ hẳn** khỏi M4 (thay bằng "Tỷ lệ khán giả mới") — đúng phạm vi M5, không dựng UI cho
  bảng rỗng.
- **Biểu đồ xu hướng dùng SVG tay** (`app/(app)/trend-chart.tsx`), không thêm thư viện chart — đúng
  mẫu `design/*.dc.html`. Tab Lượt xem/Follower/Video chuyển ngay trên client vì `trend` trả sẵn cả 3
  chuỗi (xem lệch #2 trong [API_SPEC.md](API_SPEC.md)); **bài học khi code**: hàm `formatValue` ban
  đầu truyền thẳng như prop function từ Server Component → Client Component, Next.js chặn ngay
  ("Functions cannot be passed directly to Client Components") — sửa bằng cách format bên trong
  `trend-chart.tsx` (client) theo key `"compact" | "count"`, không truyền function qua props.
- ⚠️ **Bug thật bắt được lúc kiểm chứng bằng browser, không phải lúc review code**: hàm gộp follower
  theo tuần ban đầu lấy "row cuối cùng theo ngày" trên danh sách **gộp nhiều kênh** — với 2 kênh trở
  lên, kết quả là follower của 1 kênh bất kỳ (tuỳ thứ tự sort), không phải tổng cả team. Biểu đồ
  "Follower" lúc đó vẽ ra hình răng cưa vô lý dù số liệu nguồn đúng. Sửa: gộp theo từng kênh trước
  (giá trị mới nhất mỗi kênh mỗi tuần), rồi mới cộng — `bucketWeeklyLastFollowers()` trong
  `lib/dashboard.ts`, có test riêng cho ca nhiều kênh. Bài học: build/lint/test xanh không phát hiện
  được lỗi này vì hàm vẫn chạy đúng kiểu dữ liệu, chỉ sai theo nghĩa nghiệp vụ — **chỉ lộ ra khi nhìn
  đồ thị thật với ≥2 kênh có data**, giống 2 lỗi P1 đã ghi lại ở M3b.
- **Kiểm chứng bằng browser thật** (không chỉ build/lint/test) — tạo 2 tài khoản QA tạm qua service
  role (`manager` + `creator`), **không đọc `.env.local`** (script tự `process.loadEnvFile` như
  `scripts/seed.mjs`), đăng nhập thật, click qua cả 4 màn ở cả 2 vai trò, gán tạm 1 Creator test vào
  `nong.nghiep.xanh.17` để kiểm chứng nhánh Creator (UI role-branching, "Kênh của tôi", nhãn "Chỉ
  xem") rồi **gán lại đúng Creator cũ (`sukai`)** trước khi xoá 2 tài khoản tạm — không để lại thay
  đổi nào trên dữ liệu thật. Phát hiện lúc đó: **`sukai` đã được gán cho cả 2 kênh thật** — khác với
  ghi chú "chưa kênh nào được gán Creator" chốt ngày 21/08/2026 đầu phiên này; trạng thái đã đổi ở đâu
  đó ngoài phiên này, CLAUDE.md đã cập nhật lại theo thực tế quan sát được.
- `npm run build && npm run lint && npm test` xanh (11 test file, xem thêm ở `lib/dashboard.test.ts`,
  `lib/format.test.ts`, `lib/import/content.test.ts`).

**Bổ sung 21/08/2026 sau khi xem bản đầu — 3 phản hồi, làm ngay trong cùng phiên:**
- **Chọn khoảng thời gian tuỳ ý** ở Tổng quan + Kênh — trước đó cố định "7 ngày qua", không đổi được.
  `app/(app)/date-range-picker.tsx` (client, đọc/ghi `?from=&to=` trên URL — page vẫn là Server
  Component đọc `searchParams`, không chuyển sang client-fetch). Preset 7/14/30 ngày + tuỳ chỉnh 2
  input ngày. Kéo theo: "so với kỳ trước" phải tổng quát hoá theo **độ dài kỳ đang chọn** thay vì luôn
  cố định 7 ngày — `previousPeriod()` mới trong `lib/dashboard.ts` (có test), thay hết
  `addDaysToDateString(from, -7)` ở 4 trang. `lib/time.ts` thêm `resolvePeriodParams()` (parse
  `?from=&to=` an toàn, sai định dạng thì rơi về mặc định thay vì crash trang) + `daysBetweenDateStrings()`.
- **Lọc theo Creator ở Tổng quan** — trước đó chỉ Kênh lọc được. `getDashboard()` nhận thêm
  `creatorId` (optional), lọc `channel` trước khi tính mọi thứ khác — không phải trường riêng trong
  response, chỉ là tham số lọc đầu vào. `app/(app)/creator-filter.tsx` (client, cùng cơ chế URL param
  `?creatorId=` như DateRangePicker). Không đổi `myChannels` (luôn là kênh của chính người đang xem,
  không phụ thuộc bộ lọc này).
- **Xuất CSV** — 3 chỗ: Tổng quan ("Xuất dữ liệu" — tóm tắt `teamStats`), Kênh ("Xuất CSV" — đúng các
  dòng đang hiển thị sau khi lọc/sắp xếp), Chi tiết kênh ("Xuất CSV" trên bảng "Số liệu đã lưu theo
  ngày" — toàn bộ lịch sử, không chỉ trang đang xem). `app/(app)/download-csv.ts` (hàm thuần
  client-only, dựng CSV bằng tay — không thêm thư viện, có BOM để Excel mở tiếng Việt không lỗi dấu)
  + `app/(app)/export-csv-button.tsx` (component dùng chung, nhận `rows` đã tính sẵn qua props —
  **không truyền function qua props Server→Client**, bài học lặp lại từ lỗi TrendChart ở M4 gốc).
- **Kiểm chứng cả 3 bằng browser thật** cùng lượt với M3c ở trên (tài khoản QA tạo/xoá y hệt quy
  trình M4 gốc): lọc theo Creator có 0 kênh ra đúng trạng thái rỗng toàn trang; khoảng ngày tuỳ ý cho
  kết quả khớp với `data_snapshot` thật (đối chiếu trực tiếp qua `GET /api/channels/:id/snapshots`
  khi số nhìn bất thường — hoá ra đúng, chỉ là tuần đó dữ liệu gốc thật sự bằng 0); export CSV không
  lỗi console (không kiểm được nội dung file tải về qua công cụ tự động, chỉ xác nhận không crash).

**Sửa tiếp 21/08/2026 — phản hồi thứ 2 cùng ngày: bấm filter không có phản hồi gì, "giật giật khó
chịu".** Nguyên nhân thật: `loading.tsx` **không tự hiện khi chỉ đổi `searchParams` trên cùng route**
— kể cả bọc `router.replace()` trong `startTransition`. Đã kiểm chứng bằng `MutationObserver` thật
(không phải đoán): `isPending` từ `useTransition` lên đúng và tức thời (~7-9ms), nhưng route Suspense
không ăn theo nó, nên UI đứng im tới khi RSC payload mới về (~1-1.5s thật, query Supabase Tokyo từ xa)
rồi mới nhảy — đúng cảm giác "giật". Sửa bằng cơ chế riêng, không dựa `loading.tsx`:
`app/(app)/filter-transition.tsx` (`FilterTransitionProvider` giữ 1 `useTransition` dùng chung cho
mọi filter trong trang, `useFilterTransition()` cho control gọi `setParams()`,
`FilterPendingOverlay` tự làm mờ `opacity-40 pointer-events-none` vùng nội dung khi `isPending`) — áp
vào cả `app/(app)/page.tsx` và `channels/page.tsx`. Đã đo lại bằng `MutationObserver`: mờ ở
7-9ms, sáng lại đúng lúc data mới về (~1.4-1.5s). Ghi lại đầy đủ + lý do kỹ thuật ở
[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) mục "Trạng thái chờ" — route mới có filter kiểu `searchParams`
sau này phải theo mẫu này, không giả định `loading.tsx` tự lo được.

**Phản hồi thứ 3 cùng ngày: chú thích rõ cơ chế chọn nguồn ngay trên UI, không chỉ trong docs.** Thêm
`app/(app)/source-priority-info.tsx` — icon ⓘ cạnh nhãn "đã đối chiếu"/"tạm tính" ở
`DataFreshnessLine` (Tổng quan) và cạnh tiêu đề bảng ở `DailyTable` (Chi tiết kênh), bấm ra popup giải
thích thứ tự ưu tiên + ý nghĩa từng nhãn. **Sửa lại ngay sau đó theo yêu cầu**: bản đầu liệt kê đủ 5
nguồn kỹ thuật trong `source_rank()` (kể cả `business_api`/`vendor_scraping` — 2 nguồn chưa có code
nào từng ghi vào `data_snapshot`, `business_api` là "V2 nếu được duyệt", `vendor_scraping` là dự phòng
M7 chưa cần tới vì Display API đã khả thi) — quá chi tiết, gây rối. Rút gọn UI xuống đúng
**3 nguồn thật đang hoạt động: Studio import → Display API → Nhập tay**. `source_rank()` trong DB
**giữ nguyên 5 bậc** — không đổi business rule đã chốt từ M1, chỉ đổi phần **giải thích cho người
dùng** để khớp với thực tế đang chạy.

## Đợt 1 & Đợt 2 — sửa lỗi + thiết kế lại sau khi dùng thử bản deploy đầu (21/08/2026)

Không phải milestone theo kế hoạch gốc — phát sinh từ 11 vấn đề gặp lúc dùng thử M4 lần đầu trên
deploy thật + dữ liệu thật. Tách 2 đợt vì lẫn cả bug dữ liệu, tính năng thiếu, và thiết kế — không
sửa chung một lượt. Chi tiết kỹ thuật đầy đủ ở [PROGRESS.md](PROGRESS.md) mục "Đợt 1 sửa dữ liệu".

**Đợt 1 — sửa dữ liệu, xong 21/08/2026:**
- [x] Chặn hẳn (không chỉ cảnh báo) khi tài khoản TikTok Authorize không khớp `channel.tiktok_handle`
      + cột `channel_oauth.account_verified` + badge "Chưa xác minh" thường trực ở `/connections`
- [x] Dọn 2 bug đã ghi nhận thật trên DB production (sai tài khoản TikTok + import CSV nhầm kênh) —
      `scripts/cleanup-wrong-account-sync.mjs`
- [x] Null vs 0 xuyên suốt `lib/dashboard.ts` (`sumViews`, `bucketWeeklyViews`, `ChannelPeriodStat`) +
      biểu đồ vẽ đứt đoạn thay vì tụt về 0 (`trend-chart.tsx`)
- [x] Hiển thị tổng số video của kênh (`data_snapshot.video_count`) cạnh số video đã biết trong DB
- [x] `period.comparedFrom`/`comparedTo` tách 2 trường + hiển thị ở Tổng quan
- [x] Creator sửa được "Tên kênh" của kênh mình phụ trách (hàm Postgres `security definer`
      `update_channel_name`); Handle TikTok vẫn chỉ Manager

**Đợt 2 — thiết kế lại UI, xong 21/08/2026:**
- [x] **Chi tiết kênh — thiết kế lại xong**: bảng "Số liệu đã lưu theo ngày" (+ nút Nhập tay đi kèm)
      dời lên ngay sau biểu đồ, trước heatmap/hashtag/video — trước đây nằm cuối cùng. Heatmap thêm
      thang màu + số ("Ít hoạt động ←→ Nhiều hoạt động", số cao nhất) + tự hiện số trên ô đậm nhất.
      Empty state của heatmap/hashtag nói rõ cần file/kết nối gì để có dữ liệu, không chỉ "chưa có".
- [x] **Biểu đồ xu hướng: thêm mức chia theo tháng — xong.** `TrendChart` có toggle Tuần/Tháng cạnh
      tab metric, cả 2 mức tính sẵn server-side (không refetch khi đổi). `bucketWeekly*`/`bucketMonthly*`
      dùng chung 1 lõi tham số hoá (`bucketViewsBy`/`bucketLastFollowersBy`/`bucketVideoCountsBy`).
- [x] **Thêm tab "Nhập tay" ở `/import` — xong.** `/import/manual-entry` (Manager-only), chọn kênh
      rồi tái dùng nguyên `ManualEntryForm` đã có ở Chi tiết kênh (không viết lại). Chỗ cũ vẫn giữ.
- [x] **Creator upload file Studio — đã hỏi và chốt "Có" (21/08/2026), đã code + verify xong.**
      RLS mới (`20260821000004_creator_studio_import.sql`) scope theo `current_creator_id = auth.uid()`
      + `source = 'studio_import'` (chặn rò rỉ sang `manual_entry`). Verify bằng phiên đăng nhập thật
      (tạo QA creator, gán tạm 1 kênh thật, test 5 case, dọn sạch) — xem PROGRESS.md mục "Creator
      upload file Studio".
- [x] **Thẻ Creator — 2/3 mục xong, 1 mục hoá ra không phải bug**:
      - Thanh progress theo tỉ lệ thật: **kiểm tra lại thấy code đã đúng từ trước** (`width` tính theo
        `channel.views / maxViews`, không phải full-width cố định) — nhận định ban đầu đọc nhầm ảnh
        chụp, không sửa gì.
      - [x] Thu gọn tài khoản đã vô hiệu hoá — tách section riêng, `<details>` gấp lại mặc định.
      - [x] Bỏ badge "Dẫn đầu view" khi chỉ có 1 creator có dữ liệu — `rankCreatorPerformance()` giờ
        yêu cầu ≥2 creator có kênh mới gán "leader" (bug thật, đã có test khoá lại).

## Team — nhóm Creator (21/08/2026, ngoài kế hoạch gốc)

Yêu cầu phát sinh giữa lúc làm Đợt 2 ("1 manager quản lý 2 team"). Đã hỏi trước khi viết migration —
xác nhận Team **chỉ là nhãn tổ chức/lọc**, không đổi ai-thấy-được-gì (vẫn 1 Manager, Creator vẫn
cross-channel visibility như cũ). Chi tiết: [PROGRESS.md](PROGRESS.md) mục "Team".

- [x] Migration `20260821000003_team.sql` — bảng `team`, cột `creator.team_id` (nullable)
- [x] `lib/teams.ts` (CRUD) + `lib/creators.ts` nối `team`/`teamId`
- [x] `/creators`: `TeamManager` (tạo/sửa/xoá team), chọn team lúc tạo/sửa Creator, badge team trên thẻ
- [x] Lọc Tổng quan theo team (`?teamId=`, `TeamFilterSelect` cạnh `CreatorFilterSelect`)
- [x] `GET/POST /api/teams`, `PATCH/DELETE /api/teams/:id` — đúng quy ước mọi resource khác đều có route
- [x] Kiểm chứng bằng dữ liệu thật (tạo team, gán creator, lọc dashboard, xoá sạch) — xem PROGRESS.md

**Vòng 2, cùng ngày — dùng thử trực tiếp qua Browser pane rồi phản hồi thêm:**
- [x] `TeamManager`/`TeamRow` viết lại — panel ban đầu bị chê "xấu" (chữ trần, không avatar, không
      đường kẻ). Giờ khớp style `ConnectionsClient`/`ChannelRow` (icon avatar, divider, nút bo viền).
- [x] `aggregateChannelStats()` — hàm rollup dùng chung cho cả Creator lẫn Team, có test
- [x] Team hiện số liệu tổng hợp (Lượt xem/Follower/Tương tác) ngay trên danh sách, không cần bấm vào
- [x] ~~`/creators/team/[id]` — bấm tên team ra trang chi tiết, xem từng thành viên~~ — thay bằng
      accordion ngay trên `/creators` (xem "Team → Nhân sự → Kênh" bên dưới, cùng ngày)
- [x] Đổi tên trang "Creator" → "Nhân sự" (nav label + H1, route `/creators` giữ nguyên)
- [x] Kiểm chứng bằng phiên đăng nhập thật (Browser pane, không phải service role)

## Team → Nhân sự → Kênh — dựng lại drill-down (21/08/2026, vòng 3 phản hồi)

`/creators/team/[id]` (vòng 2 ở trên) hoá ra không đạt: thẻ Creator luôn mở sẵn cho MỌI người bất kể
team (cuộn dài), và bấm vào một Creator/kênh trong thẻ không đi đâu — ngõ cụt, phải quay lại `/channels`
lọc tay. Yêu cầu: bấm team → xổ ra bảng thành viên; bấm một người → trang riêng của người đó; trong đó
bấm một kênh → sang trang kênh. Chi tiết đầy đủ: [PROGRESS.md](PROGRESS.md) mục "Team → Nhân sự → Kênh".

- [x] `lib/dashboard.ts`: `RollupStat` thêm `videos`/`previousVideos`/`engagementRateDeltaPct`;
      `buildCreatorPerformance()` (gom vòng lặp rollup-theo-creator từng lặp lại ở 2 trang);
      `mergeDailyRowsByDate()` (gộp nhiều kênh về 1 dòng/ngày, null-vs-0 đúng luật, nguồn = yếu nhất
      trong ngày, `isComplete` tính cả số kênh có mặt) — test đầy đủ cho cả 3
- [x] `/creators` viết lại: accordion đóng mặc định theo team (`team-accordion.tsx`, mới) — mỗi team
      là 1 panel, mở ra bảng dòng gọn từng creator (không còn thẻ lớn `CreatorCard`); rank luôn tính
      trên TOÀN BỘ creator (không tính lại riêng mỗi màn hình như trước — badge từng đổi nghĩa giữa
      `/creators` và trang team cũ); thêm `DateRangePicker` (`?from=&to=`, bỏ cứng "7 ngày")
- [x] `/creators/[id]` (route mới) — trang riêng từng Nhân sự: 4 `StatTile`, `TrendChart` (tuần/tháng),
      bảng "Kênh phụ trách" bấm được sang `/channels/[id]` (vá ngõ cụt), `DailyTable` gộp qua
      `mergeDailyRowsByDate`, sửa thông tin tại chỗ (`CreatorEditForm` tách từ `CreatorCard` cũ)
- [x] Xoá `/creators/team/[id]`; team pill trên trang Nhân sự trỏ về `/creators?team=<id>` (hoặc
      `_unassigned`) — accordion tự mở đúng panel + cuộn tới
- [x] Kiểm chứng bằng phiên đăng nhập thật (Browser pane) — accordion mở/đóng, điều hướng
      team→creator→kênh, sửa tại chỗ (cả 2 nơi), đổi khoảng ngày, không lỗi console

## CRUD đầy đủ Nhân sự/Kênh (21/08/2026, theo yêu cầu — Team đã đủ CRUD từ trước)

Đã hỏi trước khi làm: xoá thật hay chỉ vô hiệu hoá (vì xoá thật xoá luôn `data_snapshot`/`kpi_cycle`
đã chốt — ngược nguyên tắc lưu trữ dữ liệu của hệ thống). Quyết định: xoá thật, gõ tên xác nhận,
Manager-only. Chi tiết: [PROGRESS.md](PROGRESS.md) mục "CRUD đầy đủ".

- [x] `deleteCreator()`/`deleteChannel()` (`lib/creators.ts`/`lib/channels.ts`) — xoá Auth user (cascade
      xoá `creator`) / xoá `channel` (cascade toàn bộ dữ liệu liên quan); `deleteChannel` chặn nếu có
      `kpi_cycle.status = 'final'`
- [x] `resetCreatorPassword()` — Manager đặt lại mật khẩu tạm cho Creator, hiện 1 lần giống lúc tạo
- [x] `ConfirmDeleteForm` (mới, dùng chung) — gõ đúng tên mới bật nút xoá, dùng ở cả Creator và Channel
- [x] `deleteCreatorAction`/`deleteChannelAction`/`resetCreatorPasswordAction` — Manager-only, ghi
      `audit_log` sau khi xoá thành công, redirect về trang danh sách
- [x] `DELETE /api/creators/:id`, `DELETE /api/channels/:id` — đúng quy ước mọi resource có route
- [x] `CreatorEditForm` (đổi thành 3 panel: sửa/đổi mật khẩu/xoá) và `ChannelRow`'s edit form (thêm
      nút "Xoá kênh") — dùng chung `ConfirmDeleteForm`

## M5 — KPI Cycle

- [ ] `POST /api/kpi-cycles` — tự chụp `followersAtStart` từ `data_snapshot` mới nhất, chặn trùng khoảng ngày (409)
- [ ] `GET /api/kpi-cycles` + tính `progress` server-side (đọc từ `data_snapshot` trong khoảng ngày của cycle)
- [ ] `PATCH /api/kpi-cycles/:id` — chặn sửa khi `status = final` (403)
- [ ] Hàm tính `progress` + `overallStatus` (🟢🟡🔴) — viết unit test cho công thức followers
- [ ] Cảnh báo nếu thiếu `data_snapshot` trong khoảng ngày của cycle (import chưa đủ để tính chính xác)
- [ ] UI: form tạo KPI (chọn chu kỳ tuần / custom date range)
- [ ] UI: thanh tiến độ % + badge trạng thái

## M6 — Chốt sổ KPI (Finalize)

Khác M3: M3 là nhập dữ liệu kênh theo tuần (độc lập KPI); M6 là khoá kết quả 1 chu kỳ KPI cụ thể
dựa trên dữ liệu đã có sẵn từ M3 trong đúng khoảng ngày của chu kỳ đó.

- [ ] `POST /api/kpi-cycles/:id/finalize` — tổng hợp `data_snapshot` trong khoảng ngày, khoá cycle
- [ ] **Chặn finalize** nếu chưa qua `periodEnd + 3 ngày`, hoặc còn ngày thiếu `studio_import`,
      hoặc còn `manual_entry` chưa được thay — báo rõ thiếu ngày nào thay vì cho chốt rồi sai
- [ ] Ghi `audit_log` mọi thao tác finalize/sửa sau final
- [ ] UI: màn hình chốt sổ — đối chiếu số liệu trước khi khoá
- [ ] UI: xem lại lịch sử các kỳ đã chốt

## M7 — Dự phòng nguồn dữ liệu

Chỉ làm nếu M0 cho thấy Display API không khả thi.

- [ ] Nếu sandbox không đủ → nộp hồ sơ duyệt Display API chính thức (~1-2 tuần)
- [ ] Nếu Display API bị từ chối → đánh giá vendor scraping (ScrapeCreators rẻ nhất, ~$47/25K credit)
      — lưu ý vi phạm ToS TikTok, chỉ dùng khi không còn lựa chọn
- [ ] Nếu cả hai đều không được → bật `manual_entry` với đủ ràng buộc kiểm soát ([DATA_SOURCES.md](DATA_SOURCES.md))
- [ ] Business API: đánh giá lại nếu sau này cần chỉ số Display API không có (profile views, nhân khẩu học realtime)

---

## Sau MVP

- [ ] P1 — Leaderboard & Badge
- [ ] P1 — Thư viện top video (benchmarking) — đã có `content_video` từ M3, chỉ cần UI
- [ ] P1 — Creator Profile
- [ ] P2 — Cảnh báo chủ động
- [ ] P2 — Multi-Manager
- [ ] P2 — Engine tính thưởng từ số liệu Final

---

## Thứ tự đề xuất

`M0 (kiểm chứng API trước) → M1 → M2 → M3a → M4 → M3b → M5 → M6`

- **M0 làm việc kiểm chứng Display API trước tiên**, kể cả trước khi init Next.js. Nếu giả định này
  sai, kiến trúc data phải đổi — biết sớm rẻ hơn nhiều so với biết sau khi đã code xong M3b.
- **M3a (import Studio) trước M3b (Display API)** vì đã có 60 ngày data thật để test ngay, không
  chờ OAuth.
- **M3+M4 trước KPI (M5, M6)** — đúng thứ tự ưu tiên sản phẩm: dữ liệu trước, KPI sau
  ([PRODUCT_SPEC.md §1](PRODUCT_SPEC.md#1-bài-toán)).
