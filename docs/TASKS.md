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

**3c — Nhập tay dự phòng (nhỏ, làm sau 3a/3b)**
- [ ] `POST /api/channels/:id/manual-entry` — **chỉ Manager**, ghi `source = manual_entry` + `audit_log`
- [ ] Resolver chọn nguồn theo thứ tự ưu tiên → `manual_entry` tự bị thay khi `studio_import` về
- [ ] UI: hiển thị số `manual_entry` khác biệt rõ (nhãn "chưa xác thực")

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

- [ ] `GET /api/dashboard` — một endpoint, server rẽ nhánh theo `role` (xem [API_SPEC.md](API_SPEC.md))
- [ ] UI Tổng quan: **một route, một component**, rẽ nhánh theo vai trò — không tạo 2 trang song song
- [ ] Tab Kênh: bảng + bộ lọc (tìm kiếm, dropdown, chip lọc nhanh, sắp xếp, sparkline)
- [ ] Trang Chi tiết kênh: biểu đồ + bảng số liệu lưu theo ngày + danh sách video
- [ ] Tab Creator: thẻ hiệu suất từng người
- [ ] **Engagement rate** `(like+comment+share)/view` — chỉ số dẫn báo, hiện cùng cấp với view/follower
- [ ] Tỷ lệ khán giả mới `newViewers/totalViewers` — trên trang chi tiết kênh
- [ ] Biểu đồ giờ vàng đăng bài từ `follower_activity` (heatmap giờ × ngày)
- [ ] Bảng hiệu quả theo hashtag — tách `#(\w+)` từ tiêu đề, gộp view trung bình
- [ ] Trạng thái rỗng / loading / lỗi — quan trọng vì ban đầu chỉ có 2/8 kênh có data

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
