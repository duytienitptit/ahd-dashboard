# HRM — TikTok Team Management

Web dashboard nội bộ **lưu trữ và hiển thị dữ liệu của 8 kênh TikTok theo thời gian**.
KPI là một tính năng đặt lên trên tập dữ liệu đó, không phải xương sống — kể cả khi không đặt KPI
nào, hệ thống vẫn phải có giá trị nhờ việc lưu và trình bày dữ liệu.

**Đừng lấy % KPI làm trục sắp xếp mặc định của mọi màn hình.** Ưu tiên trả lời "dữ liệu các kênh
đang thế nào" trước, rồi mới đến "có đạt chỉ tiêu không".

## Tech stack
- Next.js (App Router) — frontend + API route handlers
- Supabase — Postgres + Auth (free tier)
- Vercel — hosting (free tier)

## Tài liệu — đọc trước khi code

| File | Dùng khi |
| :--- | :--- |
| [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) | Nguồn sự thật về phạm vi, quyết định sản phẩm, công thức KPI |
| [docs/DATABASE_ERD.md](docs/DATABASE_ERD.md) | Viết migration, query, RLS policy |
| [docs/API_SPEC.md](docs/API_SPEC.md) | Viết route handler — bám đúng shape request/response |
| [docs/USER_FLOW.md](docs/USER_FLOW.md) | Dựng UI, điều hướng, phân quyền màn hình |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Viết CSS/component — token màu, font, bo góc, spacing |
| [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) | Lấy số liệu ở đâu cho chỉ số nào — Display API vs Studio import, giới hạn từng nguồn |
| [docs/DISPLAY_API.md](docs/DISPLAY_API.md) | Gọi Display API — endpoint, scope, token, rate limit, các bẫy |
| [docs/CSV_FORMAT.md](docs/CSV_FORMAT.md) | Viết parser import — cấu trúc export TikTok Studio thật, các bẫy bắt buộc xử lý |
| [docs/TASKS.md](docs/TASKS.md) | Chọn task tiếp theo, cập nhật trạng thái sau khi xong |

Mockup gốc 10 màn hình MVP: `design/*.dc.html` — tham chiếu bố cục khi dựng UI.
Biến môi trường: `.env.example`.

## Quy tắc nghiệp vụ bắt buộc

- **Followers là mốc tuyệt đối**, không phải số tăng thêm. Công thức:
  `(followersHiệnTại - followersAtStart) / (targetFollowers - followersAtStart)`
- `followersAtStart` chụp **1 lần** khi tạo KPI cycle, không bao giờ sửa.
- `KPICycle.status = final` → **khoá số liệu**. Mọi thay đổi sau đó phải ghi `audit_log`.
  Lý do: số liệu này dùng để tính thưởng/lương sau này, phải chống tranh cãi.
- **Hai tầng dữ liệu:** `display_api` hằng ngày (nhãn *tạm tính*) + `studio_import` cuối tuần
  (nhãn *đã đối chiếu*, dùng để chốt sổ). Không bao giờ chốt sổ bằng số `display_api`.
  Dùng **Display API**, không phải Business API — xem [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).
- **"View trong kỳ" phải suy ra bằng chênh lệch theo TỪNG video**, không lấy tổng-hôm-nay trừ
  tổng-hôm-qua. Video biến mất khỏi response thì bỏ qua, không trừ. Luôn so số video lấy được với
  `video_count`; lệch thì đánh dấu `isComplete = false` và không dùng snapshot đó tính KPI.
  Lý do: TikTok bị rate-limit thì trả danh sách cắt ngắn mà không báo lỗi.
- ⚠️ **Không dùng `Content.csv` để đếm số video** — cap cứng 15 dòng, bỏ sót video mới nhất, thứ tự
  không đoán được (đã kiểm chứng trên data thật). Số video lấy từ `video_count` của Display API.
  `Content.csv` chỉ dùng cho thư viện top video (P1).
