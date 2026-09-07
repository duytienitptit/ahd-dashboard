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
| [docs/PROGRESS.md](docs/PROGRESS.md) | Nhớ lại quyết định/deviation của milestone đã xong — không cần đọc để bắt đầu task mới |

Mockup gốc 10 màn hình MVP: `design/*.dc.html` — tham chiếu bố cục khi dựng UI.
Biến môi trường: `.env.example`.

## Quy tắc nghiệp vụ bắt buộc

- **Followers là mốc tuyệt đối**, không phải số tăng thêm. Công thức:
  `(followersHiệnTại - followersAtStart) / (targetFollowers - followersAtStart)`
- `followersAtStart` chụp **1 lần** khi tạo KPI cycle, không bao giờ sửa. Kênh chưa có `followers`
  nào ghi nhận → **chặn tạo KPI cycle** (400), không cho nhập tay follower đầu kỳ ngay trong form đó.
- **Một KPI cycle chỉ cần ≥1 trong 3 chỉ tiêu** (Views/Videos/Followers), không bắt buộc cả 3
  (25/08/2026, theo yêu cầu). `overallPct` = trung bình các % của chỉ tiêu **đã đặt và đã có số đo**
  — không chia cố định cho 3, không tính chỉ tiêu chưa đặt là 0%.
- `KPICycle.status = final` → **khoá số liệu**. Mọi thay đổi sau đó phải ghi `audit_log`.
  Lý do: số liệu này dùng để tính thưởng/lương sau này, phải chống tranh cãi.
- **Hai tầng dữ liệu:** `display_api` hằng ngày (nhãn *tạm tính*) + `studio_import` cuối tuần
  (nhãn *đã đối chiếu*, dùng để chốt sổ). Không bao giờ chốt sổ bằng số `display_api`.
  Dùng **Display API**, không phải Business API — xem [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).
- **"View trong kỳ" phải suy ra bằng chênh lệch theo TỪNG video**, không lấy tổng-hôm-nay trừ
  tổng-hôm-qua. Video biến mất khỏi response thì bỏ qua, không trừ. Luôn so số video lấy được với
  `video_count`; lệch thì đánh dấu `isComplete = false` và không dùng snapshot đó tính KPI.
  Lý do: TikTok bị rate-limit thì trả danh sách cắt ngắn mà không báo lỗi.
- **`%` "so với kỳ trước" của lượt xem chỉ hiện khi kỳ hiện tại phủ đủ ngày** (`lib/dashboard.ts`
  `viewsDeltaComparable`: `currentDays >= ⌈previousDays × 0.7⌉`, chỉ đếm ngày `is_complete=true`).
  Thiếu nhiều hơn → `viewsDeltaPct = null` + `viewsDeltaInsufficientData = true`, UI hiện "chưa đủ dữ
  liệu kỳ này", **không** hiện số âm giả. Ngày `is_complete=false` cũng bị loại khỏi tổng `views` của
  dashboard (khớp cách `lib/kpi.ts` loại khỏi KPI). Lý do: cửa sổ tính từ hôm nay luôn hụt đuôi (hôm
  nay chưa sync + Studio trễ 2 ngày) → cộng thô "ngày có số" của kỳ mỏng chia cho kỳ đủ ra −90% giả
  (27/08/2026). `/channels` mặc định "7 ngày qua"; các trang khác vẫn "Toàn bộ thời gian".
- **"Tăng trưởng follower" (ô Tổng quan) và `weekStats` (4 thẻ đầu Tổng quan) luôn là tuần lịch cố
  định** (thứ Hai giờ VN → hôm nay, `lib/dashboard.ts` `thisWeekRangeVn()`), **không** phụ thuộc bộ
  lọc `?from=`/`?to=` đang chọn trên trang (04/09/2026, theo yêu cầu). Lý do: kỳ mặc định "Toàn bộ
  thời gian" từng đẩy kỳ so sánh lùi về trước khi kênh tồn tại → `followersGain = null` bị coerce
  thành "+0" giả (bug đã sửa). `weekStats.likes` là tổng thô `data_snapshot.likes` (chỉ
  `studio_import` ghi, không gate độ phủ như views) — số sẽ thấp giữa tuần tới khi Manager upload
  file Studio thứ Tư, đánh đổi có chủ đích (theo yêu cầu, không chặn bằng "chưa đủ dữ liệu"). Chi
  tiết: [docs/PROGRESS.md](docs/PROGRESS.md) mục "weekStats — tăng trưởng theo tuần lịch cố định".
