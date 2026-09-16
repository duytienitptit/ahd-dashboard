# Nguồn dữ liệu

Quyết định lấy số liệu ở đâu, cho chỉ số nào, với độ tươi và độ chính xác nào.

## Yêu cầu

| Nhóm | Chỉ số | Yêu cầu |
| :--- | :--- | :--- |
| **Nhóm nóng** | Lượt xem, số video, follower | Càng gần realtime càng tốt — nhưng **ưu tiên độ chính xác hơn độ tươi** |
| Nhóm nguội | Profile views, viewers (new/returning), nhân khẩu học, top video | Cập nhật cuối tuần là đủ |

## ⚠️ Phát hiện quan trọng: Display API ≠ Business API

Trước đây dự án chờ **Business API** (phải qua Business Center → convert account → duyệt app), thời
gian duyệt lâu và không kiểm soát được. Nhưng **Display API là con đường khác, nhẹ hơn nhiều**, và
cung cấp đúng cả 3 chỉ số nhóm nóng:

| Endpoint | Scope | Trả về |
| :--- | :--- | :--- |
| `GET /v2/user/info/` | `user.info.stats` | `follower_count`, `following_count`, `likes_count`, **`video_count`** |
| `POST /v2/video/list/` | `video.list` | Metadata từng video kèm **`view_count`**, like, comment, share |

Điều kiện: mỗi kênh phải OAuth cấp quyền cho app **một lần**. Vì **công ty sở hữu toàn bộ 8 kênh**,
đây là việc làm được ngay, không phụ thuộc ai bên ngoài.

Thêm nữa, TikTok có **Sandbox mode**: tạo được tới 5 sandbox mỗi app, mỗi sandbox share cho tối đa
**10 tài khoản TikTok** — 8 kênh lọt gọn vào 1 sandbox, **không cần chờ duyệt app** để bắt đầu.
Thời gian duyệt chính thức (nếu cần) khoảng 1-2 tuần cho hồ sơ sạch, so với Business API lâu hơn nhiều.

> ✅ **Đã kiểm chứng thực tế (M0, 20/08/2026):** sandbox gọi được đầy đủ `user.info.stats` +
> `video.list`, không chỉ giới hạn ở luồng đăng bài — xem [DISPLAY_API.md](DISPLAY_API.md).

## Vấn đề chưa nguồn nào giải quyết trọn vẹn: "view trong kỳ"

Mọi API (chính thức lẫn scraping) chỉ trả **view luỹ kế trọn đời của từng video**. Không nguồn nào
trả thẳng "kênh này thu được bao nhiêu view trong tuần này" — trừ TikTok Studio.

Cách suy ra: **snapshot view từng video mỗi ngày, cộng phần chênh lệch.**

```
viewTrongNgày = Σ (view[video][hôm nay] − view[video][hôm qua])
```

Quy tắc bắt buộc để không sai số:
- Cộng **chênh lệch theo từng video**, không lấy tổng-hôm-nay trừ tổng-hôm-qua.
- Video mới (chỉ có ở hôm nay) → lấy nguyên view của nó.
- Video biến mất (chỉ có ở hôm qua) → **bỏ qua, không trừ**. Có thể do bị xoá, chuyển private, hoặc
  API trả thiếu.
- Luôn đối chiếu số video lấy được với `video_count` từ `user/info`. Lệch → đánh dấu snapshot là
  **không đầy đủ**, không dùng để tính KPI.

Lý do quy tắc cuối quan trọng: khi bị rate-limit, TikTok **không báo lỗi mà âm thầm trả danh sách bị
cắt ngắn**. Nếu lấy tổng trừ tổng, một lần trả thiếu sẽ tạo ra "view âm" hoặc tụt số vô lý.

## Chiến lược chốt: 2 tầng

```
Hằng ngày  ── Display API ──→ follower, video_count, view (suy ra từ delta)
                                  ↓ hiển thị ngay, đánh dấu "tạm tính"
Cuối tuần  ── TikTok Studio ──→ Overview/Followers/Viewers/Content
                                  ↓ ghi đè số của tuần đó, đánh dấu "đã đối chiếu"
```

