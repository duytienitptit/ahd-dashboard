# Định dạng export TikTok Studio

Rút ra từ export thật (60 ngày, 2 kênh: `nong.nghiep.xanh.17`, `vuonvuonvang`). Đây là nguồn dữ liệu
chính cho **V1** — xem quyết định ở [PRODUCT_SPEC.md §5](PRODUCT_SPEC.md#5-data-pipeline).

Có thêm data export của kênh `kidshoppppala` (tài khoản test dùng cho M0) — dùng để đối chiếu chéo
`view_count` Display API với Studio, xem [DISPLAY_API.md](DISPLAY_API.md).

## Cấu trúc

TikTok Studio xuất **4 file zip riêng biệt** cho mỗi kênh, không phải 1 file CSV duy nhất:

| Zip | Chứa | Dùng cho |
| :--- | :--- | :--- |
| `Overview_*.zip` | `Overview.csv` | Views, Profile Views, Likes, Comments, Shares — theo ngày |
| `Followers_*.zip` | `FollowerHistory.csv`, `FollowerActivity.csv`, `FollowerGender.csv`, `FollowerTopTerritories.csv` | Follower theo ngày + giờ hoạt động + nhân khẩu học |
| `Viewers_*.zip` | `Viewers.csv` | Total/New/Returning Viewers — theo ngày |
| `Content_*.zip` | `Content.csv` | Danh sách video **gần đây** kèm view/like/comment/share |

→ Upload hàng tuần cho 1 kênh = 4 file zip. Cho 8 kênh = **32 file/tuần**.

## Cột thực tế (giữ nguyên tên gốc)

**Overview.csv**
```
Date, Video Views, Profile Views, Likes, Comments, Shares
```

**FollowerHistory.csv**
```
Date, Followers, "Difference in followers from previous day"
```

**Viewers.csv**
```
Date, "Total Viewers", "New Viewers", "Returning Viewers"
```
`New` vs `Returning` cho biết kênh sống nhờ người xem mới hay khán giả trung thành — hai chiến lược
nội dung khác hẳn nhau. Đừng bỏ qua như số phụ.

**FollowerActivity.csv** — giờ vàng đăng bài
```
Date, Hour, "Active followers"
```
Một dòng cho mỗi **giờ** trong ngày (24 dòng/ngày). ⚠️ Chỉ có **7 ngày gần nhất**, không phải 60 ngày
như các file khác — bỏ một tuần import là mất vĩnh viễn tuần đó.
Data thật kênh mẫu: đỉnh 19-20h và 11-12h, đáy 3-4h sáng.

**FollowerGender.csv** / **FollowerTopTerritories.csv**
```
Gender, Distribution            |  "Top territories", Distribution
```
Tỷ lệ dạng thập phân (`"0.55"` = 55%). Ảnh chụp tại thời điểm export, **không có lịch sử** — muốn
theo dõi dịch chuyển khán giả thì phải tự lưu mỗi tuần một bản.

**Content.csv**
```
Time, "Video title", "Video link", "Post time", "Total likes", "Total comments", "Total shares", "Total views"
```
`Time` là mốc snapshot lúc export (giống nhau ở mọi dòng), không phải ngày đăng — dùng `Post time`.

## 7 điểm parser bắt buộc phải xử lý đúng

1. **BOM ở đầu file.** Mọi file bắt đầu bằng `EF BB BF`. Không strip → cột đầu tiên (`Date`/`Time`)
   parse sai tên, key bị lệch.

2. **Ngôn ngữ ngày tháng không cố định.** Cùng là `Overview.csv` nhưng:
   - Kênh `nong.nghiep.xanh.17` xuất ra tiếng Việt: `"18 tháng Sáu"`, `"16 tháng Tám"`
   - Kênh `vuonvuonvang` xuất ra tiếng Anh: `"August 9"`, `"August 16"`

   Phụ thuộc ngôn ngữ giao diện TikTok Studio lúc export, **không kiểm soát được** từ phía mình.
   Parser phải nhận cả hai, không được giả định 1 ngôn ngữ.

3. **Không có năm.** Mọi ngày chỉ có `"<ngày> tháng <tên tháng>"` hoặc `"<Tên tháng> <ngày>"` — không
   có năm. Phải suy ra năm từ ngày upload + validate khoảng cách hợp lý (vd. nếu ngày suy ra lớn hơn
   hôm nay → lùi lại 1 năm). Rủi ro rõ nhất ở ranh giới tháng 12 → tháng 1.

4. **`"undefined"` là giá trị hợp lệ, không phải lỗi.** Xuất hiện ở những ngày đầu kênh chưa có dữ
   liệu, hoặc ngày cuối cùng export dở dang. Phải parse thành `null`, **không** parse thành `0` (0 và
   "chưa có số" là hai trạng thái khác nhau).

   🐞 **Bẫy kèm theo trong `Viewers.csv`:** ngày dở dang về với `Total Viewers: undefined` nhưng
   `New Viewers`/`Returning Viewers` là **`0` thật** (kiểm chứng: dòng 17/08 của export 18/08). Hai
   số 0 đó đủ để một ngày chưa có dữ liệu lọt qua kiểm tra "dòng này có giá trị nào không" và được
   ghi thành row `studio_import` gần như rỗng, che mất số `display_api` đang đúng.
   `lib/import/viewers.ts` bỏ cả cụm 3 số khi `Total Viewers` là `null`.

5. 🐞 **Cột `Difference in followers from previous day` bị đặt sai tên — nó là chênh lệch với ngày
   SAU.** Kiểm chứng trên data thật: khớp **15/15** với công thức `followers[D+1] − followers[D]`,
   chỉ khớp 1/15 với `followers[D] − followers[D−1]`.

   ```
   1 tháng Tám    followers=5    diff=1   ← 6−5  (ngày 2/8 trừ ngày 1/8)
   2 tháng Tám    followers=6    diff=3   ← 9−6  (ngày 3/8 trừ ngày 2/8)
   ...
   16 tháng Tám   followers=994  diff=0   ← không có ngày sau
   ```

   → **Bỏ hẳn cột này**, tự tính chênh lệch từ cột `Followers`. Nếu tin tên cột, toàn bộ số follower
   tăng theo ngày sẽ lệch đi một ngày — sai âm thầm, rất khó phát hiện.

6. **Dữ liệu trễ 2 ngày so với ngày export.** Xem mục dưới.

7. 🐞 **Tên file zip `Overview_<ngày>_<số>_<kênh>.zip` — đoạn `<ngày>` KHÔNG PHẢI ngày export, đừng
   parse nó.** Kiểm chứng trên cả 3 zip Overview thật đang có:

   | File | Đoạn `<ngày>` trong tên | Đoạn `<số>` decode ra (Unix timestamp) |
   | :--- | :--- | :--- |
   | `nong.nghiep.xanh.17` | `2026-06-18` | `1786845545` → **16/08/2026** |
   | `vuonvuonvang` | `2026-06-18` | `1786845671` → **16/08/2026** |
   | `kidshoppppala` | `2026-06-19` | `1786934126` → **17/08/2026** |

   Cả 3 file đều "tháng 6" trong khi ngày export thật (theo nội dung CSV bên trong, khớp cách tính
   trễ 2 ngày ở mục dưới) là **tháng 8**. Đoạn ngày dạng `YYYY-MM-DD` trong tên file **không đáng tin
   — có vẻ là hằng số hoặc ngày tạo channel, không phải ngày export**. Đoạn `<số>` phía sau mới là
   Unix timestamp (giây) và decode đúng ra ngày export thật.

   → **Không dùng tên file để tính `ngàyExport` cho cửa sổ chốt** ([DATA_SOURCES.md](DATA_SOURCES.md)).
   Dùng `now()` phía server tại thời điểm Manager bấm upload, hoặc đối chiếu với cột `Time` trong
   `Content.csv` (snapshot ngay lúc export, đáng tin hơn tên file). Nếu vẫn cần đoạn số trong tên file
   Overview zip để tham khảo, phải **decode như Unix timestamp**, không phải chuỗi ID vô nghĩa.

## ⏱ Độ trễ dữ liệu — 2 ngày

Export thực hiện ngày **18/08**, nhưng dữ liệu thật chỉ có đến **16/08** trên cả 2 kênh:

| File | Dòng cuối có số thật | Trễ |
| :--- | :--- | :--- |
| `Overview.csv` (cả 2 kênh) | 16/08 | 2 ngày |
| `FollowerHistory.csv` | 16/08 | 2 ngày |
| `Viewers.csv` | 17/08 nhưng `"undefined"` (New/Returning vẫn là `0`) → thật đến 16/08 | 2 ngày |

Kiểm chứng lại 25/08/2026 trên `@nng.sn.vit6`: export ngày 25/08 có số đầy đủ đến **23/08** — vẫn
đúng 2 ngày, trên cả `Overview.csv`, `FollowerHistory.csv` và `Viewers.csv`.

Hệ quả bắt buộc: **không ghi đè 2 ngày gần nhất bằng số từ Studio** — những ngày đó Studio chưa có
số, ghi đè sẽ xoá mất số `display_api` đang đúng. Cơ chế "cửa sổ chốt" xem
[DATA_SOURCES.md](DATA_SOURCES.md).

## ⚠️ Giới hạn nghiêm trọng của `Content.csv` — KHÔNG dùng để đếm số video

Kiểm chứng trên data thật của cả 2 kênh:

| Quan sát | nong.nghiep.xanh.17 | vuonvuonvang |
| :--- | :--- | :--- |
| Số dòng | đúng **15** | đúng **15** |
| Snapshot (`Time`) | 18 tháng Tám | August 18 |
| Video mới nhất trong file | 14 tháng Tám | August 14 |
| Sắp xếp theo view giảm dần? | Không (1 chỗ sai) | Không (3 chỗ sai) |
| Sắp xếp theo engagement? | Không | Không |
| Sắp xếp theo ngày? | Không | Không |

Kết luận:
- **Cap cứng ~15 dòng.** Cả 2 kênh đều đúng 15 — không phải trùng hợp.
- **Không phải "15 video gần nhất".** Snapshot ngày 18 nhưng video mới nhất chỉ đến ngày 14 — các
  video đăng ngày 15-18 bị bỏ ra ngoài (nhiều khả năng vì view còn thấp, chưa lọt top).
- **Thứ tự không theo quy tắc đoán được** — không theo ngày, không theo view, không theo engagement.
  Gần giống "top video theo view trong kỳ" nhưng có ngoại lệ.

→ **Không thể dùng `Content.csv` để đếm số video đăng trong kỳ.** Đây là chỉ tiêu KPI bắt buộc, nên
phải lấy từ nguồn khác (`video_count` của Display API — xem [DATA_SOURCES.md](DATA_SOURCES.md)).

→ `Content.csv` chỉ còn dùng được cho **thư viện top video / học hỏi chéo (P1)**, với đúng bản chất
"một số video nổi bật tại thời điểm export", không phải danh sách đầy đủ. Import vẫn **dedup theo
`Video link`**, tích luỹ dần qua các tuần.

→ Khi Display API chạy, nó trả **toàn bộ** video kèm view/like/comment/share, nên vai trò của
`Content.csv` gần như biến mất. Giữ import chủ yếu để đối chiếu.

## Khai thác được thêm từ tiêu đề video

`Video title` chứa hashtag do Creator tự đặt, tách bằng regex `#(\w+)` là ra chủ đề nội dung.
Thử trên 30 video thật của 2 kênh:

| Hashtag | Số video | View trung bình |
| :--- | ---: | ---: |
| `#thuhoach` | 8 | 259.115 |
| `#hoaquangon` | 11 | 254.050 |
| `#nongnghiep` | 26 | 151.578 |
| `#trainghiem` | 10 | 128.680 |

Chênh **2 lần** giữa chủ đề tốt nhất và kém nhất — đủ để định hướng nội dung. Với Display API (toàn
bộ video, không phải 15) phân tích này còn đáng tin hơn nhiều.

## Đề xuất UX upload

Chấp nhận **upload thẳng file `.zip`** (không bắt Manager tự giải nén) — server giải nén, nhận diện
loại file theo tên bên trong và parse **toàn bộ 7 file**, ngay từ MVP:

| File trong zip | Bảng đích | Ghi chú |
| :--- | :--- | :--- |
| `Overview.csv` | `data_snapshot` | Views, profile views, like, comment, share theo ngày |
| `FollowerHistory.csv` | `data_snapshot` | Chỉ lấy cột `Followers`, **bỏ cột diff** (mục 5 ở trên) |
| `Viewers.csv` | `data_snapshot` | Total / New / Returning viewers |
| `FollowerActivity.csv` | `follower_activity` | ⚠️ **Chỉ 7 ngày/lần export** — bỏ một tuần là mất vĩnh viễn tuần đó |
| `FollowerGender.csv` | `audience_snapshot` | Ảnh chụp tại thời điểm export, không có lịch sử |
| `FollowerTopTerritories.csv` | `audience_snapshot` | Như trên |
| `Content.csv` | `content_video` | Dedup theo `Video link`. **Không dùng để đếm video** |

> **Quyết định (19/08/2026): parse cả 7 file ngay từ MVP**, không hoãn 3 file "nguội" sang P1.
> Lý do: `FollowerActivity.csv` chỉ giữ 7 ngày gần nhất — hoãn parser đồng nghĩa mất vĩnh viễn dữ
> liệu giờ vàng của mọi tuần trước khi parser ra đời, trong khi chi phí thêm chỉ là 3 parser nhỏ
> đọc file phẳng. `FollowerGender`/`TopTerritories` không có lịch sử nên cũng chỉ tích luỹ được từ
> lúc bắt đầu lưu. Đây là loại dữ liệu **không thể lấy lại ngược về quá khứ**.
