# TikTok Display API — tham chiếu

Nguồn dữ liệu hằng ngày cho 3 chỉ số nóng. Chiến lược tổng thể: [DATA_SOURCES.md](DATA_SOURCES.md).

> ✅ **Cập nhật 20/08/2026 (M0 + M3b):** phần lớn tài liệu này đã chạy thật trên sandbox (3 tài khoản,
> kể cả 2 kênh thật) — xem các dòng "Đã kiểm chứng" bên dưới. Code app thật (`lib/tiktok/`) port trực
> tiếp từ script kiểm chứng M0 đã chạy thật trên sandbox, không viết lại từ đầu. Còn đúng 1 mục 🔬
> chưa đo được (mục 5 bên dưới) — cần Manager OAuth thật qua `/connections` trước.

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

## Nộp duyệt Production — bị từ chối lần 1 vì Website URL (TikTok đổi trạng thái 31/08/2026 19:02, phát hiện 04/09)

Đơn nộp 26/08 bị trả về. Đúng **một** field bị chê: **Website URL**. Nguyên văn reviewer:

> Your externally facing website must be fully developed and cannot be a landing or login page.
> If it is a login page, you must provide a test account and password in the Apply Reason field.

Nguyên nhân: `https://ahd-dashboard-dusky.vercel.app/` trả `307 → /login`, reviewer chỉ thấy một form
đăng nhập trần. App không bị chê gì về scope hay cách dùng dữ liệu.

**Không dựng landing page để chữa** — reviewer nói rõ landing page cũng không được tính. Cách họ chỉ
định là: giữ nguyên trang login, **khai username + password của một tài khoản test trong ô "Apply
Reason"** lúc resubmit.

### Tài khoản demo cho reviewer

⚠️ **Không bao giờ đưa tài khoản Manager** (`andang`): Manager xoá kênh/nhân sự là xoá thật, chốt sổ
KPI, tạo tài khoản.

Creator **cũng không phải read-only**. Một Creator được gán kênh vẫn:

- ngắt kết nối Display API của kênh đó (`POST /api/channels/:id/oauth/disconnect`) → revoke grant
  phía TikTok, phải nhờ chủ kênh Authorize lại;
- upload zip Studio đè lên `data_snapshot` thật;
- đổi tên kênh.

Nên có thêm chốt chặn ghi, bật bằng biến môi trường **`DEMO_CREATOR_USERNAME`** (`.env.example`):

| | |
| :--- | :--- |
| Nguồn sự thật | `isDemoAccount()` / `requireWritableUser()` trong `lib/auth.ts` |
| Chặn ở server | 5 route ghi Creator chạm được (`oauth/start`, `oauth/verify`, `oauth/disconnect`, `import`, `name`) + `updateChannelNameAction`. `requireManager()` cũng chặn — fail closed nếu lỡ trỏ biến vào một Manager |
| Ẩn ở UI | nút Kết nối / Ngắt kết nối / Xác nhận tài khoản (`/connections`), uploader (`/import`), nút sửa tên kênh (`/channels`) |
| Vì sao ẩn cả UI | reviewer bấm nút rồi ăn 403 sẽ đọc thành "app hỏng" — lại thành lý do từ chối khác |

Biến này chỉ là **tạm thời**. App duyệt xong: xoá biến trên Vercel **và** xoá tài khoản demo.

### Có cần gán kênh cho tài khoản demo không?

`20260820000006_rls.sql` cho **mọi tài khoản đã đăng nhập** `select` toàn bộ `channel`,
`data_snapshot`, `video_snapshot`, `content_video`, `kpi_cycle`… (RLS chỉ chặn GHI) — nên phần lớn app
xem được kể cả khi không gán kênh. Nhưng các màn "của tôi" thì lọc theo `creatorId`, và đó mới là chỗ
quyết định:

Kiểm bằng tài khoản demo thật (`test`, 04/09/2026 — ảnh chụp từng màn):

| Màn | Creator không có kênh thấy gì |
| :--- | :--- |
| `/` Tổng quan | Số liệu toàn team **đầy đủ** (52,5M view · 78,3k follower · 541 video · 1,49M like, biểu đồ 8 tuần, "Tình hình KPI 1/1"). Nhưng block đầu trang là **"Kênh của tôi (0) — Bạn chưa được gán phụ trách kênh nào"** |
| `/channels` + chi tiết kênh | **Toàn bộ 9 kênh** kèm follower/view/video/KPI — `listChannels(supabase)` ở trang này không lọc theo creator |
| `/kpi` | ❌ **RỖNG** — với Creator đây là "KPI của tôi", lọc theo creator: "0 kênh · Bạn chưa được phân công phụ trách kênh nào" |
| `/connections`, `/import` | Rỗng (2 trang này lọc theo `creatorId`) |