- **Trong tuần:** số từ Display API, gắn nhãn *tạm tính*. Đủ để Manager theo dõi tiến độ.
- **Cuối tuần:** import Studio ghi đè số ngày tương ứng, gắn nhãn *đã đối chiếu*. Đây là số dùng để
  chốt sổ / tính thưởng.
- Nếu lệch nhiều giữa 2 nguồn → hiện cảnh báo, không im lặng ghi đè.

Cách này thoả cả hai yêu cầu: gần realtime trong tuần, chính xác khi cần chốt sổ.

## Các phương án đã cân nhắc

| Phương án | Chi phí | ToS | Độ chính xác | Kết luận |
| :--- | :--- | :--- | :--- | :--- |
| **Display API** | Miễn phí | ✅ Chính thức | Cao — số từ TikTok | ✅ **Chọn cho nhóm nóng** |
| TikTok Studio import | Miễn phí | ✅ Chính thức | Cao nhất — là số Creator nhìn thấy | ✅ **Chọn cho nhóm nguội + đối chiếu tuần** |
| Business API | Miễn phí | ✅ Chính thức | Cao | ⏸ Duyệt lâu, và Display API đã đủ → hạ ưu tiên |
| Scraping bên thứ 3 | ~$29-100/tháng | ⚠️ Vi phạm ToS TikTok | Khá, nhưng bị cắt dữ liệu khi rate-limit | ⏸ Chỉ dùng nếu Display API bị chặn |
| Creator nhập tay hằng ngày | Miễn phí | ✅ | Cao **nhưng tự khai** | ⚠️ Xem mục dưới |

Tham khảo giá scraping nếu cần fallback: ScrapeCreators ~$47/25K credit (rẻ nhất), TikAPI ~$15/tháng,
EnsembleData ~$100/tháng (có free tier 50 unit/ngày), Apify ~$49/tháng.
Khối lượng thực tế rất nhỏ: 8 kênh × ~3 lệnh/ngày ≈ 720 lệnh/tháng — mọi gói rẻ nhất đều dư.

## Chọn nhà cung cấp API

**Chốt: Display API (chính thức, miễn phí) làm nguồn chính. Fallback là ScrapeCreators.**

Khối lượng thực tế rất nhỏ — 8 kênh × (1 lệnh profile + ~4 trang video) ≈ **40 lệnh/ngày ≈ 1.200/tháng**.
Ở mức này giá gần như không đáng kể, nên tiêu chí quyết định là **độ tin cậy và tính hợp lệ**, không
phải giá.

| Nhà cung cấp | Giá | Chi phí thực ở mức 1.200 lệnh/tháng | ToS | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| **TikTok Display API** | Miễn phí | **$0** | ✅ Chính thức | Cần OAuth từng kênh; sandbox tới 10 tài khoản |
| **ScrapeCreators** | $47 / 25K credit | ~$2,3/tháng → gói $47 dùng ~20 tháng | ⚠️ Vi phạm | Rẻ nhất/lệnh, không rate limit công bố |
| TikAPI | ~$15/tháng | $15/tháng = $180/năm | ⚠️ Vi phạm | Đắt hơn ScrapeCreators nhiều lần ở mức này |
| EnsembleData | Free 50 unit/ngày, rồi $100/tháng | Free tier **có thể không đủ** (1 lệnh = 1-10 unit, 40 lệnh/ngày dễ vượt) | ⚠️ Vi phạm | Bậc trả phí đầu tiên quá đắt cho quy mô này |
| Apify | ~$49/tháng nền tảng | $49/tháng | ⚠️ Vi phạm | Mô hình actor bất đồng bộ, phức tạp hơn cần thiết |
| Bright Data | $500+/tháng | Quá dư | ⚠️ Vi phạm | Cấp doanh nghiệp, không phù hợp |

**Về độ chính xác:** cả 3 chỉ số nhóm nóng (follower, video_count, view từng video) đều là **dữ liệu
công khai**, nên số của scraper và của Display API về nguyên tắc là một. Khác biệt thật nằm ở **độ
tin cậy**: khi bị rate-limit, scraper nhận danh sách bị cắt ngắn mà không có lỗi báo về. Vì vậy kiểm
tra `isComplete` (so số video lấy được với `video_count`) là bắt buộc **với mọi nguồn**, kể cả
Display API.

