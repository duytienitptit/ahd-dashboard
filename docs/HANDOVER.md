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

⚠️ **Đã tra doc chính thức 16/09/2026 — cả Vercel lẫn Supabase đều KHÔNG có nút "đưa quyền sở hữu cho
một tài khoản lạ" kiểu GitHub.** "Transfer" ở cả 2 nơi là di chuyển project giữa 2 org/team mà **chính
người bấm transfer đã là thành viên của cả hai** — xem
[Supabase project transfer](https://supabase.com/docs/guides/platform/project-transfer) (phải là Owner
ở org nguồn, **ít nhất Member** ở org đích) và
[Vercel transferring projects](https://vercel.com/docs/projects/transferring-projects) (phải là Owner
ở team nguồn, **là thành viên** của team đích). Nếu chưa từng được mời vào org/team nào khác, dropdown
chọn đích sẽ trống — đúng như thực tế gặp phải.

**Cách đơn giản hơn nhiều — mời dev mới vào chỗ đang có sẵn, thay vì chuyển project sang chỗ họ:**

| Dịch vụ | Hiện tại | Hành động khuyến nghị | Lưu ý |
| :--- | :--- | :--- | :--- |
| GitHub | Repo private dưới `duytienitptit` | Settings → Danger Zone → **Transfer ownership**, nhập tài khoản GitHub dev mới (GitHub cho transfer thẳng tới 1 tài khoản, không cần mời trước — khác Vercel/Supabase) | Đổi remote URL cục bộ sau khi transfer (`git remote set-url`) |
| Vercel | Project `ahd-dashboard` hiện ở **personal account** (`duytien's projects`, không phải Team) theo ảnh chụp 16/09. Function region đặt tay = `hkg1` | **Miễn phí, khuyến nghị (quyết định 16/09 — không dùng Pro Trial)**: **không transfer, deploy lại từ đầu**. Sau khi GitHub đã transfer (dòng trên), dev mới tự tạo project Vercel **mới** trên chính Hobby account của họ, import từ repo (giờ đã là của họ) → dán lại `.env` (mục 4) → tự set lại **Function Region = `hkg1`** (Project Settings → Functions — bước này không tự động vì là project mới, không phải transfer). Cron tự có sẵn vì đã khai trong `vercel.json` | **Domain sẽ đổi** — project mới nhận `*.vercel.app` khác, không giữ được `ahd-dashboard-dusky` (project cũ vẫn tồn tại nên tên đó vẫn bị chiếm). Bắt buộc: báo Manager/team đổi bookmark, và cập nhật `TIKTOK_REDIRECT_URI` ở cả TikTok Developer Portal lẫn env var mới. Xoá project Vercel cũ sau khi xác nhận bản mới chạy ổn |
| Supabase | Project `ftdfmclxkjmrfikdipnt`, region Tokyo, free tier, org hiện tại `duytienitptit's Org` | Organization Settings → Team → **mời dev mới làm Owner** của org hiện tại → họ accept → bạn rời org. Docs không nhắc giới hạn mời member theo gói (khác Vercel) — cứ thử trực tiếp, gặp chặn mới cần tính tiếp | Project ID/API keys/service role key **không đổi** vì project không di chuyển đi đâu |
| TikTok Developer App | Client key/secret riêng, **đang chờ duyệt Production** (mục 5) | ⚠️ **Chưa xác minh** TikTok Developer Portal có cho thêm member/transfer hay không. Tự kiểm tra trên portal trước khi cam kết mốc thời gian | **Rủi ro cao nhất trong bảng này.** Nếu portal không hỗ trợ: dùng chung tài khoản TikTok Developer hiện tại (chia sẻ qua kênh an toàn) thay vì tạo app mới — tạo app mới nghĩa là **xin duyệt Production lại từ đầu**, trong khi đơn hiện tại đã bị từ chối 1 lần và đang chờ resubmit |
| Domain | Không thấy domain riêng ngoài `*.vercel.app` | Không cần hành động | Xác nhận lại với người bàn giao nếu có domain mua ngoài phạm vi repo này |

⚠️ **Vercel Team collaboration (nhiều người cùng quản lý 1 project) chỉ có ở Pro, không có ở Hobby**
([so sánh Hobby/Pro](https://vercel.com/docs/plans/hobby)) — tạo Team mới luôn bắt chọn Pro hoặc Pro
Trial, không có lựa chọn miễn phí (đúng như ảnh chụp thực tế 16/09). **Pro Trial 14 ngày không né được
phí**: xác nhận qua doc — *"It is not possible to change Owners during the Pro trial period. Owners can
be changed once the Pro trial has upgraded to a paid Pro plan"* ([nguồn](https://vercel.com/docs/plans/pro-plan/trials)).
Hết 14 ngày mà chưa thêm thẻ thanh toán, mọi thành viên mời thêm **bị gỡ tự động**, về lại Hobby 1
mình — nên không dùng trial để "né" phí, chỉ trì hoãn. Đã xác minh thêm: **Hobby hiện tại (2026) không
cho mời thêm thành viên dưới bất kỳ hình thức nào, kể cả invite cơ bản** (khác thông tin cũ từ 2024 lan
truyền trên vài discussion — đã kiểm chứng lại là lỗi thời). Vì bạn đã quyết định không dùng Pro Trial
(16/09), phương án chọn là **deploy lại từ đầu** ở bảng trên, không phải trả phí Vercel. Chỉ cân nhắc
trả **$20/tháng cho 1 Developer seat** nếu sau này muốn dùng đúng nút "Transfer Project" chính thức
(ví dụ dev mới đã sẵn có Team Pro riêng, họ mời bạn vào — khi đó không tốn thêm phí cho bạn).

⚠️ **Riêng, độc lập với việc bàn giao**: Hobby plan giới hạn *"non-commercial, personal use only"*
([fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage)). Dashboard
này là công cụ nội bộ của một doanh nghiệp thật, dùng để tính KPI/thưởng — về nguyên tắc đã không thuộc
diện Hobby free từ trước, không riêng gì lúc bàn giao. Đáng cân nhắc nâng Pro như một quyết định riêng.

**Thứ tự khuyến nghị**: Supabase + GitHub trước (ít phụ thuộc nhau, không cần dev mới thao tác gì) →
GitHub xong thì dev mới deploy lại Vercel từ repo đã nhận (mục Vercel ở bảng trên) → xác nhận app chạy
được trên hạ tầng mới, cập nhật `TIKTOK_REDIRECT_URI` → báo team đổi bookmark domain → xử lý TikTok
Developer App sau cùng, tách riêng, vì rủi ro cao nhất và có thể mất nhiều ngày làm việc với portal.

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
