# TikTok Display API — tham chiếu

Nguồn dữ liệu hằng ngày cho 3 chỉ số nóng. Chiến lược tổng thể: [DATA_SOURCES.md](DATA_SOURCES.md).

> ✅ **Cập nhật 20/08/2026 (M0 + M3b):** phần lớn tài liệu này đã chạy thật trên sandbox (3 tài khoản,
> kể cả 2 kênh thật) — xem các dòng "Đã kiểm chứng" bên dưới. Code app thật (`lib/tiktok/`) port trực
> tiếp từ script kiểm chứng M0 (`tools/m0-display-api-probe/probe.mjs`), không viết lại từ đầu. Còn
> đúng 1 mục 🔬 chưa đo được (mục 5 bên dưới) — cần Manager OAuth thật qua `/connections` trước.

## Endpoint và trường dữ liệu

### `GET /v2/user/info/`

Trường bị chặn theo scope — **phải xin đúng scope mới có trường**:

| Scope | Trường |
| :--- | :--- |
| `user.info.basic` | `open_id`, `union_id`, `avatar_url`, `avatar_url_100`, `avatar_large_url`, `display_name` |
| `user.info.profile` | `bio_description`, `profile_deep_link`, `is_verified`, `username` |
| **`user.info.stats`** | **`follower_count`**, `following_count`, `likes_count`, **`video_count`** |

→ Dự án cần **`user.info.stats`** cho follower và số video.

⚠️ TikTok đã đổi cách chia scope: `user.info.basic` giờ trả **ít trường hơn trước**. Phải khai báo
scope tường minh, không dựa vào mặc định cũ.

### `POST /v2/video/list/`

Scope `video.list`. Trả danh sách video **công khai**, sắp theo `create_time` giảm dần.

| Thông số | Giá trị |
| :--- | :--- |
| `max_count` | mặc định 10, **tối đa 20/lần** |
| Phân trang | `cursor` = UTC Unix timestamp (mili-giây); còn dữ liệu khi `has_more = true` |
| Mẹo | Truyền timestamp tuỳ ý để lấy video đăng **trước** mốc đó |

✅ **Đã kiểm chứng 20/08/2026:** `fields` nhận thẳng `view_count`, `like_count`, `comment_count`,
`share_count` — không cần bước `video/query` bổ sung. Bộ field đầy đủ được chấp nhận ngay lần gọi đầu.

### `POST /v2/video/query/`

Scope `video.list`. **Tối đa 20 video ID mỗi lần.** Đây là endpoint **xác nhận chắc chắn** có chỉ số:

```
id, create_time, cover_image_url, share_url, video_description,
duration, height, width, title, embed_html, embed_link,
like_count, comment_count, share_count, view_count
```

### Phương án 2 bước — không cần dùng, nhưng giữ làm đối chiếu

`video/list` đã trả đủ chỉ số nên `DisplayApiProvider` **không cần** gọi `video/query` để lấy view.
Vẫn nên gọi `video/query` **định kỳ** (không phải mỗi lần) để đối chiếu chéo — kiểm chứng thực tế cho
thấy `view_count` giữa 2 endpoint khớp nhau 100% trên dữ liệu mẫu, nhưng đây là tín hiệu rẻ để phát
hiện sớm nếu TikTok thay đổi hành vi API sau này.

Với ~100 video/kênh: 5 lệnh `video/list`/kênh/ngày → **40 lệnh/ngày cho 8 kênh** (giảm một nửa so với
phương án 2 bước ban đầu dự trù). Vẫn thấp hơn rất nhiều so với giới hạn.

## Giới hạn tần suất

| Mục | Giá trị |
| :--- | :--- |
| Display API | **600 lệnh/phút** mỗi endpoint, cửa sổ trượt 1 phút |
| Vượt ngưỡng | HTTP **429**, mã lỗi `rate_limit_exceeded` |
| Quota ngày | Không công bố (khác Research API vốn giới hạn 1.000/ngày) |

Nhu cầu thực tế ~80 lệnh/ngày → **dùng chưa tới 0,02% giới hạn**. Tần suất không phải vấn đề.

## Token — điểm dễ gây sự cố im lặng nhất

| Loại | Hạn |
| :--- | :--- |
| `access_token` | **24 giờ** |
| `refresh_token` | **365 ngày** |

Hai điều bắt buộc phải xử lý đúng:

1. **`refresh_token` CÓ THỂ xoay vòng — nhưng không phải lần nào cũng đổi.** Doc chính thức dùng chữ
   "may be different". ✅ Kiểm chứng 20/08/2026: refresh lần đầu, token **không đổi**. Không được suy
   ra từ đó là "không cần lo" — code vẫn bắt buộc ghi đè bằng giá trị trả về mỗi lần refresh (dù giống
   hay khác), vì TikTok không cam kết hành vi này ổn định qua các lần gọi khác. Dùng token cũ khi
   TikTok đã đổi → mất quyền, phải bắt Creator OAuth lại.
2. **Hết 365 ngày phải OAuth lại thủ công** cho từng kênh. Với 8 kênh, nên có màn hình hiển thị hạn
   token còn lại và cảnh báo trước ít nhất 30 ngày — nếu không sẽ chết lặng lẽ đúng lúc không ai để ý.

## Sandbox — có dùng được không?

| Mục | Giá trị |
| :--- | :--- |
| Số sandbox/app | 5 |
| Tài khoản/sandbox | **10** → 8 kênh lọt gọn vào 1 sandbox |
| Không hỗ trợ | Content Posting API (video công khai), Data Portability API |

✅ **Đã kiểm chứng 20/08/2026** bằng tài khoản test (`kidshoppppala`) qua sandbox thật: `user.info.stats`
và `video.list` gọi được bình thường, đủ cả 3 scope. Giả định lớn nhất của kiến trúc đứng vững.

⚠️ **Lưu ý quy trình:** Display API không còn là "product" riêng phải bấm Add trong developer portal —
TikTok đã gộp scope (`user.info.stats`, `video.list`) vào **Login Kit**. Chỉ cần Add Login Kit rồi vào
mục Scopes để tick, không tìm thấy tile "Display API" trong danh sách Add products là bình thường.

Nếu sandbox không đủ: nộp duyệt app chính thức, hồ sơ sạch mất **khoảng 1-2 tuần**.

⚠️ **Lỗi `non_sandbox_target`** (gặp thật 22/08/2026 lúc kết nối 2 kênh thật qua `/connections`): trang
authorize của TikTok báo "We couldn't log in with TikTok... non_sandbox_target" — nghĩa là tài khoản
TikTok đang đăng nhập lúc bấm "Kết nối" **chưa được thêm vào Target Users của sandbox**. Không phải
lỗi code/config phía app (redirect URI, client key đều bình thường). Sửa: Developer Portal → app →
tab **Sandbox** → **Target Users** → thêm tài khoản TikTok thật của kênh (chủ tài khoản cần xác nhận
lời mời trong app TikTok), rồi mới bấm "Kết nối" lại.

## Những gì Display API KHÔNG có

Đây là lý do vẫn phải giữ import Studio hằng tuần:

| Không có | Hệ quả |
| :--- | :--- |
| **View theo ngày** | Chỉ có view luỹ kế/video → phải tự tính chênh lệch ([DATA_SOURCES.md](DATA_SOURCES.md)) |
| Profile views | Chỉ Studio có |
| Viewers (mới / quay lại) | Chỉ Studio có |
| Nhân khẩu học, khu vực | Chỉ Studio có |
| Thời lượng xem, tỷ lệ xem hết | Chỉ Studio có |
| Nguồn traffic | Chỉ Studio có |
| Video **không công khai** | `video/list` chỉ trả video công khai |

## Bẫy cần đề phòng khi code

1. **`video_count` có thể ≠ số video `video/list` trả về.**
   `video/list` chỉ trả video **công khai**, còn `video_count` chưa rõ có đếm cả video riêng tư không.
   Nếu có, phép kiểm `isComplete` sẽ **luôn báo lỗi sai**.
   Kiểm chứng 20/08/2026 trên 3 tài khoản:

   | Kênh | video_count | video/list trả về | Lệch |
   | :--- | ---: | ---: | ---: |
   | `kidshoppppala` (test) | 24 | 24 | 0 |
   | `nong.nghiep.xanh.17` (thật) | 29 | 29 | 0 |
   | `vuonvuonvang` (thật) | 43 | 42 | **1** |

   2/3 khớp tuyệt đối, chỉ `vuonvuonvang` lệch 1 — dù phân trang đã chạy hết (`has_more=false`, không
   phải bị cắt do rate-limit). Vì 2 kênh kia khớp hoàn toàn nên nhiều khả năng đây là **đặc thù của
   kênh đó** (1 video riêng tư), không phải lỗi hệ thống ảnh hưởng mọi kênh.
   → **Cần đo lại `vuonvuonvang` vào ngày khác** — lệch giữ nguyên **1** thì xác nhận video riêng tư cố
   định (đổi phép kiểm `isComplete` sang so với **lần lấy trước**, chỉ cho kênh này hoặc dùng chung nếu
   thấy lặp lại ở kênh khác); lệch dao động → dấu hiệu response bị cắt, giữ nguyên phép kiểm hiện tại.

   **Quyết định M3b (20/08/2026):** `lib/tiktok/sync.ts` giữ nguyên phép kiểm `gotVideos === video_count`
   như tài liệu này mô tả — **chưa** đổi riêng cho `vuonvuonvang`, vì phép đo lại xác nhận độ lệch cố
   định vẫn chưa làm. Hệ quả: `vuonvuonvang` nhiều khả năng sẽ báo `isComplete=false` liên tục ngay khi
   kết nối — **đây là hành vi đã biết trước, không phải bug** — cho tới khi có phép đo lại.