- Parser import phải xử lý đúng các bẫy ở [docs/CSV_FORMAT.md](docs/CSV_FORMAT.md): BOM đầu file,
  ngày tháng có thể là tiếng Việt hoặc tiếng Anh tuỳ ngôn ngữ TikTok Studio lúc export, không có
  năm trong ngày, giá trị `"undefined"` phải parse thành `null` chứ không phải `0`.
- **Studio trễ 2 ngày.** Import chỉ ghi đè ngày `< ngàyExport − 3` (cửa sổ chốt); 2-3 ngày gần nhất
  giữ nguyên số `display_api`. Không bao giờ ghi đè số thật bằng `undefined`/`null`.
- **Chốt sổ chỉ mở khi** đã qua `periodEnd + 3 ngày` **và** mọi ngày trong kỳ có `studio_import`.
  Lịch vận hành: import thứ Tư cho tuần trước đó.
- Cùng một ngày có nhiều nguồn thì ưu tiên:
  `studio_import > business_api > display_api > vendor_scraping > manual_entry`.
- `manual_entry` **chỉ Manager** được nhập (Creator không — người hưởng thưởng không tự khai số tính
  thưởng), và **tự bị thay thế** khi `studio_import` phủ ngày đó. Không cho chốt sổ chu kỳ còn chứa nó.
- 🐞 Cột `Difference in followers from previous day` trong `FollowerHistory.csv` **bị đặt sai tên** —
  nó là chênh lệch với ngày SAU (khớp 15/15 khi kiểm chứng). **Bỏ cột này, tự tính từ `Followers`.**
- **`refresh_token` của Display API xoay vòng** — mỗi lần refresh phải lưu đè token mới trả về, dùng
  lại token cũ sẽ mất quyền và phải OAuth lại. Refresh token hết hạn sau **365 ngày** → cần màn hình
  theo dõi hạn token, cảnh báo trước ≥30 ngày. Chi tiết: [docs/DISPLAY_API.md](docs/DISPLAY_API.md).
- Creator **không** có quyền tạo/sửa KPI, chốt sổ, hay tạo tài khoản. Chỉ Manager.
- Không có self-signup. Manager tạo tài khoản Creator.
- **Hệ thống đo hiệu suất KÊNH, không đo người.** Đã chốt loại khỏi phạm vi: chấm công/nghỉ phép/lương,
  khối lượng công việc và thời gian bỏ ra, ghi chú định tính của Manager, watch time / nguồn traffic
  (không có trong export), kế hoạch nội dung. Đừng đề xuất lại — xem mục "Ngoài phạm vi" trong
  [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md).
- **Engagement rate `(like+comment+share)/view` là chỉ số dẫn báo duy nhất** của hệ thống — mọi chỉ số
  khác (view, follower) đều là chỉ số trễ. Luôn hiển thị nó ngang hàng với view/follower, không xem là phụ.
- `followersDiff` **không lưu vào DB** — tự tính từ chuỗi `followers` (cột gốc trong CSV bị sai, xem dưới).

## Quy ước code

- Mọi truy cập TikTok data phải đi qua interface `TikTokDataProvider` — không gọi thẳng Business API
  từ business logic (để đổi nguồn/fallback vendor không phải sửa core).
- Tính toán `progress` ở **server-side**, không tính lại ở client (tránh lệch số giữa các màn hình).
- **Múi giờ: cột `date` = ngày lịch `Asia/Ho_Chi_Minh`**, không phải UTC. Studio export tổng theo ngày
  nên không quy đổi múi giờ được; chỉ timestamp từ Display API cần đổi sang giờ VN trước khi lấy phần
  ngày. `timestamptz` (created_at, hạn token) vẫn lưu UTC bình thường. Cron chạy ~03:00 giờ VN.
