# Bàn giao sản phẩm

Đóng băng trạng thái tại **16/09/2026** để chuyển giao toàn bộ (code + hạ tầng + vận hành) cho
**developer kế nhiệm**, kèm **chuyển hẳn quyền sở hữu** mọi tài khoản hạ tầng (không giữ lại quyền
truy cập). Đọc theo đúng thứ tự dưới đây.

## 0. Đọc gì trước

1. [CLAUDE.md](../CLAUDE.md) toàn bộ — nguồn sự thật duy nhất về quy tắc nghiệp vụ, quy ước code, và
   mục "Trạng thái" (luôn là bản mới nhất, tin nó hơn tài liệu này nếu hai bên lệch nhau).
2. Bảng tài liệu trong CLAUDE.md — mở từng file đúng lúc code phần liên quan, không cần đọc hết 1 lượt.
3. [README.md](../README.md) — chạy project ở local.

## 1. Sản phẩm là gì (30 giây)

Dashboard nội bộ cho **Cùng Anh Đi Muôn Nơi** — lưu & hiển thị dữ liệu các kênh TikTok theo thời gian
(xem số kênh chính xác hiện tại ở `/channels`; đã từng là 8, đã lên 9), có lớp KPI tuỳ chọn đặt lên
trên tập dữ liệu đó. Đây là **hệ thống production thật**, có Manager thật (username `andang`) dùng
hằng ngày và dữ liệu thật của các kênh thật — không phải bản demo/staging.

- Deploy: `https://ahd-dashboard-dusky.vercel.app`
- Repo: `https://github.com/duytienitptit/ahd-dashboard` (private, branch `main`)
- Supabase project: `ftdfmclxkjmrfikdipnt` (region Tokyo)

## 2. Trước khi coi là "sẵn sàng giao" — dọn working tree

Trước buổi bàn giao, xác nhận `git status` sạch ("nothing to commit, working tree clean") — commit hết
thay đổi liên quan tới việc bàn giao (tài liệu này, cập nhật CLAUDE.md) trước đó. Chạy thêm
`npm run build && npm run lint && npm test` một lần cuối để xác nhận code xanh tại thời điểm giao —
đừng giao một trạng thái chưa tự kiểm chứng.

## 3. Chuyển quyền sở hữu hạ tầng

| Dịch vụ | Hiện tại | Hành động | Rủi ro / lưu ý |
| :--- | :--- | :--- | :--- |
| GitHub | Repo private dưới `duytienitptit` | Settings → Danger Zone → **Transfer ownership**, nhập tài khoản GitHub dev mới | Đổi remote URL cục bộ sau khi transfer (`git remote set-url`) |
| Vercel | Project `ahd-dashboard`, **Function region đặt tay = `hkg1`** (Project Settings → Functions, không nằm trong code) | Project Settings → **Transfer** sang account/team dev mới | **Kiểm tra lại region `hkg1` còn giữ sau transfer** — mất cấu hình này thì mọi round-trip DB chậm hẳn, dễ bị chẩn đoán nhầm thành bug ở tầng khác. Cấu hình lại toàn bộ biến môi trường ở đích mới (Vercel không tự copy env vars khi transfer) |
| Supabase | Project `ftdfmclxkjmrfikdipnt`, region Tokyo, free tier | Project Settings → General → **Transfer project** sang org của dev mới (hoặc thêm dev mới làm Owner của org hiện tại rồi tự gỡ mình ra) | Xác nhận dev mới có org free tier còn chỗ nhận trước khi transfer |
| TikTok Developer App | Client key/secret riêng, **đang chờ duyệt Production** (mục 5) | ⚠️ **Chưa xác minh** TikTok Developer Portal có cho transfer ownership app hay không — nhiều portal dạng này chỉ cho thêm "member", không đổi được tài khoản gốc. Tự kiểm tra trên portal trước khi cam kết mốc thời gian | **Rủi ro cao nhất trong bảng này.** Nếu portal không hỗ trợ transfer: phương án dự phòng là dùng chung tài khoản TikTok Developer hiện tại (chia sẻ qua kênh an toàn) thay vì tạo app mới — tạo app mới nghĩa là **xin duyệt Production lại từ đầu**, trong khi đơn hiện tại đã bị từ chối 1 lần và đang chờ resubmit |
| Domain | Không thấy domain riêng ngoài `*.vercel.app` | Không cần hành động | Xác nhận lại với người bàn giao nếu có domain mua ngoài phạm vi repo này |

