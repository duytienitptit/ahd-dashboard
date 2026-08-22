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

**M4 + M3c + Đợt 1 (sửa dữ liệu) + Đợt 2 (thiết kế lại UI) + tính năng Team + dựng lại drill-down
Team → Nhân sự → Kênh đều đã xong, đã commit và **push lên `main`** (22/08/2026, commit `9d17647`).**
Chi tiết đầy đủ từng phần ở [docs/PROGRESS.md](docs/PROGRESS.md) (mục "Đợt 1 sửa dữ liệu", "Đợt 2...",
"Team — nhóm Creator", "Team → Nhân sự → Kênh — dựng lại drill-down"). Checklist ở
[docs/TASKS.md](docs/TASKS.md) mục "Đợt 1 & Đợt 2", "Team" và "Team → Nhân sự → Kênh". Schema và code
giờ khớp nhau — 4 migration (`team`, `creator.team_id`, RLS Creator-upload, `update_channel_name`) đã
lên Supabase production từ 21/08, code dùng chúng cũng đã lên `main`.

⚠️ **Cả 2 kênh đang MẤT KẾT NỐI Display API** (`channel_oauth` rỗng, cố ý xoá sau sự cố sai tài
khoản — xem PROGRESS.md mục "Đợt 1"). Việc người dùng cần làm: vào `/connections`, bấm "Kết nối"
lại cho cả 2 kênh bằng **đúng** tài khoản TikTok của từng kênh.

⚠️ **Bẫy vận hành, chưa có validation chặn**: import file Studio chọn nhầm kênh ở dropdown không báo
lỗi gì — dữ liệu vẫn ghi, chỉ sai `channel_id`. Đã xảy ra thật 1 lần, đã dọn xong. Chưa sửa tại
nguồn — nhắc người import kiểm tra kỹ dropdown "1. Chọn kênh" trước khi tải file lên.

🔑 `TOKEN_ENCRYPTION_KEY` trên Vercel hợp lệ — **không sinh khoá mới**. Cần dùng ở `.env.local` thì
copy nguyên giá trị từ Vercel Environment Variables xuống.

🔒 `.claude/settings.json` chặn cứng `git push` (nhóm chung với `rm -rf`, `git reset --hard`) — chủ
động, không phải quên cấu hình. Push phải do người dùng tự chạy hoặc tự nới rule, Claude không tự làm.

Deploy: `https://ahd-dashboard-dusky.vercel.app` (kèm `/terms` `/privacy`) — Vercel tự build từ commit
`9d17647` (không có Vercel CLI trong máy để tự xác nhận build pass, kiểm tra trên Vercel dashboard).
Git: repo **private** `https://github.com/duytienitptit/ahd-dashboard`, branch `main`, commit mới
nhất `9d17647`.
Supabase: project `ftdfmclxkjmrfikdipnt`, region Tokyo. **Function region: `hkg1`** (Hong Kong) —
đặt ở Vercel Project Settings → Functions, không có trong code. Chi tiết:
[docs/PROGRESS.md](docs/PROGRESS.md) mục "Chuẩn bị trước M4".

Supabase ở Tokyo còn function ở Hong Kong → mỗi round-trip tới DB ~50ms. Nếu về sau một màn hình
nào chậm bất thường, **đếm số query TUẦN TỰ tới Supabase trước khi đổ lỗi cho DB**. Cùng lý do đó,
`getCurrentUser()` trong `lib/auth.ts` bọc `cache()` của React — **giữ nguyên**.

### Việc tiếp theo

1. Vào `/connections` kết nối lại 2 kênh bằng đúng tài khoản TikTok thật (Display API đang mất kết nối).
2. **M5 (KPI Cycle)** — chưa bắt đầu, không bị chặn bởi mục trên. `POST /api/kpi-cycles` trước (tự
   chụp `followersAtStart`, chặn trùng khoảng ngày), rồi hàm tính `progress`/`overallStatus` theo
   công thức ở [docs/API_SPEC.md](docs/API_SPEC.md) mục "Công thức progress". `kpiSummary`/
   `myChannels.hasActiveKpi` trong `lib/dashboard.ts` hiện luôn rỗng/false vì `kpi_cycle` chưa có
   row — M5 tạo cycle xong thì nối lại 2 chỗ đó.

Vận hành: team đã nhận việc export & upload file Studio hàng tuần (thứ Tư, cho tuần trước đó).
Các mục còn treo: xem mục 8 [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md).