- **Chọn nguồn khi 1 ngày có nhiều `source`**: đọc qua view **`v_channel_daily`**, không query thẳng
  `data_snapshot` — mỗi query tự chọn sẽ lệch số giữa các màn hình. Ngoại lệ duy nhất: API nhận
  `?source=` để xem riêng một nguồn. Thứ tự ở [docs/DATABASE_ERD.md](docs/DATABASE_ERD.md).
- **Truy cập DB**: mặc định dùng `createSupabaseServerClient()` (chạy theo session, RLS có hiệu lực).
  `createSupabaseAdminClient()` bypass RLS hoàn toàn — chỉ dùng cho Auth admin API, `channel_oauth`,
  và cron; gọi `requireManager()` trước khi đụng tới nó.
- `videosTrongKỳ` = **đếm `content_video` có `posted_at` trong kỳ**, không lấy hiệu `video_count`
  (video bị xoá làm hiệu sai).
- Tiền/số liệu lớn dùng `bigint`. Không dùng float cho views/followers.
- UI tiếng Việt. Code, tên biến, comment: tiếng Anh.

## Cách làm việc với dự án này

- **Chủ động đề xuất tài liệu mới.** Khi phát hiện một loại thông tin sẽ bị hỏi đi hỏi lại hoặc dễ
  làm sai ở phiên sau (quy ước, quyết định kiến trúc, cách chạy, tham chiếu ngoài), đề xuất tạo doc
  tương ứng ngay — hoặc bổ sung vào `CLAUDE.md` nếu là quy tắc ngắn. Không đợi được yêu cầu.
- **Phản biện khi thấy hướng đi sai**, kèm lý do và phương án thay thế — không im lặng làm theo.
- **Hỏi khi thiếu thông tin** thay vì tự suy đoán, nhất là với quyết định khó sửa về sau
  (schema, phân quyền, cách tính KPI).
- Cập nhật `docs/TASKS.md` sau khi hoàn thành task; cập nhật `docs/PRODUCT_SPEC.md` khi có
  quyết định sản phẩm mới.

## Trạng thái

**M3 xong toàn bộ (3a Import Studio + 3b Display API, 20/08/2026). Việc tiếp theo: M4 (Dashboard).**

**Quyết định 21/08/2026:** kiểm chứng OAuth thật (xem mục treo bên dưới) **cố ý dồn lại**, không chặn
M4 — M4 chỉ đọc `data_snapshot` đã có sẵn từ M3a (`studio_import`, 60 ngày thật cho 2 kênh), chưa cần
số `display_api`. Trước khi bắt đầu M4: đưa code vào Git/GitHub + tắt Docker Desktop — 2 việc mới
thêm, xem đầu mục [TASKS.md](docs/TASKS.md) M4.

⚠️ **Còn treo, chưa chặn gì nhưng cần làm trước khi tính KPI dựa vào `display_api` (M5 trở đi):**
`TOKEN_ENCRYPTION_KEY` trong `.env.local` hiện **không phải hex 64 ký tự hợp lệ** — phát hiện lúc
kiểm chứng lại code M3b (đo được 219 ký tự, 3 đoạn cách nhau bởi dấu `.` dài 36/138/43 — đúng hình
dạng 1 JWT, nhiều khả năng dán nhầm giá trị khác, ví dụ Supabase service role key, vào đúng chỗ này).
Token OAuth đầu tiên sẽ **mã hoá bằng khoá sai** nếu bấm "Kết nối" trước khi sửa. Tôi không đọc được
`.env.local` (cố ý), không tự sửa được — sinh khoá mới bằng đúng lệnh trong `.env.example`:
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, dán vào cả `.env.local`
và Vercel Environment Variables (2 nơi khác nhau, phải sửa cả hai, nhớ Redeploy sau khi sửa trên
Vercel — biến mới không tự áp dụng cho bản đang chạy).

Luồng kết nối Display API + đồng bộ hằng ngày đã code xong nhưng **chưa ai bấm "Kết nối" thật** — cần
Authorize trên TikTok cho ít nhất 1 kênh (sau khi sửa `TOKEN_ENCRYPTION_KEY`), việc chỉ người dùng làm
được (xem mục M3b bên dưới). M0 còn đúng 1 mục kiểm chứng treo (đo view-trong-ngày thật — mở khoá được
sau khi kết nối kênh đầu tiên).

