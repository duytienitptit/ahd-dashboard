# TikTok Team Management — Product Spec

## 1. Bài toán

**Mục đích chính: lưu trữ và hiển thị dữ liệu của các kênh TikTok theo thời gian.**
Hệ thống là nơi số liệu của toàn bộ kênh được gom về một chỗ, lưu lại lịch sử, và trình bày sao cho
dễ quan sát — tăng trưởng, so sánh giữa các kênh, xu hướng theo thời gian.

Mỗi kênh có 1 Creator sở hữu. **KPI là một tính năng đặt lên trên tập dữ liệu đó**, không phải xương
sống của sản phẩm: Manager có thể giao chỉ tiêu theo tuần/khoảng ngày và theo dõi tiến độ, nhưng kể
cả khi không đặt KPI nào thì hệ thống vẫn phải có giá trị nhờ việc lưu và hiển thị dữ liệu.

> Hệ quả khi thiết kế: màn hình và API ưu tiên trả lời "dữ liệu các kênh đang thế nào" trước, rồi mới
> đến "có đạt chỉ tiêu không". Không lấy % KPI làm trục sắp xếp mặc định của mọi màn hình.

## 2. Vai trò

| Vai trò | Quyền hạn |
| :--- | :--- |
| Manager | Xem toàn team, giao KPI, phân công kênh, chốt sổ cuối chu kỳ |
| Creator | Xem KPI + tiến độ kênh mình phụ trách, xem chéo số liệu kênh khác |

- Cấu trúc: 1 Manager duy nhất, mô hình phẳng. Schema không hard-code 1 Manager (mở rộng multi-team sau này không cần thiết kế lại).
  **21/08/2026: đã thêm `team`** (bảng `team`, `creator.team_id`) đúng như tiên liệu ở đây — nhưng
  **chỉ là nhãn tổ chức/lọc**, chưa phải biên giới phân quyền (vẫn 1 Manager thấy toàn bộ, Creator vẫn
  cross-channel visibility). Nếu sau này thật sự có nhiều Manager mỗi người chỉ thấy team riêng, đó là
  quyết định RLS mới, cần hỏi lại — xem [DATABASE_ERD.md](DATABASE_ERD.md) mục "`team`".
- Sở hữu kênh: công ty sở hữu toàn bộ, Creator chỉ vận hành. Hiện có **8 kênh**, có sẵn data thật để seed.
- Nền tảng: Web dashboard, desktop-first.
- Đăng nhập: username/password nội bộ (đổi từ email 22/08/2026, theo yêu cầu — không ai cần nhớ/gõ
  email nữa, xem [DATABASE_ERD.md](DATABASE_ERD.md) mục "Auth"). Admin (Manager) tạo tài khoản cho
  Creator — không có tự đăng ký.

## 3. Phạm vi MVP (P0)

Thứ tự phản ánh độ ưu tiên: **lưu & hiển thị dữ liệu trước, KPI sau.**

| # | Hạng mục | Thông số |
| :--- | :--- | :--- |
| 1 | Data pipeline | 2 tầng: **Display API** hằng ngày + **import Studio** cuối tuần (mục 5, [DATA_SOURCES.md](DATA_SOURCES.md)) |
| 2 | Lưu trữ lịch sử | 1 row `DataSnapshot` mỗi `(kênh, ngày, nguồn)`. Nguồn khác nhau cùng ngày tồn tại song song, không đè nhau — đọc theo thứ tự ưu tiên |
| 3 | Hiển thị dữ liệu kênh | Danh sách kênh + trang chi tiết từng kênh: số liệu hiện tại, tăng trưởng, biểu đồ theo thời gian |
| 4 | Bộ lọc & so sánh | Lọc theo Creator / khoảng thời gian / trạng thái; sắp xếp theo nhiều chỉ số; so sánh giữa các kênh |
| 5 | Gán kênh ↔ Creator | 1 kênh = 1 Creator tại 1 thời điểm |
| 6 | Thiết lập KPI | Chu kỳ: tuần hoặc custom date range. Chỉ tiêu: Views, Videos, Followers (**mốc tuyệt đối**, vd. đạt 10.000 fl) |
| 7 | Theo dõi tiến độ KPI | Chính: **"cần X/ngày trong N ngày còn lại"**. Phụ: 🟢🟡🔴 (±10% quanh tiến độ thời gian) + tooltip giải thích. Dự đoán cuối kỳ chỉ hiện sau 50% chu kỳ. Công thức: [API_SPEC.md](API_SPEC.md) |
| 8 | Chốt sổ cuối chu kỳ | Draft → Final. **Không upload file lúc chốt** — chỉ tổng hợp `DataSnapshot` đã có. Mở khoá khi qua `periodEnd + 3 ngày` và mọi ngày đã có `studio_import` |

