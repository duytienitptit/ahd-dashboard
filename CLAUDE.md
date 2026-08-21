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
- **Giữ `CLAUDE.md` ngắn — file này auto-load vào MỌI phiên, phình ra là tốn context mọi lúc dù task
  đang làm không liên quan.** Xong 1 milestone: chi tiết đầy đủ ("X đã xong — có gì dùng được ngay")
  viết vào [docs/PROGRESS.md](docs/PROGRESS.md), **không** viết thẳng vào mục "Trạng thái" của
  `CLAUDE.md`. Mục "Trạng thái" ở đây chỉ giữ: 1 dòng milestone hiện tại + việc tiếp theo, việc đang
  treo/chặn thật (không phải lịch sử), và vài dòng reference hay tra (deploy URL, project id). Nếu
  sửa xong mà "Trạng thái" dài hơn ~40 dòng, đó là dấu hiệu cần dọn bớt sang PROGRESS.md.

## Trạng thái

**M4 xong toàn bộ + M3c (nhập tay) xong sớm theo phản hồi (21/08/2026). Việc tiếp theo: bắt đầu code
M5 (KPI Cycle).** Lịch sử chi tiết từng milestone (quyết định lúc code, deviation, bug bắt được lúc
kiểm chứng) đã chuyển sang [docs/PROGRESS.md](docs/PROGRESS.md) — file này chỉ giữ trạng thái
**hiện tại** và việc **đang treo**, không phải nhật ký đầy đủ.

🔑 **`TOKEN_ENCRYPTION_KEY`: KHÔNG được sinh khoá mới nữa.** Khoá trên Vercel đã được chứng minh hợp lệ
(21/08/2026 — 2 kênh `nong.nghiep.xanh.17` + `vuonvuonvang` kết nối thành công, mà `lib/crypto/token.ts`
throw cứng nếu khoá không đủ 32 byte hex). Token thật đang nằm trong `channel_oauth` **mã hoá bằng
khoá đó**. Sinh khoá mới = mất toàn bộ token, phải OAuth lại từ đầu. Nếu `.env.local` cần chạy sync ở
máy: **copy nguyên giá trị từ Vercel Environment Variables xuống**, không tạo giá trị mới.

Display API đã kết nối thật cho 2 kênh. ⏳ **Lần sync đầu là bootstrap** — ghi `video_views = null`
(chưa có mốc để trừ), chỉ gieo `video_snapshot`. Phải qua lần sync THỨ HAI mới có số view-trong-kỳ
thật, và số sạch trọn 24h chỉ có từ lần cron thứ ba (03:00 → 03:00) — delta đầu tiên ứng với khoảng
thời gian lẻ, đừng dùng nó đối chiếu Studio. M0 còn 1 mục kiểm chứng treo (đo view-trong-ngày thật),
mở khoá được sau khi đủ 2-3 lần sync.

Deploy: `https://ahd-dashboard-dusky.vercel.app` (kèm `/terms` `/privacy`).
Git: repo **private** `https://github.com/duytienitptit/ahd-dashboard`, branch `main`.
Supabase: project `ftdfmclxkjmrfikdipnt`, region Tokyo. **Function region: `hkg1`** (Hong Kong) —
đặt ở Vercel Project Settings → Functions, không có trong code. TTFB `iad1` mặc định 2.1-2.5s → sau
khi đổi `hkg1` còn ~0.2s. Đã thử 2 cách đặt qua code (`vercel.json` `"regions"`, `preferredRegion` ở
`app/layout.tsx`) — **đều không ăn**, phải đổi qua dashboard Vercel; chi tiết ở
[docs/PROGRESS.md](docs/PROGRESS.md) mục "Chuẩn bị trước M4".

Supabase ở Tokyo còn function ở Hong Kong → mỗi round-trip tới DB ~50ms. Nếu về sau một màn hình
nào chậm bất thường, **đếm số query TUẦN TỰ tới Supabase trước khi đổ lỗi cho DB** — chi phí nằm ở
số lượt, không phải khối lượng dữ liệu. Cùng lý do đó, `getCurrentUser()` trong `lib/auth.ts` bọc
`cache()` của React — **giữ nguyên**, không bọc thì mỗi lần chuyển tab tốn gấp đôi round-trip.

### Việc tiếp theo

**Bắt đầu code M5** (KPI Cycle, [docs/TASKS.md](docs/TASKS.md)) — `POST /api/kpi-cycles` trước
(tự chụp `followersAtStart`, chặn trùng khoảng ngày), rồi hàm tính `progress`/`overallStatus` theo
công thức đã có sẵn ở [docs/API_SPEC.md](docs/API_SPEC.md) mục "Công thức progress". M4 đã chừa sẵn
chỗ cắm: `kpiSummary`/`myChannels.hasActiveKpi` trong `lib/dashboard.ts` hiện luôn rỗng/false vì
`kpi_cycle` chưa có row — M5 tạo cycle xong thì 2 chỗ đó cần nối lại cho đúng nghĩa (không phải viết
lại từ đầu, chỉ thay phần luôn-rỗng bằng query thật).

**Việc riêng chỉ người dùng làm được, không chặn M5** (cập nhật 21/08/2026):
1. ✅ Xong — 2 kênh đã kết nối Display API thật.
2. Chờ đủ 2-3 lần cron chạy, rồi đối chiếu số `display_api` với `studio_import` đã có từ M3a — trả
   lời nốt câu hỏi 🔬 còn treo của [docs/DISPLAY_API.md](docs/DISPLAY_API.md) (đo view-trong-ngày
   thật) và xác nhận `isComplete` của `vuonvuonvang` (xem mảng `incomplete[]` trong kết quả sync).

Vận hành: team đã nhận việc export & upload file Studio hàng tuần (thứ Tư, cho tuần trước đó).
Các mục còn treo: xem mục 8 [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md).