Deploy: `https://ahd-dashboard-dusky.vercel.app` (kèm `/terms` `/privacy`).
Supabase: project `ftdfmclxkjmrfikdipnt`, region Tokyo.
**Function region: `hkg1` (Hong Kong), đặt ở Vercel Project Settings → Functions.** Không có trong
code — đừng tìm trong repo, kiểm bằng `npx vercel inspect <url>` (cột `[hkg1]`) hoặc header
`x-vercel-id`. Mặc định của Vercel là `iad1` (Virginia): đo được TTFB **2.1-2.5s**; sau khi đổi
sang `hkg1` còn **~0.2s** (21/08/2026).

Hai cách KHÔNG dùng được, đã thử và loại:
- `"regions"` trong `vercel.json` — Vercel bỏ qua với project Next.js, build vẫn ra `[iad1]`.
- `export const preferredRegion` ở `app/layout.tsx` — deploy rồi vẫn bị setting dashboard ghi đè,
  và dù sao cũng không áp cho route handler trong `app/api/` (chúng không nằm dưới root layout).
  Setting dashboard thì áp cho tất cả, kể cả cron và route thêm sau này.

Supabase ở Tokyo còn function ở Hong Kong → mỗi round-trip tới DB ~50ms. Nếu về sau một màn hình
nào chậm bất thường, **đếm số query TUẦN TỰ tới Supabase trước khi đổ lỗi cho DB** — chi phí nằm ở
số lượt, không phải khối lượng dữ liệu. Cùng lý do đó, `getCurrentUser()` trong `lib/auth.ts` bọc
`cache()` của React: layout và page đều cần user, không bọc thì mỗi bên tự gọi `auth.getUser()`
(network call thật, không phải decode JWT) + query lại bảng role. **Giữ nguyên `cache()`.**

### Kết luận M0 — Display API sandbox dùng được, đi tiếp M1

Đã OAuth + gọi API thật trên 3 tài khoản (`kidshoppppala` test, `vuonvuonvang` và `nong.nghiep.xanh.17`
— 2 trong 8 kênh công ty). Chi tiết đầy đủ + số liệu: [docs/DISPLAY_API.md](docs/DISPLAY_API.md) mục
"Bẫy cần đề phòng khi code", checklist gốc ở [docs/TASKS.md](docs/TASKS.md) M0.

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
  `now()` server lúc upload, xem [docs/CSV_FORMAT.md](docs/CSV_FORMAT.md) mục 7

**8 kênh còn lại:** cố ý chưa OAuth — dồn lại làm 1 lượt khi M1 xong (có DB để lưu token thật), không
login rời rạc trước. Nhớ add đủ 8 kênh vào Sandbox Target Users **trước** buổi đó ít nhất 1 tiếng (thời
gian TikTok cần để tài khoản mới có hiệu lực).

### M1 đã xong — có gì dùng được ngay

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
- **`npm test`** (Vitest) — M3b và M5 bắt buộc thêm test vào đây.

### M2 đã xong — có gì dùng được ngay

- **`/api/channels`, `/api/channels/:id`, `/api/creators`, `/api/creators/:id`** — route handler thật,
  logic nằm ở `lib/channels.ts` / `lib/creators.ts` (route handler và Server Action của UI cùng gọi
  vào đó, không tách hai đường hành vi). `lib/validation.ts` + `lib/http.ts` là tầng validate/error
  dùng chung, không thêm dependency ngoài.
- **`channel_ownership_history` tự đồng bộ bằng trigger DB**
  (`supabase/migrations/20260820000007_ownership_trigger.sql`) — đổi Creator của kênh chỉ cần
  `UPDATE channel SET current_creator_id = ...`, **không tự tay ghi vào bảng history**. Chi tiết cơ
  chế 3 nhánh + `to_date` nửa mở: [docs/DATABASE_ERD.md](docs/DATABASE_ERD.md).