### Chỉ số suy ra — rẻ, có sẵn data, đừng bỏ phí

Tất cả tính được từ dữ liệu đã có, không cần thêm nguồn nào:

| Chỉ số | Công thức | Trả lời câu gì |
| :--- | :--- | :--- |
| **Engagement rate** | `(like + comment + share) / view` | **Chỉ số dẫn báo** — nội dung tụt tương tác trước, tụt view sau vài ngày. Thay thế cho watch time (không có trong export) |
| View / video | `view kỳ / số video kỳ` | Kênh nào ít video mà hiệu quả |
| Tỷ lệ khán giả mới | `New Viewers / Total Viewers` | Sống nhờ người mới hay khán giả trung thành |
| Hiệu quả theo hashtag | Tách `#(\w+)` từ tiêu đề, gộp view TB | Chủ đề nào nên làm tiếp ([CSV_FORMAT.md](CSV_FORMAT.md)) |
| Giờ vàng đăng bài | Gộp `FollowerActivity.csv` theo giờ | Nên đăng lúc mấy giờ |

Riêng engagement rate nên đưa vào MVP: nó là chỉ số **duy nhất mang tính dự báo** trong toàn bộ tập
dữ liệu — mọi chỉ số còn lại (view, follower) đều chỉ báo tin sau khi việc đã rồi.

### Ngoài phạm vi — đã cân nhắc và chốt KHÔNG làm

Ghi lại để phiên sau không bàn lại:

| Hạng mục | Lý do loại |
| :--- | :--- |
| Quản trị nhân sự (chấm công, nghỉ phép, lương) | Hệ thống chỉ đo **hiệu suất kênh**, không đo người. Creator là nhãn gắn vào kênh |
| Khối lượng công việc / thời gian bỏ ra | Như trên — không thu thập đầu vào, chỉ đo đầu ra |
| Ghi chú định tính của Manager theo mốc thời gian | Giữ hệ thống thuần định lượng; ghi chú để ở công cụ khác |
| Watch time, tỷ lệ xem hết, nguồn traffic | Không có trong export, nhập tay quá tốn công. Dùng engagement rate thay thế |
| Kế hoạch nội dung / video sắp đăng | Chỉ theo dõi kết quả đã đăng |

Ngoài MVP (làm sau, không loại): Leaderboard/badge, thư viện top video, Creator Profile, cảnh báo chủ động, app mobile, multi-Manager.

## 4. Roadmap sau MVP

| Giai đoạn | Hạng mục |
| :--- | :--- |
| P1 | Leaderboard & Badge thi đua |
| P1 | Open Benchmarking — xem chéo, thư viện top video |
| P1 | Creator Profile — trang tổng kết cá nhân |
| P2 | Cảnh báo chủ động (kênh 🔴, gần hết chu kỳ) — kênh gửi chưa chọn |
| P2 | Multi-Manager / multi-team |
| P2 | Engine tính thưởng/lương tự động từ số liệu Final |

## 5. Data Pipeline

Chi tiết đầy đủ (so sánh phương án, giá, giới hạn từng nguồn): **[DATA_SOURCES.md](DATA_SOURCES.md)**.