1b. **`view_count` giữa `video/list` và `video/query` có thể lệch vài đơn vị — bình thường, không phải
    bug.** `vuonvuonvang`: 3/42 video lệch đúng **1 view** giữa 2 lệnh gọi (vd. 38827 vs 38828) — view
    mới phát sinh trong khoảng thời gian ngắn giữa 2 lệnh gọi liên tiếp trên video đang có traffic.
    `nong.nghiep.xanh.17`: **0/29 lệch**, khớp hoàn toàn. Tín hiệu tốt — API trả số real-time, không
    phải cache cũ. Đừng coi lệch nhỏ này là lỗi dữ liệu khi viết `video/query` làm bước đối chiếu.

2. **Phân trang phải chạy hết.** `has_more = true` mà dừng sớm → thiếu video → view trong ngày bị
   thiếu. Luôn lặp tới khi `has_more = false`.

3. **`view_count` là luỹ kế trọn đời tại thời điểm gọi**, không phải view trong ngày. Đã xử lý bằng
   `VideoSnapshot` + chênh lệch theo từng video.

4. **Video bị xoá / chuyển riêng tư** sẽ biến mất khỏi response. Quy tắc đã chốt: bỏ qua, **không trừ**.

5. ✅ **Kiểm chứng 20/08/2026 — cấp độ từng video, trên cả 3 tài khoản:**
   - `kidshoppppala`: so `view_count` (API, snapshot 20/08) với `Total views` (`Content.csv` Studio,
     cũng snapshot 20/08) — **15/15 video khớp tuyệt đối, lệch = 0**.
   - `nong.nghiep.xanh.17`: `Content.csv` Studio snapshot cũ hơn 2 ngày (18/08) so với API (20/08) —
     không kỳ vọng khớp tuyệt đối, nhưng **15/15 video đều tăng hợp lý** (không video nào giảm, không
     có bước nhảy bất thường), khớp đúng hướng tăng dần theo thời gian.

   Số API trả và số Studio hiển thị cho công ty là **cùng một nguồn**, không có sai lệch quan sát được
   trên cả 2 kênh thật đã test.

   🔬 **Vẫn còn thiếu phép đo gốc:** đây là so 2 số luỹ kế trọn đời tại cùng 1 thời điểm, chưa phải so
   "view trong ngày" (API, suy từ delta 2 snapshot cách 24h) với "Video Views" (Studio, theo ngày,
   `Overview.csv`) — phép đo này mới trả lời đúng câu hỏi gốc. Cần: `probe --label d2` sau 24h +
   `diff`, rồi so với dòng tương ứng trong `Overview.csv` (nhớ Studio trễ 2-3 ngày). Studio vẫn giữ
   vai trò nguồn chốt sổ cho tới khi có phép đo này — nhưng tín hiệu ban đầu rất tích cực, rủi ro kiến
   trúc ở điểm này thấp hơn đáng kể so với lúc chưa kiểm chứng.