⚠️ Vậy tài khoản không gán kênh để lại **3 màn rỗng** (Kênh của tôi, KPI của tôi, Kết nối). Với một
reviewer vừa từ chối app vì "not fully developed", đó là rủi ro thật.

**Đánh đổi phải cân:**

- **Không gán kênh** — không đụng gì tới creator thật, nhưng 3 màn rỗng như trên.
- **Gán 1 kênh** — cả 4 tab đều có nội dung, `/connections` hiện đúng một dòng trạng thái token
  (nút đã ẩn) nên reviewer thấy được chỗ dùng Login Kit. Cái giá: `channel.current_creator_id` chỉ
  giữ được **một** creator → creator thật mất `/connections`, `/import` và "KPI của tôi" của kênh đó
  suốt kỳ review. Manager vẫn import hộ được mọi kênh nên thiệt hại vận hành nhỏ. **Gán lại đúng
  creator cũ ngay sau khi app được duyệt.**

Kể cả có gán, reviewer **cũng không tự Authorize được**: app còn ở sandbox, tài khoản TikTok của họ
không nằm trong Target Users → `non_sandbox_target`. Ẩn nút + nói rõ trong Apply Reason sạch hơn là
để họ bấm rồi ăn lỗi khó hiểu.

📌 **Đã gán (04/09/2026): kênh "Làm Nông Thông Thái" đang thuộc tài khoản demo `test`.** Creator thật
của kênh này là **Phạm Minh Trí** — vẫn còn giữ "Cùng Anh Đi Muôn Nơi" nên không mất hết quyền.
⚠️ **Gán lại "Làm Nông Thông Thái" cho Phạm Minh Trí ngay khi app được duyệt** — không có gì tự nhắc
việc này, `channel_ownership_history` chỉ ghi lại chứ không hoàn tác.

### Quy trình resubmit

1. Manager tạo Creator demo ở `/creators`, **không gán kênh**. (Creator không tự đổi được mật khẩu —
   đó là thao tác Manager-only — nên credential đã khai vẫn đúng suốt kỳ review.)
2. Đặt `DEMO_CREATOR_USERNAME` = username đó trên Vercel (scope Production), redeploy.
3. Tự đăng nhập bằng tài khoản demo kiểm 3 điểm: `/channels` có đủ kênh và số liệu; `/connections`
   không còn nút Kết nối/Ngắt kết nối; `/import` hiện dòng "Tài khoản demo chỉ xem".
4. Sửa Website URL (giữ nguyên URL cũ) + dán "Apply Reason" dưới đây, resubmit.

### Ô "Apply Reason" thực ra nằm ở đâu — và giới hạn 1000 ký tự

Portal **không có** field tên "Apply Reason". Chỗ reviewer nói tới là ô ở mục **App review**:
*"Explain how each product and scope works within your app or website. If submitting a revision,
include the changes in this version."* — **tối đa 1000 ký tự**, và nó đang phải gánh cả phần giải
thích scope. Đừng soạn văn bản dài rồi mới phát hiện không dán vừa.

Bản đang dùng (986 ký tự, credential đặt lên đầu để reviewer đọc được ngay):

```
Test account (the login form takes a USERNAME, not an email):
https://ahd-dashboard-dusky.vercel.app/login
username: test
password: <mật khẩu>
It is read-only: Connections shows status only, no authorize/revoke buttons.

Changes in this version: added the test account above, as requested by the reviewer.

AHD Dashboard is an internal tool our own team uses to track performance of the 9 TikTok
accounts we directly operate.

Login Kit: each channel owner signs in with their own TikTok account through TikTok's OAuth
screen to connect their channel. We never see their password.

Scopes:
- user.info.basic: identifies the authorized account.
- user.info.stats: follower_count and video_count, charted over time.
- video.list: per-video view/like/comment/share counts, to compute growth since the previous check.

Data is stored privately and shown only to our own management team. Never public, never shared
with third parties, never used for ads. Owners can revoke access anytime.
```

### Bẫy quy trình trên portal

- App đang ở trạng thái **Not approved** thì mọi field **read-only**. Phải bấm **Return to Draft**
  (góc phải trên) → Confirm mới sửa được.