> Giá tham khảo tại thời điểm khảo sát (08/2026) — kiểm tra lại trước khi mua.

## Nhập tay khi API lỗi — có, nhưng hẹp hơn nhiều so với trực giác

**Phản biện trước:** phần lớn tình huống "API lỗi" **tự lành, không cần nhập tay.**

Import Studio cuối tuần trả về **số liệu theo từng ngày của 60 ngày trước**. Nên nếu Display API chết
ngày thứ Ba, đến kỳ import tuần đó ngày thứ Ba sẽ được lấp lại bằng số chính thức. Mất dữ liệu chỉ là
tạm thời, và số cuối cùng dùng chốt sổ vẫn đúng.

Nhập tay chỉ thật sự cần khi cả hai điều sau xảy ra cùng lúc:
1. Display API không lấy được số (token hết hạn, kênh chưa OAuth, API đổi), **và**
2. Cần số ngay giữa tuần cho một quyết định, không đợi được tới kỳ import

→ **Vẫn nên có**, nhưng thiết kế phải phản ánh đúng vai trò "miếng vá tạm", không phải nguồn dữ liệu:

| Ràng buộc | Lý do |
| :--- | :--- |
| **Chỉ Manager được nhập**, Creator không | Người hưởng thưởng không tự khai số tính thưởng mình. Manager nhập thì không còn xung đột lợi ích |
| Nhãn `manual_entry`, hiển thị khác biệt rõ trên UI | Nhìn là biết số này chưa được xác thực |
| **Tự động bị thay thế** khi `studio_import` phủ ngày đó | Miếng vá tự tan khi số thật về — không tồn tại lâu dài trong hệ thống |
| Không cho chốt sổ chu kỳ còn chứa `manual_entry` | Giữ nguyên tắc "chống tranh cãi" |
| Ghi `audit_log`: ai nhập, lúc nào, số bao nhiêu | Truy vết được |

Điểm quan trọng nhất là dòng thứ 3: nhập tay **không được ghi đè lên** số Studio, mà ngược lại.

## Đối chiếu khi Studio trễ 2 ngày

Đã kiểm chứng trên data thật: export ngày 18/08 nhưng số thật chỉ đến **16/08** (xem
[CSV_FORMAT.md](CSV_FORMAT.md)). Nếu import ghi đè mù quáng, 2 ngày gần nhất đang có số `display_api`
đúng sẽ bị xoá thành rỗng.

### Cửa sổ chốt (settle window)

```
settledBefore = ngàyImport − 1     (đúng 2 ngày trễ của Studio)

ngày <  settledBefore  →  studio_import ghi đè, đánh dấu "đã đối chiếu"
ngày >= settledBefore  →  GIỮ NGUYÊN số display_api, chờ kỳ import sau
```

Ngày mới nhất ghi được = **`ngàyImport − 2`**, đúng ngày cuối cùng Studio có số đầy đủ. Chạy import
ngày 25/08 → ghi tới 23/08, chỉ 24 và 25 để lại cho `display_api`.

📌 **Đổi từ `− 3` sang `− 1` ngày 25/08/2026, theo yêu cầu.** Mốc cũ chỉ ghi tới `ngàyImport − 4` (vì
phép so sánh là `<`): vứt mất 2 ngày mà file export đã có số đầy đủ, và import thứ Tư không với tới
Chủ Nhật tuần trước → chu kỳ tuần T2→CN **không bao giờ** đủ điều kiện chốt sổ. Lưu ý `ngàyImport` là
ngày **chạy import** (`nowVnDateString()` trong route handler), không phải ngày ghi trong file
export — upload muộn thì cửa sổ trượt theo ngày upload.