**Kiến trúc 2 tầng:**

| Tầng | Nguồn | Chỉ số | Nhãn |
| :--- | :--- | :--- | :--- |
| Hằng ngày | **TikTok Display API** (OAuth 1 lần/kênh) | follower, video_count, view (suy từ delta từng video) | *tạm tính* |
| Cuối tuần | **Import file TikTok Studio** (4 zip/kênh) | tất cả + profile views, viewers, top video | *đã đối chiếu* → dùng chốt sổ |

Quyết định then chốt: dùng **Display API**, không phải Business API. Display API nhẹ hơn hẳn (chỉ cần
OAuth từng kênh — công ty sở hữu cả 8 nên tự làm được; có sandbox cho tối đa 10 tài khoản, không cần
chờ duyệt để bắt đầu) và đã trả đủ cả 3 chỉ số nhóm nóng. Business API hạ xuống "đánh giá lại sau".

**Quy trình import — chạy thứ Tư cho tuần trước đó, không phải cuối tuần:**
1. Export 4 zip/kênh từ TikTok Studio (Overview, Followers, Viewers, Content) — cấu trúc thật và các
   bẫy parser: [CSV_FORMAT.md](CSV_FORMAT.md).
2. Upload thẳng `.zip` (không tự giải nén) — chọn kênh, kéo-thả.
3. Server giải nén, parse, ghi đè `DataSnapshot` với `source = studio_import` — **chỉ những ngày
   nằm ngoài cửa sổ chốt** (`< ngàyImport − 1`, tức ghi tới `ngàyImport − 2`).
4. Lệch >10% so với số `display_api` cùng ngày → **cảnh báo**, không im lặng ghi đè.

⏱ **Studio trễ 2 ngày** (đã kiểm chứng 2 lần: export 18/08 số thật đến 16/08; export 25/08 số thật
đến 23/08). Vì vậy import vào thứ Tư thì cả 7 ngày của tuần trước mới đủ số. Hệ quả: **chu kỳ KPI chỉ
chốt sổ được sau `periodEnd + 3 ngày`** và khi mọi ngày trong kỳ đã có `studio_import`.

Thứ Ba **không** thay được thứ Tư: import thứ Ba đã đủ số cho cả tuần (ghi tới Chủ Nhật) nhưng chưa
qua `periodEnd + 3 ngày`, nên nút chốt sổ vẫn khoá. Muốn chốt thứ Ba thì phải hạ luôn điều kiện đó
xuống `+ 2` — bỏ nốt lớp an toàn cuối trên chính con số dùng tính thưởng, chưa làm.

⚠️ **`Content.csv` không dùng để đếm số video** — đã kiểm chứng: cap cứng 15 dòng, không theo ngày,
bỏ sót video mới nhất. Số video lấy từ `video_count` của Display API. Xem [CSV_FORMAT.md](CSV_FORMAT.md).

📌 **Quyết định 19/08/2026 — parser xử lý cả 7 file trong zip ngay từ MVP**, kể cả `FollowerActivity`,
`FollowerGender`, `FollowerTopTerritories`. Lý do: đây là dữ liệu **không lấy lại được về quá khứ**
(`FollowerActivity.csv` chỉ có 7 ngày gần nhất; hai file nhân khẩu học không có lịch sử), trong khi
chi phí chỉ là 3 parser file phẳng. Hoãn sang P1 = mất vĩnh viễn mọi tuần trước khi làm.

Kiến trúc code: bọc sau interface nội bộ để đổi/thêm nguồn không phải sửa tầng trên.
```
interface TikTokDataProvider {
  getChannelStats(handle, dateRange): { views, videos, followers }
}
```

## 6. Data Model & công thức

**Schema đầy đủ: [DATABASE_ERD.md](DATABASE_ERD.md)** — đó là nguồn sự thật duy nhất về bảng, cột,
ràng buộc và index. Mục này chỉ giữ quy tắc nghiệp vụ.