- **`v_channel_latest`** (cùng migration) — 1 row mới nhất mỗi kênh, `GET /api/channels` đọc từ đây.
- **`app/(app)/`** — route group có layout dùng chung (header, nav theo vai trò, `requireUser()`
  chặn chưa đăng nhập). `/`, `/channels`, `/creators` đều nằm trong này.
- **`/channels`, `/creators`** — quản lý được thật: thêm/sửa kênh, gán/đổi/gỡ Creator, tạo/vô hiệu hoá
  tài khoản Creator. Cột số liệu (follower/view/sparkline/KPI) trong mockup **chưa có** — để M4, dù
  `data_snapshot` giờ đã có dữ liệu thật (xong ở M3a), UI chưa đọc và hiển thị.
- Luồng tạo → gán → gỡ đã kiểm chứng trên DB thật bằng 1 tài khoản Creator test (tạo, gán vào
  `@vuonvuonvang`, xác nhận `channel_ownership_history` đúng, rồi gỡ gán + vô hiệu hoá — xem
  [docs/TASKS.md](docs/TASKS.md) M2). **2 kênh seed vẫn đang chưa gán Creator thật** — gán khi có
  người, qua `/channels`.

### M3a đã xong — có gì dùng được ngay

- **`lib/import/`** — parser CSV thuần (`csv.ts`, `date.ts`, `overview.ts`, `follower-history.ts`,
  `viewers.ts`, `follower-activity.ts`, `audience.ts`, `content.ts`), `zip.ts` (giải nén, nhận diện
  file theo tên CSV bên trong, không theo tên zip ngoài), và `plan-import.ts` — hàm **thuần không đụng
  Supabase** quyết định ngày nào ghi/bỏ qua/cảnh báo lệch, test trực tiếp bằng data thật trong `data/`
  không cần DB. `run-import.ts` là lớp mỏng bọc quanh, lo phần đọc/ghi Supabase + Storage.
- **`POST /api/channels/:id/import?dryRun=true|false`** — `dryRun=true` parse + trả kết quả, không ghi
  gì (bước "xem trước" trước khi Manager bấm "Lưu dữ liệu"). Field thêm so với đặc tả gốc:
  `?dryRun=`, response field `readDates` — xem [docs/API_SPEC.md](docs/API_SPEC.md).
- **`/import`** (tab "Dữ liệu", Manager-only) — chọn kênh, kéo-thả file zip, xem trước, lưu. **Không**
  test được thao tác kéo-thả qua browser automation (giới hạn bảo mật trình duyệt, không set được giá
  trị `<input type="file">` bằng script) — đã xác nhận UI render đúng, còn pipeline phía sau đã chạy
  thật (không qua UI) trên DB thật, xem dòng dưới.
- **Bucket Storage `studio-imports`** — zip gốc lưu tại `<channelId>/<batchId>/<tên file>`, RLS chỉ
  Manager, cùng mẫu `channel_oauth`. `data_snapshot.raw_file_ref` trỏ tới **thư mục batch**, không
  phải 1 file — xem [docs/DATABASE_ERD.md](docs/DATABASE_ERD.md).
- ⚠️ **Cửa sổ chốt (3 ngày) chỉ áp cho `data_snapshot`** — `follower_activity`/`audience_snapshot`/
  `content_video` luôn ghi toàn bộ file mỗi lần, không lọc theo ngày export. Lý do:
  `FollowerActivity.csv` chỉ giữ 7 ngày/lần, cửa sổ 7 ngày không chồng giữa các tuần — lọc sẽ mất dữ
  liệu vĩnh viễn thay vì bù được ở lần import sau.