**Thứ tự khuyến nghị**: Supabase + GitHub trước (ít phụ thuộc nhau) → Vercel (re-link env vars, kiểm
tra lại region Function) → xác nhận app chạy được trên hạ tầng mới → xử lý TikTok Developer App sau
cùng, tách riêng, vì rủi ro cao nhất và có thể mất nhiều ngày làm việc với portal.

## 4. Secrets cần bàn giao

Toàn bộ biến trong [.env.example](../.env.example), chuyển qua **kênh an toàn** (password manager
dùng chung — không qua chat/email thường). Không rotate trừ khi nghi bị lộ:

| Biến | Nếu đổi/rotate thì sao |
| :--- | :--- |
| `TOKEN_ENCRYPTION_KEY` | Mọi token Display API đã lưu **mất khả năng giải mã** → phải OAuth lại toàn bộ kênh đã kết nối |
| `SUPABASE_SERVICE_ROLE_KEY` | **Bắt buộc đổi** khi transfer sang Supabase project mới — cập nhật lại trên Vercel ngay. Key này bypass RLS hoàn toàn, không để lộ |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | Gắn với app TikTok Developer hiện tại — chỉ đổi nếu thật sự phải tạo app mới (xem rủi ro mục 3) |
| `CRON_SECRET` | Đổi tự do, chỉ cần khớp giữa Vercel Cron config và biến môi trường |
| `TIKTOK_REDIRECT_URI` | Phải khớp **chính xác** domain mới nếu URL đổi sau transfer, và khớp redirect URI khai báo trong TikTok Developer App |

## 5. Việc còn treo tại ngày bàn giao (16/09/2026)

Đã xác nhận qua `git fetch` — `main` local khớp `origin/main` tại `f41a2a4`, **không còn gì cần
push**. Các việc còn treo thật (chi tiết đầy đủ: mục "Trạng thái" trong CLAUDE.md tại thời điểm đọc):

1. **Resubmit đơn Production TikTok** — Creator demo `test` đã tạo, Apply Reason đã soạn lại; còn
   thiếu đặt `DEMO_CREATOR_USERNAME` trên Vercel + quyết định gán kênh cho tài khoản demo, rồi
   resubmit theo [docs/DISPLAY_API.md](DISPLAY_API.md) mục "Nộp duyệt Production".
2. **Kỳ KPI đầu tiên đủ điều kiện chốt sổ, chưa ai bấm** — Cùng Anh Đi Muôn Nơi, 24→30/08, đã qua
   `periodEnd + 3 ngày` và đủ `studio_import` 7/7 ngày. `kpi_cycle.status` vẫn `draft`.
3. **Import lại bộ zip Studio ngày 25/08** để lấp dữ liệu 22–23/08 (cửa sổ chốt cũ ghi thiếu, code đã
   sửa nhưng chưa chạy lại import). **4/9 kênh chưa từng có `studio_import`** (Mộc Đi Rừng, Tiến Sĩ
   Sprout, Vườn Của Hant, Bé Na) → chưa chốt sổ KPI được cho các kênh này.
4. **Hỏi team**: Bé Na có chủ ý xoá 7 video không (29/07→19/08, mất khỏi response 28/08) — đã loại
   trừ nguyên nhân import nhầm kênh, chỉ còn là câu hỏi vận hành.
5. **Kênh "Làm Nông Thông Thái" đang bị mượn cho tài khoản demo `test`** — gán lại đúng Creator thật
   (Phạm Minh Trí) ngay khi TikTok duyệt app, rồi xoá tài khoản `test` + biến `DEMO_CREATOR_USERNAME`.

## 6. Vận hành định kỳ đang chạy — đừng làm gián đoạn

- **Cron `display_api`**: chạy ~23:30 giờ VN hằng ngày (Vercel Cron, `vercel.json`), đồng bộ các kênh
  đã kết nối OAuth. Ổn định từ 29/08 — chẩn đoán bằng `node scripts/diagnose-data.mjs`.
- **Import Studio thủ công**: team upload file Studio **thứ Tư hàng tuần, cho tuần trước đó**. Đây là
  quy trình con người, không tự động — gián đoạn (đổi nhân sự, quên việc) làm `studio_import` ngừng
  cập nhật và không kênh nào chốt sổ KPI được nữa.

## 7. Sau bàn giao

- Thời gian hỗ trợ của người bàn giao sau ngày chuyển giao: **[ĐIỀN — chưa xác định]**
- Kênh liên lạc nếu có vướng mắc: **[ĐIỀN]**

---

Bản nháp đầu tiên — bổ sung/sửa trực tiếp khi có thông tin còn thiếu (đặc biệt mục 3 phần TikTok
Developer Portal và mục 7).