| Quy tắc | Nội dung |
| :--- | :--- |
| Khoá sau chốt sổ | `kpi_cycle.status = final` → số liệu khoá; mọi thay đổi phải ghi `audit_log` |
| `followers_at_start` | Chụp 1 lần khi tạo cycle, **không bao giờ sửa** |
| Nhiều nguồn 1 ngày | Đọc theo thứ tự ưu tiên, qua hàm dùng chung ([DATABASE_ERD.md](DATABASE_ERD.md)) |
| Múi giờ | Cột `date` = ngày lịch `Asia/Ho_Chi_Minh` |

**Công thức % tiến độ** (chi tiết + ngưỡng trạng thái: [API_SPEC.md](API_SPEC.md)):
- Views / Videos — số phát sinh trong kỳ: `% = đạt trong kỳ / target`
- Followers — **mốc tuyệt đối**:
  `% = (followersHiệnTại − followersAtStart) / (targetFollowers − followersAtStart)`
  - Ví dụ: đầu kỳ 7.800, target 9.000, hiện tại 8.200 → `(8200−7800)/(9000−7800) = 33%`
- `videosTrongKỳ` = đếm `content_video` có `posted_at` trong kỳ (**không** lấy hiệu `video_count`)

## 7. Triển khai

- Người code: chính người dùng, tự triển khai (vibe coding).
- Hạ tầng: ưu tiên nền tảng free tier (website nội bộ, data nhỏ — 8 kênh), mở rộng trả phí sau nếu cần.
- Tech stack:
  - Frontend + Backend: **Next.js**
  - Database + Auth: **Supabase** (Postgres, free tier — Auth khớp yêu cầu username/password do Admin
    cấp; Auth tự nó vẫn cần một email nội bộ, xem [DATABASE_ERD.md](DATABASE_ERD.md) mục "Auth")
  - Hosting: **Vercel** (free tier)

## 8. Chưa chốt

- [ ] **Kiểm chứng Display API sandbox** — có gọi được `user.info.stats` + `video.list` đầy đủ cho 8 kênh không, hay bắt buộc phải duyệt app. Đây là giả định lớn nhất đang đỡ cả kiến trúc, cần thử sớm nhất
- [ ] View suy từ delta có khớp với `Video Views` của TikTok Studio không, lệch bao nhiêu % — đo trong vài tuần đầu
- [ ] Nếu lỡ quên upload 1 tuần: gộp bù tuần sau hay chấp nhận mất phần dữ liệu nguội tuần đó (đặc biệt `FollowerActivity.csv` chỉ có 7 ngày — bỏ tuần là mất vĩnh viễn)
- [ ] Vendor scraping fallback cụ thể, nếu Display API không khả thi
- [ ] **Chưa ép đổi mật khẩu lần đăng nhập đầu** — Manager tự đặt mật khẩu tạm khi tạo tài khoản Creator
      (M2, `POST /api/creators`), Creator dùng nguyên mật khẩu đó trừ khi tự đổi. Manager **có thể**
      đặt lại mật khẩu giúp Creator bất kỳ lúc nào (21/08/2026, `/creators` → Sửa → Đổi mật khẩu) —
      vẫn **chưa có** màn hình để Creator tự đổi mật khẩu của chính mình.
- [ ] **Chưa gửi email mời** — chưa cấu hình SMTP. Sau khi tạo tài khoản Creator, mật khẩu tạm chỉ hiện
      một lần trên màn hình cho Manager (`/creators`), Manager phải tự gửi riêng cho Creator qua kênh
      khác (chat nội bộ, gặp trực tiếp…).

### Đã chốt

- [x] **Ai export & upload file hàng tuần** — team đã nhận việc này, cam kết upload đúng thời hạn.
      Lịch: **thứ Tư** cho tuần trước đó (Studio trễ 2 ngày, xem mục 5). Khối lượng 4 zip × 8 kênh.