Kèm ba quy tắc phụ:
- **Không bao giờ ghi đè số thật bằng `"undefined"`/`null`.** Dòng có `undefined` thì bỏ qua hoàn toàn.
- 🐞 **Ngày dở dang không phải lúc nào cũng toàn `undefined`.** `Viewers.csv` trả `Total Viewers:
  undefined` nhưng `New`/`Returning Viewers` = **`0` thật**; hai số 0 đó đủ để lọt qua `hasAnyValue`
  và ghi ra một row `studio_import` gần như rỗng — mà `studio_import` xếp trên `display_api` trong
  `v_channel_daily` (chọn theo DÒNG) nên nó **che** số thật của ngày đó. `lib/import/viewers.ts` bỏ
  cả cụm 3 số khi `Total Viewers` là `null`. Đây là lớp bảo vệ thay cho ngày an toàn theo lịch đã bỏ.
- Lệch giữa `display_api` và `studio_import` cùng ngày vượt ngưỡng (đề xuất **10%**) → ghi cảnh báo,
  vẫn lấy số Studio nhưng hiện cờ để Manager xem lại.

### Hệ quả về thời điểm: import giữa tuần, không phải cuối tuần

Nếu chu kỳ KPI là tuần T2→CN và import vào tối CN, hai ngày T7+CN chưa có số Studio → không chốt sổ
được. **Import vào thứ Tư cho tuần trước đó** thì cả 7 ngày đều đã nằm ngoài cửa sổ chốt (thứ Tư ghi
tới thứ Hai, dư 1 ngày so với Chủ Nhật).

Thứ Ba cũng đủ số (ghi tới đúng Chủ Nhật, không dư ngày nào) nhưng **chưa qua `periodEnd + 3 ngày`**
nên cổng chốt sổ vẫn khoá — xem "Quy tắc chốt sổ" ngay dưới. Giữ lịch thứ Tư.

```
T2 ── T3 ── T4 ── T5 ── T6 ── T7 ── CN │ T2 ── T3 ── [T4: import + chốt sổ]
└────────── chu kỳ KPI ─────────────┘   └─ chờ Studio kịp ─┘
```

### Quy tắc chốt sổ

Chu kỳ chỉ được `finalize` khi **cả hai** điều kiện thoả:
1. Đã qua `periodEnd + 3 ngày`
2. Mọi ngày trong chu kỳ đều có `DataSnapshot` với `source = studio_import`

Thiếu điều kiện nào thì nút chốt sổ bị khoá, kèm thông báo còn thiếu ngày nào — thay vì cho chốt rồi
phát hiện số sai sau.

## `source` trong `DataSnapshot`

| Giá trị | Ý nghĩa | Dùng để chốt sổ? |
| :--- | :--- | :--- |
| `display_api` | Lấy tự động hằng ngày | ❌ Tạm tính |
| `studio_import` | Import file giữa tuần | ✅ Nguồn chính thức |
| `manual_entry` | **Chỉ Manager** nhập tay khi API lỗi | ❌ Tự bị thay khi Studio về |
| `business_api` | V2, nếu sau này được duyệt | Đánh giá lại khi có |
| `vendor_scraping` | Fallback bên thứ 3 | ❌ Tạm tính |

Thứ tự ưu tiên khi cùng một ngày có nhiều nguồn:

```
studio_import  >  business_api  >  display_api  >  vendor_scraping  >  manual_entry
```

Nguồn ưu tiên cao hơn luôn thắng. Đây là lý do `manual_entry` tự biến mất khỏi số hiển thị ngay khi
`studio_import` phủ tới ngày đó — không cần ai đi dọn thủ công.

## Nguồn

- [TikTok Display API Overview](https://developers.tiktok.com/doc/display-api-overview)
- [TikTok API Scopes](https://developers.tiktok.com/doc/tiktok-api-scopes)
- [Introducing Sandbox Mode for TikTok Developers](https://developers.tiktok.com/blog/introducing-sandbox)
- [TikTok API Integration Guide 2026 — Phyllo](https://www.getphyllo.com/post/tiktok-api-integration-guide-2026-setup-endpoints-common-pitfalls)
- [TikTok API Pricing Comparison 2026 — CreatorCrawl](https://creatorcrawl.com/blog/tiktok-api-pricing-comparison/)
- [TikTok Scraping APIs 2026 — ScrapeBadger](https://scrapebadger.com/blog/tiktok-scraping-apis-in-2026-the-complete-deep-guide)