- **Return to Draft chỉ có hiệu lực trong phiên đang mở.** Rời trang / reload trước khi bấm **Save**
  là mất hết, app quay lại "Not approved". Sửa xong phải Save ngay, đừng điều hướng đi đâu.
- Website URL đổi từ `…vercel.app/` sang **`…vercel.app/login`** — reviewer yêu cầu "update the
  following fields", và trỏ thẳng vào trang login đỡ cho họ một cú `307` từ trang gốc.
- Những thứ đã có sẵn, không phải làm lại: App icon, Terms/Privacy URL, Redirect URI, demo video
  `0825.mp4`.

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
   người xác nhận tay qua `POST /api/channels/:id/oauth/verify`. Dữ liệu sai phát sinh từ bug này trên
   production đã được dọn tay một lần, không còn tồn tại trong DB hiện tại.

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
    thuật toán port đúng từ script kiểm chứng M0, nhưng script đó luôn có sẵn 2 snapshot để so, còn app thì lần
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

12. 🐞 **CHƯA SỬA (24/08/2026) — bấm "Chạy đồng bộ ngay" nhiều lần trong một ngày làm CỤT số view
    của ngày đó.** Đây là mặt trái của chính cách sửa ở bẫy #11. `determineSyncDate()` gán delta vào
    ngày lịch của lần sync TRƯỚC, còn `data_snapshot` thì upsert **ghi đè** theo
    `(channel_id, date, source)`. Ghép lại:

    | Lúc | Ghi vào ngày | Số view ghi | Hậu quả |
    | :--- | :--- | :--- | :--- |
    | Cron 03:00 ngày 24 | 23 | 24h của ngày 23 | ✓ đúng |
    | Bấm sync 14:05 ngày 24 | 24 | 11h đầu ngày 24 | tạm ổn |
    | Bấm sync 14:10 ngày 24 | 24 | **5 phút** | ❌ đè mất 11h |
    | Cron 03:00 ngày 25 | 24 | 13h cuối | ❌ đè tiếp |

    Ngày 24 kết thúc chỉ còn quãng `[14:10 → 03:00]`, mất trắng phần từ đầu ngày tới lần bấm cuối.
    Bẫy #11 đã cân nhắc nút "Chạy đồng bộ ngay" nhưng chỉ để **chống double-count**, và chọn ghi đè
    để đạt mục tiêu đó — ghi đè đúng là không cộng trùng, nhưng đổi lại thì mất dữ liệu. Test
    `sync.test.ts` có ca "same-day manual re-sync" nhưng chỉ khẳng định `date`, không hề chạm tới
    chuyện giá trị bị đè. Rất khó phát hiện bằng mắt: view/ngày dao động tự nhiên rất mạnh nên một
    con số thấp bất thường trông vẫn hợp lý.

    **Phương án (đã chốt hướng, chưa code):** bỏ hẳn cách suy delta từ `last_sync_at`. `video_snapshot`
    vốn đã lưu view **luỹ kế trọn đời** theo `(content_video_id, date)` và mỗi lần sync trong ngày chỉ
    làm mới giá trị của đúng ngày đó — tức nó đã là "ảnh chụp cuối ngày D". Nên định nghĩa lại:

    > `view ngày D = Σ_video ( luỹ_kế(video, D) − luỹ_kế(video, D−1) )`

    Tính lại từ đầu sau mỗi lần sync. **Idempotent** — bấm sync 10 lần/ngày chỉ làm ảnh chụp ngày D
    chính xác hơn, không bao giờ mất gì, và không double-count. Đồng thời vô hiệu hoá luôn bẫy #13.
    Video xuất hiện lần đầu ở ngày D: chỉ cộng trọn view nếu `posted_at` nằm trong ngày D; nếu
    `posted_at` cũ hơn (thấy muộn do rate limit / mới kết nối) thì **loại khỏi tổng và đặt
    `is_complete = false`**, đừng cộng trọn — đó chính là kiểu rò ở bẫy #10.

    Kèm theo: **dời cron từ 03:00 sang 23:30 giờ VN**, để `video_snapshot.date = D` đúng nghĩa đen là
    "cuối ngày lịch D" thay vì "03:00 sáng hôm sau". Giữ 03:00 thì công thức trên vẫn chạy nhưng mỗi
    ngày bị lệch 3 tiếng, và phép so display_api ↔ studio_import (mục "Vẫn còn thiếu phép đo gốc" ở
    bẫy #5) không bao giờ khớp được. Chọn 23:30 chứ không phải 23:55 để chừa đệm chống Vercel Cron
    chạy trễ vượt qua nửa đêm — trôi qua ranh giới ngày sẽ làm 2 lần chạy rơi vào cùng một ngày lịch.

13. 🐞 **CHƯA SỬA (24/08/2026) — kết nối lại không reset trạng thái sync.** Upsert ở
    `app/api/oauth/callback/route.ts` ghi 8 cột (`tiktok_open_id`, 2 token, 2 hạn, `scopes`,
    `account_verified`) nhưng **không đụng `last_sync_at` / `last_sync_status` / `last_sync_error`**.
    Kênh ngắt 15/08 rồi nối lại 24/08 → lần sync đầu gán delta 9 ngày vào **ngày 15/08**, và so với
    baseline `video_snapshot` cũ (lookback 30 ngày). Nếu nối lại bằng tài khoản TikTok **khác** thì
    baseline là video của tài khoản cũ, video tài khoản mới đều "chưa từng thấy" → rò view trọn đời
    y hệt bẫy #10. Nhánh bootstrap không cứu được vì nó chỉ kích hoạt khi `last_sync_at IS NULL`, mà
    kết nối lại thì không bao giờ null. **Sửa:** hoặc reset 3 cột đó trong upsert của callback, hoặc
    áp phương án ở bẫy #12 (không còn phụ thuộc `last_sync_at` nữa thì lỗi này tự biến mất).

14. 🐞 **ĐÃ SỬA (28/08/2026) — `proxy.ts` nuốt luôn cron: route đồng bộ chưa bao giờ chạy tự động.**
    `PUBLIC_PATHS` trong `proxy.ts` không có `/api/sync/display-api`, nên mọi request không mang
    cookie session bị redirect `307 → /login?next=…` **trước khi** tới route handler. Vercel Cron gửi
    GET thuần (không session, chỉ có header `Authorization: Bearer $CRON_SECRET`) → luôn ăn 307,
    `isValidCronSecret()` không bao giờ được gọi. Triệu chứng khó đoán: cron **báo thành công** (307
    là 3xx, không phải lỗi), Vercel log không có gì bất thường, `channel_oauth.last_sync_status` vẫn
    `ok` từ lần bấm tay gần nhất — chỉ có dữ liệu là đứng im. Chẩn đoán bằng một dòng curl vào chính
    prod, `location` trả về là bằng chứng trực tiếp:

    ```bash
    curl -sD - -o /dev/null https://ahd-dashboard-dusky.vercel.app/api/sync/display-api
    ```

    Đúng thì phải là `401 {"error":"Thiếu hoặc sai CRON_SECRET."}` (đã tới handler); sai là `307` kèm
    `location: /login?next=%2Fapi%2Fsync%2Fdisplay-api`. Bằng chứng phụ trong DB: toàn bộ
    `data_snapshot` chỉ có **đúng một** ngày `display_api` (25/08), `created_at` rơi vào 08:48 và
    13:39 giờ VN — giờ hành chính, tức là hai lần bấm "Chạy đồng bộ ngay", không phải cron 23:30.
    **Sửa:** thêm path vào `PUBLIC_PATHS`; route tự gác sẵn rồi (GET so `CRON_SECRET` bằng
    `timingSafeEqual`, POST gọi `requireManager()`), bỏ proxy chỉ đổi redirect mù thành 401 đúng
    nghĩa. Cùng họ với bẫy file site-verification TikTok: **bất kỳ path nào do dịch vụ ngoài gọi vào
    — cron, webhook, file verify — đều phải nằm trong `PUBLIC_PATHS` kèm cơ chế tự xác thực trong
    handler.** Lưu ý phần vận hành: Vercel chỉ gắn header `Authorization` khi biến `CRON_SECRET` có
    mặt trong env của project — thiếu biến thì qua được proxy vẫn 401. Số của các ngày cron chết
    (26–28/08) **không lấy lại được** — Display API chỉ trả luỹ kế hiện tại, không có lịch sử theo
    ngày; phải chờ `studio_import` phủ.

## Việc cần kiểm chứng (M0)

> ✅ Đã kiểm chứng thực tế xong (20/08/2026) bằng một script Node thuần chạy ngoài app (không còn giữ
> trong repo — mục đích một lần, kết quả đã đúc kết đầy đủ vào tài liệu này) — kết quả tự động điền
> vào checklist dưới đây.

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