- ⚠️ **Không dùng `Content.csv` để đếm số video** — cap cứng 15 dòng, bỏ sót video mới nhất, thứ tự
  không đoán được (đã kiểm chứng trên data thật). Số video lấy từ `video_count` của Display API.
  `Content.csv` chỉ dùng cho thư viện top video (P1).
- Parser import phải xử lý đúng các bẫy ở [docs/CSV_FORMAT.md](docs/CSV_FORMAT.md): BOM đầu file,
  ngày tháng có thể là tiếng Việt hoặc tiếng Anh tuỳ ngôn ngữ TikTok Studio lúc export, không có
  năm trong ngày, giá trị `"undefined"` phải parse thành `null` chứ không phải `0`.
- **Studio trễ 2 ngày.** Import chỉ ghi đè ngày `< ngàyImport − 1` (cửa sổ chốt) → ngày mới nhất ghi
  được là `ngàyImport − 2`; đúng 2 ngày trễ giữ nguyên số `display_api` (đổi từ `− 3` ngày
  25/08/2026, theo yêu cầu — mốc cũ vứt mất 2 ngày file đã có số đầy đủ). Không bao giờ ghi đè số
  thật bằng `undefined`/`null` — ngày Studio chưa xử lý xong về với `Total Viewers: undefined` kèm
  `0` ở New/Returning, `lib/import/viewers.ts` bỏ cả cụm để nó không lọt thành row `studio_import`
  rỗng che mất `display_api`.
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
- **Engagement rate `(like+comment+share)/view` không còn hiển thị ở bất kỳ màn nào** (Tổng quan, kênh,
  Creator, Team) — đã thay bằng **Tổng số like** (like mới nhất cộng dồn từng video, không theo kỳ,
  không có badge so kỳ trước) ở mọi chỗ trước đây hiện tỷ lệ tương tác (22/08/2026, theo yêu cầu, đánh
  đổi có chủ đích — quy tắc "chỉ số dẫn báo duy nhất" trước đó đã bỏ). Hàm thuần `engagementRate()` và
  cột `data_snapshot.likes/comments/shares` vẫn còn trong code (parser CSV vẫn ghi) — không dùng ở UI
  hiện tại nhưng đừng xoá, có thể cần lại sau. Chi tiết: [PROGRESS.md](docs/PROGRESS.md) mục "Tỷ lệ
  tương tác → Lượt tim, toàn app".
- `followersDiff` **không lưu vào DB** — tự tính từ chuỗi `followers` (cột gốc trong CSV bị sai, xem dưới).
- **Xoá Kênh/Nhân sự là xoá thật** (21/08/2026, theo yêu cầu — không phải soft-delete), Manager-only,
  UI bắt gõ đúng tên để xác nhận (`ConfirmDeleteForm`). Xoá kênh **chặn hẳn** nếu kênh có
  `kpi_cycle.status = 'final'` — số liệu đã chốt không được mất kèm channel. Cả hai ghi `audit_log`
  sau khi xoá xong. Team xoá vẫn chỉ gỡ gán (`on delete set null`) — không đổi, không mất dữ liệu.
- **Đăng nhập bằng `username`, không phải email** (22/08/2026, theo yêu cầu) — cả Manager lẫn
  Creator. Cột `email` vẫn còn (Supabase Auth bắt buộc phải có nội bộ) nhưng không hiển thị/không
  gõ được nữa. Đừng thêm field email vào form tạo/sửa tài khoản hay hiển thị lại `.email` ở UI —
  dùng `.username`. **Gõ email thật ở ô đăng nhập cũng không vào được nữa** (siết thêm 22/08/2026,
  theo yêu cầu riêng) — `resolveLoginEmail()` (`lib/auth.ts`) chỉ chấp nhận `username` khớp đúng
  hàng trong `manager`/`creator`, không còn fallback nào cho input có "@". Chi tiết:
  [docs/DATABASE_ERD.md](docs/DATABASE_ERD.md) mục "Auth".

## Quy ước code