- **`nong.nghiep.xanh.17` và `vuonvuonvang` đã có đủ 60 ngày `data_snapshot` thật** (chạy `runStudioImport`
  trực tiếp 1 lần trên DB thật cho cả 2 kênh, không qua UI — số khớp chính xác với data trong `data/`:
  60 ngày, 168 dòng `follower_activity`, 15 `content_video` mỗi kênh). Đây là dữ liệu thật, không phải
  test — không xoá.

### M3b đã xong (code) — có gì dùng được ngay

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
  phải bug, xem [docs/DISPLAY_API.md](docs/DISPLAY_API.md) mục 1.
- **`data_snapshot(source=display_api)` chỉ ghi 3 chỉ số nhóm nóng** (`followers`, `video_count`,
  `video_views`) — không suy day-delta cho likes/comments/shares, ngoài phạm vi TASKS.md M3b.
- **Đã kiểm chứng bằng code, chưa kiểm chứng bằng OAuth thật** — không tự làm được, cần trình duyệt
  đăng nhập đúng tài khoản TikTok của từng kênh. `POST /api/sync/display-api` đã chạy thật qua UI cho
  2 kênh chưa kết nối, trả đúng `{synced:0, failed:2}`, không crash.
- ⚠️ **Review lại 1 lần sau khi code xong (20/08/2026) — tìm ra 2 lỗi P1 tự sửa**: sync đầu tiên
  (bootstrap) từng ghi nhầm tổng view luỹ kế cả kênh thành view/ngày (sai ~10 lần); cron 03:00 giờ VN
  từng gán nhầm ngày do chạy đúng lúc lệch sang ngày lịch mới. Cả 2 đã sửa + kiểm chứng lại bằng fake
  provider trên DB thật (không cần token TikTok thật) — xem [docs/DISPLAY_API.md](docs/DISPLAY_API.md)
  mục 10-11, [docs/TASKS.md](docs/TASKS.md) M3b. Bài học: **luôn tự review lại code liên quan tới
  tiền/số liệu tính thưởng sau khi viết xong, đừng chỉ tin build+test xanh** — cả 2 lỗi đều
  build/lint/test pass bình thường, chỉ lộ ra khi đọc lại logic bằng con số thật.

Chưa có: dashboard thật đọc `data_snapshot` (M4), màn KPI (M5), kết nối Display API thật cho kênh nào
(chờ bạn), 6 kênh còn lại chưa OAuth (dồn 1 lượt theo quyết định 20/08 ở M0).

### Việc tiếp theo

**Phiên kế tiếp bắt đầu M4** (Dashboard, [docs/TASKS.md](docs/TASKS.md)) — trình tự đã chốt 21/08/2026:

1. Đầu phiên, trước khi code: đưa dự án vào Git + đẩy GitHub (chưa từng làm, xem đầu mục M4 trong
   TASKS.md), tắt Docker Desktop nếu còn chạy.
2. M4 dùng data thật đã có từ M3a (`studio_import`, 2/8 kênh) — không phụ thuộc `display_api`, làm
   được ngay.

**Việc riêng chỉ người dùng làm được, không chặn M4, làm khi nào tiện** (đã bàn 21/08/2026, cố ý dồn
lại chứ không phải quên):
1. Sửa `TOKEN_ENCRYPTION_KEY` sai ở `.env.local` + Vercel (xem cảnh báo đầu mục Trạng thái).
2. Vào `/connections`, bấm "Kết nối" cho `nong.nghiep.xanh.17` hoặc `vuonvuonvang`, Authorize trên
   TikTok bằng tài khoản thật của kênh đó.
3. Đối chiếu số `display_api` với `studio_import` đã có từ M3a — trả lời nốt câu hỏi 🔬 còn treo của
   [docs/DISPLAY_API.md](docs/DISPLAY_API.md) (đo view-trong-ngày thật) và xác nhận `isComplete` của
   `vuonvuonvang`.

Vận hành: team đã nhận việc export & upload file Studio hàng tuần (thứ Tư, cho tuần trước đó).
Các mục còn treo: xem mục 8 [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md).
