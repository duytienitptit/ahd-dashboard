# M0 — Bộ kiểm chứng Display API

Script độc lập (Node ≥ 18, không cài package nào) để trả lời 5 câu hỏi ở
[docs/DISPLAY_API.md §"Việc cần kiểm chứng (M0)"](../../docs/DISPLAY_API.md) **trước khi viết dòng
code ứng dụng nào**. Cố ý nằm ngoài Next.js: nếu kết quả cho thấy giả định sai, không có code nào
phải vứt đi.

Kết quả ghi ra `out/` (đã gitignore): snapshot JSON, findings JSON và một báo cáo Markdown điền sẵn
checklist M0 kèm hệ quả kiến trúc.

---

## Bước 0 — Việc phải làm tay trên developer portal

Phần này bắt buộc bạn tự làm, script không thay được (cần đăng nhập tài khoản của bạn).

1. Vào <https://developers.tiktok.com> → **Manage apps** → tạo app mới.
2. Chuyển app sang chế độ **Sandbox** (nút Production/Sandbox ở đầu trang app) → **Create Sandbox**.
   Cấu hình Products/Scopes/URL của Production và Sandbox **tách biệt hoàn toàn** — làm ở Sandbox,
   không phải Production, kể cả khi chỉ đang kiểm chứng.
3. Trong Sandbox, **Add products** → thêm **Login Kit**.
   ⚠️ **Không có tile "Display API" riêng để Add** — TikTok đã gộp scope của Display API
   (`user.info.stats`, `video.list`) vào Login Kit. Đừng mất công tìm, đây không phải lỗi cấu hình.
4. Vào mục **Scopes** → **Add scopes** → bật đủ 3 scope — **khai báo tường minh**, đừng tin mặc định:
   - `user.info.basic` (tự động có sẵn, gắn nhãn "Included in Login Kit")
   - `user.info.stats` ← trường `follower_count`, `video_count` nằm ở đây
   - `video.list`
5. **Sandbox settings → Target Users → Add account** → thêm kênh TikTok thật.
   TikTok yêu cầu nhập thông tin đăng nhập của chính tài khoản đó — công ty sở hữu cả 8 kênh nên
   làm được, nhưng đây là việc bạn tự thao tác trên portal. Mỗi sandbox tối đa 10 tài khoản.
6. Khai báo **Redirect URI** trong Login Kit — đọc kỹ mục dưới, đây là chỗ vướng phổ biến nhất.
7. **App icon, Terms of Service URL, Privacy Policy URL, Web/Desktop URL đều bắt buộc** ngay ở bước
   tạo Sandbox, không phải chỉ lúc Submit for review. ToS/Privacy/Web URL còn phải **verify quyền sở
   hữu** (mục "URL properties" đầu trang app) — chọn **URL prefix** (không chọn Domain, vì Domain cần
   sửa DNS mà domain `*.vercel.app` dùng chung không sửa được), tải "signature file" TikTok cấp, đặt
   đúng path trên site rồi verify lại.

### Redirect URI — `localhost` KHÔNG dùng được, kể cả `https://localhost`

TikTok bắt redirect URI phải **bắt đầu bằng `https://`**, tuyệt đối, không query string, không `#`.

⚠️ **Đã kiểm chứng 20/08/2026:** không chỉ `http://localhost` — **`https://localhost:3000/...` cũng bị
từ chối thẳng** lúc khai báo, kèm lỗi "Enter a valid redirect uri (localhost is not supported)". Không
có ngoại lệ nào cho localhost dù giao thức gì. Phải dùng **domain thật đã deploy**.

Dùng domain Vercel đã có (task cuối M0 là deploy skeleton — làm trước bước này):
```
https://<tên-app>.vercel.app/api/oauth/callback
```

Route `/api/oauth/callback` **chưa cần tồn tại** để kiểm chứng M0 — bạn bấm Authorize, trình duyệt
nhảy tới URL đó, Next.js trả **404** (vì chưa có route), **kệ nó** — `code` vẫn nằm nguyên trên query
string của thanh địa chỉ, copy dán vào terminal như bình thường. Khi code app thật (M3b), chỉ cần thêm
route handler tại đúng path này, không phải đổi cấu hình app trên TikTok portal.

---

## Bước 1 — Cấu hình

Tạo `.env.local` ở gốc dự án (copy từ `.env.example`), điền 3 biến:

```
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_REDIRECT_URI=https://localhost:3000/api/oauth/callback
```