- Mọi truy cập TikTok data phải đi qua interface `TikTokDataProvider` — không gọi thẳng Business API
  từ business logic (để đổi nguồn/fallback vendor không phải sửa core).
- Tính toán `progress` ở **server-side**, không tính lại ở client (tránh lệch số giữa các màn hình).
- **Múi giờ: cột `date` = ngày lịch `Asia/Ho_Chi_Minh`**, không phải UTC. Studio export tổng theo ngày
  nên không quy đổi múi giờ được; chỉ timestamp từ Display API cần đổi sang giờ VN trước khi lấy phần
  ngày. `timestamptz` (created_at, hạn token) vẫn lưu UTC bình thường. Cron chạy ~23:30 giờ VN
  (đổi từ 03:00 ngày 24/08/2026 — xem [docs/DISPLAY_API.md](docs/DISPLAY_API.md) bẫy #12).
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
- **Chỉ link trỏ RA NGOÀI hệ thống** (ra tiktok.com, không phải link nội bộ) mới mở tab mới — `target="_blank" rel="noopener noreferrer"` trên thẻ `<a>` thường, không dùng `next/link`'s `Link` cho link ngoài. Link nội bộ (`<Link>` từ `next/link`) vẫn điều hướng bình thường trong cùng tab, không tự đổi (24/08/2026: có thử áp `target="_blank"` cho toàn bộ link nội bộ theo yêu cầu, sau đó yêu cầu rút lại — chỉ giữ cho link ngoài).
- **Mọi CSS chọn theo thẻ HTML trần trong `app/globals.css` (`a {}`, `button {}`...) phải nằm trong
  `@layer base`**, không viết trần ngoài layer nào — luật ngoài layer thắng mọi class Tailwind
  (`text-ink-2`...) bất kể độ cụ thể, vì Tailwind v4 phát class trong `@layer utilities`. Bug thật đã
  gặp: `a { color: red }` viết trần khiến mọi `<Link>` cố đặt màu khác đỏ đều bị ép về đỏ, 17 file dính
  (26/08/2026) — xem [docs/PROGRESS.md](docs/PROGRESS.md) mục "Bug màu link".

## Cách làm việc với dự án này

- **Chủ động đề xuất tài liệu mới.** Khi phát hiện một loại thông tin sẽ bị hỏi đi hỏi lại hoặc dễ
  làm sai ở phiên sau (quy ước, quyết định kiến trúc, cách chạy, tham chiếu ngoài), đề xuất tạo doc
  tương ứng ngay — hoặc bổ sung vào `CLAUDE.md` nếu là quy tắc ngắn. Không đợi được yêu cầu.
- **Phản biện khi thấy hướng đi sai**, kèm lý do và phương án thay thế — không im lặng làm theo.
- **Không biết thì hỏi ngay — không dự đoán, không đoán mò** (theo yêu cầu riêng, nhắc lại có chủ đích
  vì đây là quy tắc dễ quên giữa lúc đang làm nhanh). Áp dụng mọi lúc, không riêng gì quyết định khó
  sửa — nhưng đặc biệt quan trọng với schema, phân quyền, cách tính KPI, hoặc bất kỳ chỗ nào một suy
  đoán sai sẽ khó phát hiện lại sau.
- Cập nhật `docs/TASKS.md` sau khi hoàn thành task; cập nhật `docs/PRODUCT_SPEC.md` khi có
  quyết định sản phẩm mới.
- **Giữ `CLAUDE.md` ngắn — file này auto-load vào MỌI phiên, phình ra là tốn context mọi lúc dù task
  đang làm không liên quan.** Xong 1 milestone: chi tiết đầy đủ ("X đã xong — có gì dùng được ngay")
  viết vào [docs/PROGRESS.md](docs/PROGRESS.md), **không** viết thẳng vào mục "Trạng thái" của
  `CLAUDE.md`. Mục "Trạng thái" ở đây chỉ giữ: 1 dòng milestone hiện tại + việc tiếp theo, việc đang
  treo/chặn thật (không phải lịch sử), và vài dòng reference hay tra (deploy URL, project id). Nếu
  sửa xong mà "Trạng thái" dài hơn ~40 dòng, đó là dấu hiệu cần dọn bớt sang PROGRESS.md.

## Trạng thái

**Milestone hiện tại: polish biểu đồ xu hướng + `/kpi` dropdown (07/09) — nhãn tuần theo ngày, kỳ
cuối dở dang vẽ nét đứt, biểu đồ tuần LUÔN có cột "tuần này", tooltip hover, mỗi kênh 1 dòng gập/mở.
3 commit đầu đã `push` lên `main`; còn 1 commit ("cột tuần này") đang chờ push.** Chi tiết:
[docs/PROGRESS.md](docs/PROGRESS.md) mục "Biểu đồ xu hướng — polish 07/09/2026". M6 (chốt sổ KPI) +
`/kpi` danh sách kênh + M5 (KPI Cycle) +
M4 + M3c + Đợt 1/2 + Team + drill-down + CRUD đầy đủ + đăng nhập username + Display API 9/9 kênh
thật + bỏ lưu zip Storage — tất cả đã lên `main`. Chi tiết từng milestone:
[docs/PROGRESS.md](docs/PROGRESS.md) (tìm theo tên mục). Checklist: [docs/TASKS.md](docs/TASKS.md).

✅ **Cron `display_api` chạy ổn định từ 29/08** — không thủng ngày nào tới 04/09.
`is_complete=false` chỉ còn ở 25/08 và 28/08 (hệ quả một lần của khoảng thủng cron 26–27/08, đã tự
khỏi như dự đoán — xác nhận bằng `node scripts/diagnose-data.mjs` mục A). Gốc lỗi cron cũ + chi tiết:
[docs/PROGRESS.md](docs/PROGRESS.md) mục "Cron display_api chưa từng chạy".

🎯 **Badge độ phủ nguồn thay cho tách 2 tab Display API/Studio (05/09/2026).** Cân nhắc tách hẳn màn
báo cáo thành 2 tab để hết phải hoà giải 2 nguồn hay lệch nhau — **từ chối**: đẩy quyết định kỹ thuật
xuống Manager (không ai có cơ sở chọn tin số nào), và đổi hình dạng lỗi chứ không xoá lỗi. Badge
"x% kỳ này đã đối chiếu" trên Tổng quan (`lib/dashboard.ts` `aggregateSourceCoverage()`) giữ một con
số duy nhất nhưng lộ ra nó dựa trên bao nhiêu phần đã đối chiếu. Cân nhắc đầy đủ + số liệu đo được:
[docs/PROGRESS.md](docs/PROGRESS.md) mục "Badge độ phủ nguồn". Đề xuất chưa làm: ẩn `%` "so kỳ
trước" khi 2 kỳ lệch cơ cấu nguồn; nhân badge sang `/channels`/chi tiết kênh/Nhân sự/Team.

❌ **TikTok từ chối đơn Production (04/09/2026), sai đúng 1 field: Website URL** trỏ tới trang login
trần. Cách chữa TikTok chỉ định là khai **tài khoản test trong ô "App review"** lúc resubmit — KHÔNG
phải dựng landing page. Đã có chốt read-only cho tài khoản demo (`DEMO_CREATOR_USERNAME`, xem
`lib/auth.ts` `isDemoAccount`) + Apply Reason mới soạn lại vừa giới hạn 1000 ký tự thật của portal.
Quy trình + bẫy portal đầy đủ: [docs/DISPLAY_API.md](docs/DISPLAY_API.md) mục "Nộp duyệt Production".

⏳ **Đang mượn kênh "Làm Nông Thông Thái" cho tài khoản demo `test`** (đã gán 04/09/2026, phục vụ đợt
duyệt app TikTok). Creator thật: **Phạm Minh Trí** — **gán lại ngay khi app được duyệt**, rồi xoá tài khoản
`test` và biến `DEMO_CREATOR_USERNAME`.

✅ **Import nhầm kênh đã có chặn (05/09/2026)** — `lib/import/channel-guard.ts`, chạy cả ở bước xem
trước. Bắt bằng `@handle` trong `video_link` của `Content.csv` (mạnh nhất) và handle nhúng trong tên
file zip Studio. Fail-closed khi chứng minh được lệch, fail-open khi không đọc ra handle nào (file bị
rename) — chặn nhầm thì người dùng đọc thông báo sửa được, cho lọt thì hỏng dữ liệu âm thầm. Bẫy này
đã hỏng dữ liệu thật 2 lần trước khi có chặn: xem [docs/PROGRESS.md](docs/PROGRESS.md) mục "Import
nhầm kênh".

🔑 Manager thật đăng nhập bằng username `andang`. `TOKEN_ENCRYPTION_KEY` trên Vercel hợp lệ — **không
sinh khoá mới**, cần ở `.env.local` thì copy nguyên giá trị từ Vercel xuống.

🔒 `.claude/settings.json` chặn cứng `git push` — chủ động, không phải quên cấu hình. Push do người
dùng tự chạy.

Deploy: `https://ahd-dashboard-dusky.vercel.app`. Git: repo **private**
`https://github.com/duytienitptit/ahd-dashboard`, branch `main`. Supabase: project
`ftdfmclxkjmrfikdipnt`, region Tokyo. **Function region: `hkg1`** (Hong Kong, đặt ở Vercel Project
Settings → Functions, không có trong code) → mỗi round-trip tới DB ~50ms; nghi màn hình chậm thì
**đếm số query TUẦN TỰ trước khi đổ lỗi DB**. `getCurrentUser()` (`lib/auth.ts`) bọc `cache()` của
React vì lý do đó — **giữ nguyên**. Chẩn đoán Display API read-only: `node scripts/diagnose-oauth.mjs`,
`node scripts/diagnose-data.mjs`.

### Việc tiếp theo

1. **`git push`** — 1 commit đang chờ trên `main` local (`fix(dashboard): biểu đồ tuần luôn có cột
   "tuần này"`), `.claude/settings.json` chặn cứng push nên người dùng tự chạy. Vercel auto-redeploy.
2. **Resubmit đơn Production TikTok**: đã có Creator demo `test` + Apply Reason mới soạn; còn đặt
   `DEMO_CREATOR_USERNAME` trên Vercel, quyết định có gán 1 kênh cho tài khoản demo không (3 màn "của
   tôi" rỗng nếu không), rồi resubmit theo đúng quy trình portal ở
   [docs/DISPLAY_API.md](docs/DISPLAY_API.md).
3. **Kỳ KPI đầu tiên đủ điều kiện chốt sổ, chưa ai bấm**: Cùng Anh Đi Muôn Nơi, 24→30/08 — cả 7/7
   ngày đã có `studio_import`, đã qua `periodEnd + 3`. `kpi_cycle.status` vẫn `draft`.
4. **Import lại bộ zip Studio đã upload ngày 25/08** — dữ liệu 22-23/08 chỉ xuất hiện sau khi import
   lại (cửa sổ chốt cũ chỉ ghi tới 21/08, đã sửa code nhưng chưa import lại). Ngày 24/08 không nguồn
   nào có, tự đầy ở kỳ import sau (từ 26/08). **4/9 kênh chưa từng có `studio_import` nào** (Mộc Đi
   Rừng, Tiến Sĩ Sprout, Vườn Của Hant, **Bé Na** — Bé Na vào danh sách này sau khi dọn dữ liệu import
   nhầm 05/09, xem PROGRESS.md) → chưa chốt sổ KPI được. **Bé Na cần export lại file Studio của chính
   nó** và Làm Nông Thông Thái cần import lại bộ file đã bị ghi nhầm sang Bé Na.
5. **Hỏi team: Bé Na có chủ ý xoá 7 video không?** (đăng 29/07→19/08, còn thấy ở snapshot 25/08, mất
   khỏi response 28/08). Code xử lý đúng, chỉ là chuyện vận hành cần biết. Đã loại trừ khả năng do
   import nhầm kênh: 57 video của Bé Na đều có `video_link` mang đúng `@c.ba.nng.sn2` (kiểm 05/09).

Vận hành: team đã nhận việc export & upload file Studio hàng tuần (thứ Tư, cho tuần trước đó). Các
mục còn treo: xem mục 8 [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md).

🎨 **Màu theo chỉ số áp TOÀN APP** — 4 token `blue`/`purple`/`orange`/`crimson`, nguồn sự thật:
[lib/metric-tone.ts](lib/metric-tone.ts). Chi tiết: [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) mục
"Màu theo chỉ số". Ngoại lệ: thanh tiến độ KPI dùng 🟢🟡🔴, không dùng bộ màu này.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