6. ⚠️ **Sự cố thật 21/08/2026: chính tài khoản test `kidshoppppala` ở mục 1 và 5 phía trên bị kết nối
   nhầm vào CẢ HAI kênh thật** (`nong.nghiep.xanh.17` và `vuonvuonvang`) khi bấm "Kết nối" trên
   `/connections` lần đầu — số liệu ghi vào production là của tài khoản test này (151 follower, 24
   video), không phải kênh thật. Nguyên nhân nhiều khả năng: trình duyệt vẫn đang đăng nhập TikTok
   bằng tài khoản test `kidshoppppala` (dùng xuyên suốt M0 để probe sandbox) từ trước, thay vì đổi
   sang đúng tài khoản TikTok của từng kênh trước khi bấm "Kết nối"/Authorize.

   Guard chống sai tài khoản (so `share_url` vừa Authorize với `channel.tiktok_handle`,
   `lib/tiktok/verify-account.ts`) **đã tồn tại từ M0 nhưng chỉ cảnh báo, không chặn** — đây là lý do
   sự cố lọt qua mà không ai để ý (banner cảnh báo chỉ hiện 1 lần ngay sau khi kết nối, không phải
   trạng thái thường trực). **Đã sửa (21/08/2026)**: mismatch giờ **chặn hẳn**, không lưu token —
   xem `app/api/oauth/callback/route.ts`. Tài khoản TikTok chưa có video nào (không có `share_url` để
   đối chiếu — chính là điểm mù duy nhất guard không tự xác minh được) vẫn lưu token nhưng
   `channel_oauth.account_verified = false`, và `lib/tiktok/sync.ts` **từ chối sync** cho tới khi có
   người xác nhận tay qua `POST /api/channels/:id/oauth/verify`. Chi tiết dọn dữ liệu sai:
   [PROGRESS.md](PROGRESS.md) mục "Đợt 1 sửa dữ liệu".

   **Bài học vận hành**: trước khi bấm "Kết nối" cho một kênh thật, kiểm tra trình duyệt đang đăng
   nhập TikTok bằng đúng tài khoản của kênh đó — đừng dựa hoàn toàn vào guard, nó chỉ là lưới an
   toàn thứ hai.

6. **Redirect URI bắt buộc `https://` VÀ không được là `localhost` dưới bất kỳ hình thức nào.**
   ✅ Kiểm chứng 20/08/2026: không chỉ `http://localhost` — **`https://localhost:3000/...` cũng bị
   TikTok từ chối thẳng** lúc khai báo, kèm thông báo "Enter a valid redirect uri (localhost is not
   supported)". Thông tin "dùng `https://localhost` + `next dev --experimental-https`" ở các bản docs
   trước đây **sai**, đã sửa. Cách đúng: dùng domain thật đã deploy (vd. `*.vercel.app`) làm redirect
   URI, kể cả khi test — route đích (`/api/oauth/callback`) chưa tồn tại thì trình duyệt vẫn nhảy tới
   đó và trả 404, **không sao**, `code` vẫn nằm nguyên trên query string của thanh địa chỉ, copy dùng
   bình thường. Không cần cloudflared/ngrok nếu đã có domain Vercel.

7. **Lỗi trả về kèm HTTP 200.** Response luôn có `error.code`; thành công là `"ok"`. Kiểm mỗi
   `res.ok` sẽ nuốt lỗi im lặng — phải kiểm cả `error.code`. `error.log_id` là thứ TikTok cần khi
   báo lỗi, luôn log lại.

8. **`code` trong callback phải URL-decode trước khi đổi token.** Doc nói tường minh
   ("The value should be URL decoded"); code thật có đuôi dạng `*1` rất dễ hỏng nếu quên.

9. **TikTok không biết "kênh nào" đang được kết nối — chỉ hỏi tài khoản đang đăng nhập có đồng ý
   không.** Nếu trình duyệt lỡ đang đăng nhập nhầm tài khoản TikTok khác lúc bấm "Kết nối" (tài khoản
   test, tài khoản kênh khác), token của tài khoản sai sẽ bị lưu vào đúng `channel_oauth` của kênh
   định kết nối — sai âm thầm, mọi lần đồng bộ sau đó ghi số của tài khoản sai vào kênh đúng.
   `app/api/oauth/callback/route.ts` đối chiếu `share_url` của 1 video (gọi nhẹ — 1 trang, 1 video,
   không phân trang) với `channel.tiktok_handle`. Không dùng scope `user.info.profile` để lấy
   `username` trực tiếp — scope đó chưa được kiểm chứng ở M0 (chỉ `user.info.basic`/`stats` +
   `video.list` đã chạy thật). Kênh chưa có video nào thì không kiểm được — bỏ qua, không chặn.
   **Sửa 20/08/2026 (review sau khi code xong):** ban đầu **chặn hẳn** khi lệch, nhưng hạ xuống
   **chỉ cảnh báo, vẫn lưu token** — bản thân `share_url` cũng chưa từng được xác nhận trả về ổn định
   ở M0 (probe chỉ log 4 field metric, không log field này), nên để 1 tín hiệu chưa chắc chắn có
   quyền chặn hẳn một kết nối hợp lệ là rủi ro lớn hơn lợi ích. Kết nối lại mà `open_id` đổi — cùng
   cách xử lý, cảnh báo không chặn (đổi tài khoản có thể là cố ý, sửa lại lần kết nối sai trước đó).