`TIKTOK_REDIRECT_URI` phải **khớp từng ký tự** với giá trị khai trong portal.

---

## Bước 2 — Chạy

```bash
cd tools/m0-display-api-probe
node probe.mjs auth
```

Mở URL nó in ra bằng trình duyệt **đang đăng nhập đúng kênh cần kiểm chứng**, bấm Authorize, copy URL
trên thanh địa chỉ dán lại vào terminal.

Ngay tại bước này đã có câu trả lời đầu tiên: dòng `scope ĐƯỢC CẤP`. Nếu thiếu `user.info.stats` hoặc
`video.list` thì dừng lại, xử lý cấu hình app trước khi chạy tiếp.

```bash
node probe.mjs probe --label d1
```

Chạy 5 nhóm kiểm tra và ghi báo cáo. Đọc `out/report-*.md`.

```bash
node probe.mjs refresh
```

Kiểm tra `refresh_token` có xoay vòng không — quy tắc bắt buộc trong `CLAUDE.md`. Chạy sau khi
`probe` đã xong (refresh làm access token cũ hết hiệu lực).

### Câu hỏi #5 cần 2 lần chạy cách nhau 24h

`view_count` của API là **luỹ kế trọn đời**; `Video Views` của Studio là **theo ngày**. Không so trực
tiếp trong một lần chạy được.

```bash
node probe.mjs probe --label d1              # hôm nay
# ~24h sau, cùng khung giờ:
node probe.mjs probe --label d2
node probe.mjs diff out/snapshot-<d1>.json out/snapshot-<d2>.json
```

⚠️ **`out/tokens.json` chỉ giữ đúng 1 token tại 1 thời điểm.** Nếu giữa d1 và d2 bạn chạy `auth` cho
kênh khác, token của kênh đang test sẽ bị ghi đè mất. Trước khi chạy `probe --label <kênh>-d2`, phải
**`auth` lại đúng kênh đó trước** (không phải chỉ chạy thẳng `probe`) — trừ khi chắc chắn `tokens.json`
đang giữ đúng token của kênh cần đo. Xem `open_id` trong `node probe.mjs status` để biết đang là kênh
nào. Đây là hạn chế cố ý của script kiểm chứng (đơn giản hoá) — app thật (M3b) phải lưu token riêng
theo từng kênh trong DB, không dùng chung 1 slot như thế này.

`diff` chính là thuật toán bắt buộc của M3b: cộng chênh lệch **theo từng video**, video mới tính trọn
view, video biến mất **bỏ qua chứ không trừ**. So `viewsInPeriod` với `Overview.csv` ở kỳ import kế
tiếp (nhớ Studio trễ 2 ngày) là ra % lệch.

---

## Đọc kết quả

| Kết quả | Nghĩa là |
| :--- | :--- |
| ✅ cả 4 câu đầu pass | Giả định kiến trúc đứng vững → làm tiếp M1, M3b giữ nguyên thiết kế |
| ⚠️ `video/list` không có `view_count` | `DisplayApiProvider` phải làm 2 bước list → query (TASKS M3b đã dự phòng), gấp đôi số lệnh gọi, vẫn dư sức so với 600/phút |
| ⚠️ `video_count` ≠ số video lấy được | Chạy probe vài ngày liên tiếp. Lệch **cố định** = video riêng tư → đổi phép kiểm `isComplete` sang so với lần lấy trước. Lệch **thay đổi** = response bị cắt ngắn → giữ nguyên phép kiểm |
| ❌ scope bị từ chối / endpoint bị chặn | Sandbox không đủ → M7: nộp duyệt app chính thức (1-2 tuần). M3a (import Studio) không phụ thuộc việc này, làm song song được ngay |

Xong M0, cập nhật `docs/DISPLAY_API.md` (bỏ dấu 🔬 ở mục nào đã xác nhận) và tick M0 trong
`docs/TASKS.md`.

---

## Ghi chú kỹ thuật

- Display API trả **HTTP 200 kèm `error.code`** khi lỗi — script kiểm cả hai, không tin mỗi status.
- `code` trong URL callback phải được **URL-decode** trước khi đổi token (đuôi `*1` hay bị hỏng nếu
  quên). Script dùng `URLSearchParams` nên đã decode sẵn.
- `out/tokens.json` chứa token thật — đã gitignore, đừng commit, đừng dán vào chat.
- Phân trang có trần an toàn 60 trang (1.200 video) để không lặp vô tận nếu cursor kẹt.