10. 🐞 **Lần sync đầu tiên của 1 kênh không có baseline để tính delta — nếu cứ áp thuật toán
    "video không có snapshot trước = video mới, cộng trọn view" cho mọi video, sẽ ghi
    `video_views` = tổng view **luỹ kế trọn đời** của cả kênh vào đúng 1 ngày** (kiểm chứng bằng data
    thật: kênh `nong.nghiep.xanh.17` sẽ ghi ra ~1.199.034, trong khi view/ngày thật chỉ 85k-175k —
    sai khoảng 10 lần). Phát hiện lúc review lại code M3b (20/08/2026), không phải lúc code lần đầu —
    thuật toán port đúng từ `probe.mjs`, nhưng probe luôn có sẵn 2 snapshot để so, còn app thì lần
    chạy đầu tiên không có. **Sửa:** `lib/tiktok/sync.ts` phát hiện bootstrap (channel_oauth
    `last_sync_at` rỗng) → ghi `video_views = null` (không phải 0 — "chưa biết" khác "biết là 0"),
    vẫn ghi `video_snapshot` để làm baseline cho lần sync kế tiếp.

11. 🐞 **Cron chạy cố định 03:00 giờ VN — thời điểm đó đã lệch sang ngày lịch mới, nên nếu gán
    `data_snapshot.date` = ngày hiện tại lúc sync chạy thì số bị ghi lệch 1 ngày** so với ngày nó
    thực sự đo. Ví dụ: cron chạy 03:00 ngày D, so cumulative view với snapshot 03:00 ngày D-1 → phần
    lớn khoảng thời gian đó (21/24 giờ) thuộc về ngày D-1, nhưng nếu gán ngày = D thì sai. Về sau khi
    `studio_import` ghi đè đúng ngày D-1 thật, sẽ thấy 2 nguồn lệch nhau đúng 1 ngày — giống hệt kiểu
    lỗi cột `Difference in followers` của CSV_FORMAT.md mục 5. **Sửa:** `date` không suy từ "hôm nay"
    hay trừ cứng "-1 ngày" (trừ cứng sai với nút "Chạy đồng bộ ngay" bấm giữa ngày, có thể double-count
    nếu cron đã chạy sẵn sáng hôm đó) — mà suy từ `channel_oauth.last_sync_at` (đúng ngày lịch của lần
    sync trước, tức ngày khởi đầu quãng delta vừa đo). Hàm thuần `determineSyncDate()` trong
    `lib/tiktok/sync.ts`, có test riêng bao gồm cả tình huống "Chạy đồng bộ ngay" bấm cùng ngày cron
    đã chạy.

## Việc cần kiểm chứng (M0)

> Bộ kiểm chứng đã viết sẵn: [`tools/m0-display-api-probe/`](../tools/m0-display-api-probe/README.md)
> — Node thuần, không phụ thuộc app, tự xuất báo cáo điền sẵn checklist dưới đây.

- [ ] Sandbox có gọi được `user.info.stats` + `video.list` không
- [ ] `video/list` có trả `view_count` qua `fields` không, hay phải dùng `video/query`
- [ ] `video_count` có khớp số video `video/list` trả về không
- [ ] Phân trang hết bao nhiêu trang cho kênh thật, có chặn ở mốc nào không
- [ ] Đối chiếu `view_count` API với `Video Views` Studio cùng ngày — lệch bao nhiêu %
      (cần **2 snapshot cách nhau 24h** rồi lấy chênh lệch theo từng video — `view_count` là luỹ kế
      trọn đời nên không so trực tiếp với số theo ngày của Studio được)
- [ ] `refresh_token` có thật sự xoay vòng sau mỗi lần refresh không (doc: "may be different")

## Nguồn

- [Get User Info — /v2/user/info/](https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info)
- [List Videos — /v2/video/list/](https://developers.tiktok.com/doc/tiktok-api-v2-video-list)
- [Query Videos — /v2/video/query/](https://developers.tiktok.com/doc/tiktok-api-v2-video-query)
- [Display API Overview](https://developers.tiktok.com/doc/display-api-overview)
- [TikTok API Scopes](https://developers.tiktok.com/doc/tiktok-api-scopes)
- [Manage User Access Tokens](https://developers.tiktok.com/doc/oauth-user-access-token-management)
- [Add a Sandbox](https://developers.tiktok.com/doc/add-a-sandbox/)
- [Introducing Sandbox Mode](https://developers.tiktok.com/blog/introducing-sandbox)
- [TikTok API Rate Limits 2026 — Phyllo](https://www.getphyllo.com/post/tiktok-api-rate-limits-in-2026-quotas-errors-workarounds)
- [TikTok API Integration Guide 2026 — Phyllo](https://www.getphyllo.com/post/tiktok-api-integration-guide-2026-setup-endpoints-common-pitfalls)
