# API Specification

Next.js Route Handlers (`app/api/...`). Auth qua Supabase session cookie. Mọi response lỗi: `{ error: string }` + HTTP status tương ứng.

Quy ước quyền: **M** = Manager only, **M/C** = Manager và Creator (Creator bị giới hạn phạm vi dữ liệu qua RLS).

---

## Channels

### `GET /api/channels` — M/C
Query: `?creatorId=<uuid>` (optional, lọc theo Creator)
```json
[{ "id": "...", "name": "Kênh A", "tiktokHandle": "@kenh_a",
   "isActive": true, "createdAt": "2026-08-20T03:00:00Z",
   "currentCreator": { "id": "...", "name": "Nguyễn A" },
   "latestStats": { "date": "2026-08-19", "views": 120000, "videos": 14, "followers": 6000,
                    "engagementRate": 0.0182, "source": "display_api", "isComplete": true } }]
```
`isActive`/`createdAt` thêm ở M2 (không có trong bản đặc tả gốc) — `PATCH` đã nhận `isActive` từ đầu
nhưng `GET` không trả lại để Manager xem trạng thái hiện tại trước khi đổi. `latestStats` là `null`
nếu kênh chưa có `data_snapshot` nào (đọc qua `v_channel_latest`, xem [DATABASE_ERD.md](DATABASE_ERD.md)).

### `POST /api/channels` — M
```json
{ "name": "Kênh A", "tiktokHandle": "@kenh_a", "creatorId": "<uuid>" }
```
→ `201` trả channel vừa tạo.

### `PATCH /api/channels/:id` — M
```json
{ "name": "...", "creatorId": "<uuid>", "isActive": true }
```
Đổi `creatorId` → tự đóng row `channel_ownership_history` cũ (`to_date = today`) và mở row mới.

### `DELETE /api/channels/:id` — M
Xoá thật (21/08/2026, theo yêu cầu — không phải soft-delete). **Xoá vĩnh viễn theo tầng** mọi
`data_snapshot`, `content_video`/`video_snapshot`, `audience_snapshot`, `channel_oauth`,
`channel_ownership_history`, `kpi_cycle` của kênh này (FK `on delete cascade`, xem
[DATABASE_ERD.md](DATABASE_ERD.md)). Chặn bằng `400` (`ValidationError`) nếu kênh có bất kỳ `kpi_cycle.status = 'final'` nào — số liệu đã chốt dùng tính thưởng/lương không được xoá kèm channel.
Ghi `audit_log` (`entity_type: "channel", action: "deleted"`) sau khi xoá thành công. UI xác nhận bằng
gõ đúng tên kênh trước khi bấm xoá (`ConfirmDeleteForm`) — route này không có bước đó, gọi trực tiếp
là xoá luôn.
→ `{ "ok": true }`.

---

## Creators

### `GET /api/creators` — M/C
```json
[{ "id": "...", "name": "Nguyễn A", "username": "nguyen.a", "channelCount": 2, "isActive": true,
   "channels": [{ "id": "...", "name": "Kênh A", "tiktokHandle": "@kenh_a" }],
   "team": { "id": "...", "name": "Team 1" } }]
```
`channels` thêm ở M2 (không có trong bản đặc tả gốc) — màn `/creators` cần liệt kê "kênh phụ trách"
theo từng Creator (design/Creators.dc.html). `team` thêm 21/08/2026 (mục "Team" bên dưới) —
`null` khi Creator chưa gán team, cùng shape null-khi-chưa-gán với `channel.currentCreator`. `email`
**đổi thành `username`** cùng ngày (theo yêu cầu) — xem "Đăng nhập bằng username" bên dưới.

### `POST /api/creators` — M
Tạo tài khoản Creator (Admin cấp, không có self-signup).
```json
{ "name": "Nguyễn A", "username": "nguyen.a", "password": "<mật khẩu>", "teamId": "..." }
```
`username`: chữ thường, số, dấu chấm/gạch dưới/gạch ngang, 3-32 ký tự (`requireUsername()`,
`lib/validation.ts`) — `400` nếu sai định dạng, `400` nếu đã tồn tại.
`teamId` optional, bỏ qua = chưa gán team. → `201`. Tạo user trong Supabase Auth trước (email nội bộ
tự sinh `{username}@creator.internal` — Supabase Auth bắt buộc phải có email, nhưng không ai thấy/gõ
giá trị này), insert row `creator` sau — lỗi ở bước insert thì xoá lại auth user vừa tạo (không sẽ
mắc kẹt ở `email_exists` mãi mãi). Không gửi lời mời tự động (chưa có SMTP) — mật khẩu chỉ hiện lại
một lần ở màn hình `/creators` ngay sau khi tạo, Manager tự gửi riêng.

### Đăng nhập bằng username (22/08/2026, theo yêu cầu)

Không còn khái niệm email ở tầng người dùng — Manager và Creator đều đăng nhập bằng `username`.
Không có route REST riêng cho việc này (form đăng nhập gọi thẳng server action `signIn()`,
`app/login/actions.ts`), nhưng ghi lại đây vì đổi cả model nhận diện:

- `manager`/`creator` đều có cột `username` (unique, not null,
  `supabase/migrations/20260822000001_username.sql`) — đây là định danh duy nhất người dùng thấy.
- Cột `email` **vẫn còn** ở cả 2 bảng — Supabase Auth bắt buộc phải có, nhưng chỉ dùng nội bộ. Tài
  khoản tạo trước 22/08/2026 giữ nguyên email thật (không đổi mật khẩu, không ai bị đăng xuất khi
  migrate); tài khoản tạo sau đó có email tự sinh (`{username}@creator.internal`) không ai cần biết.
- `resolveLoginEmail()` (`lib/auth.ts`) tra `username` → `email` thật trước khi gọi
  `supabase.auth.signInWithPassword()` — chạy bằng admin client vì chưa có phiên đăng nhập nào để
  RLS cho phép đọc bảng `manager`/`creator`. Gõ email cũ ra (còn dấu `@`) vẫn được chấp nhận làm dự
  phòng, không cần tra cứu.

### `PATCH /api/creators/:id` — M
Không có trong bản đặc tả gốc — thêm ở M2 để Manager đổi tên hoặc vô hiệu hoá một Creator (ví dụ nghỉ
việc) mà không phải sửa thẳng trong Supabase. Không xoá tài khoản — xoá thật nằm ở `DELETE` bên dưới.
```json
{ "name": "...", "isActive": false, "teamId": null }
```
`teamId`: bỏ qua field = không đổi; `null` = gỡ khỏi team hiện tại; uuid = gán/đổi team.
→ Trả về `creator` sau khi sửa, cùng shape với `GET /api/creators`.

Đổi mật khẩu (Manager đặt lại giúp Creator, 21/08/2026 — chưa có màn tự phục vụ) hiện **chỉ có ở UI**
(`resetCreatorPasswordAction`, `app/(app)/creators/actions.ts`), không qua route REST — không có lý
do phải expose qua API khi chưa ai cần gọi từ ngoài UI.

### `DELETE /api/creators/:id` — M
Xoá thật (21/08/2026, theo yêu cầu — không phải soft-delete/vô hiệu hoá). Xoá Auth user trước (không
xoá thẳng row `creator`) — `creator.id references auth.users(id) on delete cascade`
([DATABASE_ERD.md](DATABASE_ERD.md)) tự xoá row `creator` theo. Cùng lượt đó, **mất vĩnh viễn**
`channel_ownership_history` của người này (lịch sử ai từng phụ trách kênh nào, khoảng ngày nào) —
kênh đang phụ trách thì **không** bị xoá, chỉ thành chưa gán (`current_creator_id` là
`on delete set null`). Ghi `audit_log` (`entity_type: "creator", action: "deleted"`) sau khi xoá
thành công. UI xác nhận bằng gõ đúng tên nhân sự trước khi bấm xoá (`ConfirmDeleteForm`) — route này
không có bước đó, gọi trực tiếp là xoá luôn.
→ `{ "ok": true }`.

---

## Team

Thêm 21/08/2026, ngoài bản đặc tả gốc — nhãn tổ chức nhóm Creator (ví dụ "1 manager quản lý 2 team"),
**không phải biên giới phân quyền**: không đổi ai thấy được gì, chỉ để lọc màn Tổng quan/quản lý
Creator theo team. Chi tiết quyết định: [DATABASE_ERD.md](DATABASE_ERD.md) mục "`team`".

### `GET /api/teams` — M/C
```json
[{ "id": "...", "name": "Team 1", "creatorCount": 3 }]
```

### `POST /api/teams` — M
```json
{ "name": "Team 1" }
```
→ `201`, trả về team vừa tạo (`creatorCount: 0`).

### `PATCH /api/teams/:id` — M
Đổi tên — team không có field nào khác để sửa.
```json
{ "name": "Team mới" }
```

### `DELETE /api/teams/:id` — M
Xoá team. `creator.team_id` là `on delete set null` — Creator trong team **không** bị xoá, chỉ thành
chưa gán team.

---

## KPI Cycles

M5 (25/08/2026). 4 lệch so với bản đặc tả gốc, tất cả đã bàn trước khi code (xem CLAUDE.md, ghi chú
25/08/2026):

1. **Công thức `overallPct` đổi từ `/3` cố định sang trung bình theo số chỉ tiêu đã đặt** — một
   cycle chỉ cần ≥1 trong 3 chỉ tiêu (Views/Videos/Followers), không bắt buộc cả 3. Xem mục "Công
   thức progress" bên dưới.
2. **Chỉ báo 🟢🟡🔴 đổi tên từ `status` thành `health`** — `kpi_cycle.status` đã dùng cho
   `draft`/`final` (trạng thái quy trình); giữ nguyên tên `status` cho cả hai sẽ đụng khoá trên cùng
   một object.
3. **Kênh chưa có `followers` nào được ghi nhận** → `POST` trả `400` (`ValidationError`), không phải
   `422` — `422` để dành riêng cho `finalize` (M6, chưa cài đặt) vì đó là shape lỗi khác hẳn
   (`reasons`/`missingDates`/`unlockAt`).
4. **Thêm `DELETE /api/kpi-cycles/:id`** — không có trong danh sách task gốc. `channelId` và
   `followersAtStart` không sửa được qua `PATCH` (đổi kênh làm `followersAtStart` đã chụp vô nghĩa),
   nên tạo nhầm kênh là lỗi không có đường sửa nào khác ngoài xoá; ràng buộc `EXCLUDE` cũng khoá luôn
   khoảng ngày đó cho tới khi xoá.

### `GET /api/kpi-cycles` — M/C
Query: `?channelId=`, `?status=draft|final`, `?activeOnly=true` (đang chạy = `periodStart <= hôm nay
<= periodEnd`, theo ngày lịch `Asia/Ho_Chi_Minh`). Creator chỉ thấy cycle của (nhiều nhất) đúng kênh
mình phụ trách — lọc ở tầng route (`?channelId=` của Creator cho kênh khác cũng bị bỏ qua), **không
dựa vào RLS**: policy của `kpi_cycle` cho mọi vai trò đã đăng nhập đọc toàn bộ (giống mọi bảng nghiệp
vụ khác — "Creator xem chéo số liệu kênh khác" trong CLAUDE.md là về dữ liệu kênh, không phải về
việc ai được giao chỉ tiêu).

Mỗi cycle luôn kèm sẵn `progress`/`health`/`remaining`/`forecast`/`dataGaps` — không có endpoint
riêng để lấy progress, tính 1 lần ở server cho toàn bộ danh sách (2 truy vấn Supabase cho N cycle,
không phải 2×N — xem `lib/kpi.ts` `attachProgress`).

```json
[{ "id": "...", "channelId": "...", "periodType": "weekly",
   "periodStart": "2026-08-17", "periodEnd": "2026-08-23",
   "targetViews": 500000, "targetVideos": 20, "targetFollowers": 10000,
   "followersAtStart": 5000, "status": "draft",
   "finalizedBy": null, "finalizedAt": null, "createdAt": "2026-08-17T02:00:00Z",

   "actuals": { "views": 226000, "videos": 12, "followersNow": 5800 },
   "progress": { "viewsPct": 45.2, "videosPct": 60.0, "followersPct": 20.0,
                 "overallPct": 41.7, "targetCount": 3 },
   "health": { "value": "yellow", "overallPct": 42, "elapsedPct": 57,
               "explanation": "Đã qua 57% chu kỳ, hoàn thành 42% chỉ tiêu." },
   "remaining": {
     "views": { "remaining": 274000, "perDay": 91333 },
     "videos": { "remaining": 8, "perDay": 3 },
     "followers": { "remaining": 4200, "perDay": 1400 },
     "daysLeft": 3,
     "text": "Cần 91k view/ngày trong 3 ngày còn lại."
   },
   "forecast": { "overallPct": 73, "basis": "tốc độ trung bình từ đầu kỳ", "confidence": "low" },
   "dataGaps": { "missingDates": [], "manualOnlyDates": [] } }]
```

`remaining`/`forecast` lệch so với ví dụ đơn-view ở bản gốc (mục "Công thức progress" bên dưới) —
tổng quát hoá cho cả 3 chỉ tiêu, không riêng views, vì một cycle có thể không đặt chỉ tiêu views.
`forecast.basis` cũng đơn giản hoá từ "tốc độ trung bình 4 ngày qua" xuống "tốc độ trung bình từ đầu
kỳ" (ngoại suy tuyến tính `overallPct/elapsedPct`) — xem `lib/kpi.ts` `forecastOverallPct` để biết lý
do (một mô hình 4-ngày-gần-nhất cần truyền thêm chuỗi ngày qua nhiều tầng, cho một con số vốn đã được
đánh dấu "ước tính, độ tin cậy thấp"; có thể nâng cấp sau).

### `POST /api/kpi-cycles` — M
```json
{ "channelId": "<uuid>", "periodType": "weekly",
  "periodStart": "2026-08-17", "periodEnd": "2026-08-23",
  "targetViews": 500000, "targetVideos": 20, "targetFollowers": 10000 }
```
Cả 3 trường chỉ tiêu **optional nhưng cần ít nhất 1** — thiếu cả 3 → `400`.
→ `201`. Server tự chụp `followersAtStart` từ `v_channel_daily` (ngày gần nhất **có** `followers`
khác `null` — không phải row mới nhất bất kỳ, một row `display_api` mới nhất có thể chỉ có view).
Kênh chưa từng có `followers` nào → `400` (xem lệch #3 ở trên). Lỗi `409` nếu trùng khoảng ngày với
cycle khác cùng channel (`23P01`, `kpi_cycle_no_overlap`).

### `PATCH /api/kpi-cycles/:id` — M
Chỉ sửa được khi `status = draft`. Nếu `final` → `403`. Không nhận `channelId`/`followersAtStart`
(xem lệch #4). `targetViews`/`targetVideos`/`targetFollowers`: `null` = bỏ chỉ tiêu đó (vẫn phải giữ
lại ít nhất 1 trong 3), số = chỉnh giá trị. `409` nếu đổi ngày khiến trùng khoảng với cycle khác.

### `DELETE /api/kpi-cycles/:id` — M
Thêm ở M5, không có trong đặc tả gốc — xem lệch #4. Chỉ xoá được cycle `status = draft`; `final` →
`403`. Ghi `audit_log` (`entity_type: "kpi_cycle", action: "deleted"`).
→ `{ "ok": true }`.

### `POST /api/kpi-cycles/:id/finalize` — M — **M6, xong 26/08/2026**
**Không nhận file.** Chỉ tổng hợp `data_snapshot` đã có trong khoảng ngày của chu kỳ rồi khoá lại.
Import là việc riêng (xem `/api/channels/:id/import`).

Điều kiện mở khoá — thiếu bất kỳ cái nào đều trả `422` kèm chi tiết, **kiểm cả 3 cùng lúc** (không
dừng ở điều kiện đầu tiên fail) để Manager thấy hết những gì còn thiếu trong 1 lần, không phải sửa
xong 1 cái rồi mới biết còn cái tiếp theo:
1. Đã qua `periodEnd + 3 ngày` (Studio trễ 2 ngày, +1 an toàn — **hằng số riêng với cửa sổ chốt
   import** ở [DATA_SOURCES.md](DATA_SOURCES.md), giữ nguyên `+3` dù cửa sổ import đã đổi thành
   `−1` ngày 25/08/2026; xem `lib/kpi.ts` `finalizeUnlockAt` lý do không dùng chung hằng số)
2. Mọi ngày trong chu kỳ đều có row **đã resolve qua `v_channel_daily`** là `source = studio_import`
   — một ngày còn ở `display_api` tính là thiếu, dù có dữ liệu
3. Không còn ngày nào có row `manual_entry` **trong bảng thô `data_snapshot`** (không phải
   `v_channel_daily`) — khác gate 2 ở chỗ này: `studio_import` đè lên `manual_entry` cùng ngày không
   xoá row `manual_entry` cũ, nên một ngày có thể qua gate 2 (resolve ra studio_import) mà vẫn còn
   dính gate 3 nếu con `manual_entry` chưa được dọn

```json
// 422 khi chưa đủ điều kiện
{ "error": "cycle_not_ready",
  "reasons": ["too_early", "missing_studio_data", "has_manual_entry"],
  "missingDates": ["2026-08-22", "2026-08-23"],
  "manualEntryDates": ["2026-08-20"],
  "unlockAt": "2026-08-26" }
```
`reasons` là mảng — có thể chứa nhiều hơn 1 lý do cùng lúc. `manualEntryDates` là trường **mở rộng
so với bản đặc tả gốc** (chỉ có `missingDates`) — cần thiết vì gate 3 độc lập với gate 2 (xem trên).

→ Thành công: `status=final`, `finalized_by`, `finalized_at` → ghi `audit_log` (`action: "finalized"`).
Response là **shape `KpiCycleWithProgress` đầy đủ** (giống 1 phần tử của `GET /api/kpi-cycles`), không
phải riêng `KpiCycleSummary` — "tính % Final" nghĩa là trả kèm `progress`/`health` đã tính trên đúng
data vừa được xác nhận đủ điều kiện, không phải một field mới; không có cột lưu riêng % lúc chốt,
`data_snapshot` trong khoảng ngày đó coi như bất biến kể từ đây (mọi nguồn tin cậy hơn đã bị chặn ghi
đè bởi 3 gate trên) nên tính lại bằng `attachProgress()` bình thường luôn cho cùng kết quả.
`409` nếu đã final.

⚠️ **Chưa có ở M6:** import Studio không kiểm tra chu kỳ đã final trước khi ghi đè `data_snapshot` —
`lib/import/plan-import.ts`/`run-import.ts` chỉ quan tâm cửa sổ chốt (2 ngày trễ), không biết gì về
`kpi_cycle`. Về lý thuyết một import muộn hoặc sửa lại vẫn có thể ghi đè ngày đã "khoá vĩnh viễn" mà
không qua audit_log nào — trái với CLAUDE.md ("status = final → khoá số liệu"). Chưa xảy ra thật (chưa
có cycle nào final trước 26/08/2026) nhưng cần chặn trước khi dùng thật cho tính thưởng. Xem
[TASKS.md](TASKS.md) mục M6.

---

## Kết nối Display API

### `GET /api/channels/:id/oauth/start` — M/C
Trả URL uỷ quyền TikTok (scope `user.info.stats` + `video.list`), kèm `state` chống CSRF.
**Sửa ở M3b**: ban đầu chỉ M, mở thêm cho Creator — Creator có sẵn tài khoản TikTok của chính kênh
mình, Manager thì không, nên để Creator tự Authorize thực tế hơn. Creator chỉ gọi được cho **đúng
kênh mình đang phụ trách** (`channel.current_creator_id = user.id`), gọi cho kênh khác → `403`.

### `GET /api/oauth/callback` — public (TikTok gọi về)
Đổi `code` lấy token, lưu vào `channel_oauth` (mã hoá at-rest).

### `GET /api/channels/oauth/status` — M/C (Creator chỉ thấy kênh mình phụ trách)
Theo dõi sức khoẻ kết nối. Manager thấy toàn bộ 8 kênh; Creator chỉ thấy mảng gồm (nhiều nhất) đúng 1
kênh họ đang phụ trách. Dùng cho màn cảnh báo hạn token.
```json
[{ "channelId": "...", "channelName": "…", "connected": true,
   "refreshExpiresAt": "2027-08-19T00:00:00Z", "daysUntilExpiry": 365,
   "lastSyncAt": "2026-08-19T03:00:00Z", "lastSyncStatus": "ok" }]
```

---

## Đồng bộ & số liệu

### `/api/sync/display-api` — 2 method, không phải 1 — **sửa ở M3b**
Kéo `user/info` + toàn bộ video của mọi kênh active → ghi `video_snapshot`, tính view trong ngày bằng
**chênh lệch theo từng video**, ghi `data_snapshot(source=display_api)`.

- **`GET`** — Vercel Cron gọi hằng ngày 23:30 giờ VN (`vercel.json`, đổi từ 03:00 — 24/08/2026, xem
  [DISPLAY_API.md](DISPLAY_API.md) bẫy #12). Cron của Vercel **luôn gửi GET, không phải POST** (giới
  hạn nền tảng, không cấu hình được) — kiểm `Authorization: Bearer $CRON_SECRET`, không qua session.
- **`POST`** — M, nút "Chạy đồng bộ ngay" trên `/connections`.

Cả hai chạy chung logic, cùng response:
```json
{ "date": "2026-08-19", "synced": 8, "failed": 0,
  "incomplete": [{ "channelId": "...", "expectedVideos": 112, "gotVideos": 108 }] }
```

### `POST /api/channels/:id/import` — M
Upload file Studio. Body: `multipart/form-data`, nhận thẳng `.zip` (nhiều file cùng lúc).
```
files[]: Overview_*.zip, Followers_*.zip, Viewers_*.zip, Content_*.zip (Content không bắt buộc)
```
Query: `?dryRun=true` — **thêm ở M3a**, không có trong bản đặc tả gốc. Parse + trả về đúng response
bên dưới nhưng **không ghi gì vào DB** — dùng cho bước "xem trước" trước khi Manager bấm
"Lưu dữ liệu" (`design/Import.dc.html`). Bỏ `dryRun` (hoặc `dryRun=false`) mới ghi thật.

File `.zip` upload lên chỉ được parse lấy số rồi bỏ — **không lưu file** ở đâu (bỏ lưu zip 27/08/2026,
xem [DATABASE_ERD.md](../docs/DATABASE_ERD.md) mục "Storage: bucket studio-imports").

→ Giải nén, parse, ghi `data_snapshot(source=studio_import)` **chỉ cho ngày `< ngàyImport − 1`**
(cửa sổ chốt) — cửa sổ này **chỉ áp cho `data_snapshot`**, không áp cho `follower_activity`/
`audience_snapshot`/`content_video` (3 bảng này luôn ghi toàn bộ nội dung file, xem
[DATABASE_ERD.md](DATABASE_ERD.md) lý do: `FollowerActivity.csv` chỉ giữ 7 ngày/lần, cửa sổ không
chồng giữa các tuần nên lọc sẽ mất dữ liệu vĩnh viễn).

**Chặn import nhầm kênh — `400`, kiểm TRƯỚC mọi thứ khác (05/09/2026):** nếu chứng minh được bộ file
thuộc về kênh khác `:id`, trả `400` và không ghi gì. Chạy cả khi `dryRun=true` nên bước "xem trước"
đã báo lỗi. Bằng chứng: `@handle` trong `video_link` của `Content.csv`, hoặc handle nhúng trong tên
file zip. Không đọc ra handle nào (file bị rename, không có `Content.csv`) thì **cho qua** — chỉ chặn
khi chứng minh được. Chi tiết + lý do (đã hỏng dữ liệu thật 2 lần):
[lib/import/channel-guard.ts](../lib/import/channel-guard.ts), [PROGRESS.md](PROGRESS.md) mục "Import
nhầm kênh".

**Chặn riêng, kiểm trước cả cửa sổ chốt (26/08/2026):** ngày nào đã nằm trong 1 `kpi_cycle`
`status = final` thì **luôn** bị bỏ qua, bất kể cửa sổ chốt cho phép hay không — `data_snapshot`
của ngày đó coi như bất biến kể từ lúc chốt (CLAUDE.md "status = final → khoá số liệu"). Vào
`skippedFinalDates`, tách khỏi `skippedRecentDates` vì lý do khác nhau (một bên "chưa tới lượt", một
bên "đã khoá vĩnh viễn"). Chỉ check ở tầng `data_snapshot` — không áp cho 3 bảng ngoại lệ ở trên
(không phải số dùng tính KPI).
```json
{ "importedDates": ["2026-08-01", "…", "2026-08-16"],
  "skippedRecentDates": ["2026-08-17", "2026-08-18"],
  "skippedFinalDates": ["2026-08-10", "2026-08-11"],
  "discrepancies": [{ "date": "2026-08-14", "displayApi": 160000, "studio": 174608, "diffPct": 8.4 }],
  "videosUpserted": 15,
  "readDates": 59 }
```
`readDates` **thêm ở M3a** (không có trong bản đặc tả gốc) — tổng số ngày đọc được từ 3 file
Overview/FollowerHistory/Viewers trước khi lọc, phục vụ ô thống kê "Ngày đọc được" trong mockup.

### `POST /api/channels/:id/manual-entry` — M
Chỉ Manager. Ghi `data_snapshot(source=manual_entry)` + `audit_log`. Tự bị thay khi `studio_import` về.
Implementation: [lib/manual-entry.ts](../lib/manual-entry.ts), làm ở M3c (21/08/2026, sớm hơn thứ tự
đề xuất gốc — theo yêu cầu ngay sau khi M4 xong).
```json
{ "date": "2026-08-19", "videoViews": 150000, "followers": 9400, "videoCount": 112 }
```
Cả 3 trường số đều **optional**, nhưng phải có **ít nhất một** — thiếu cả 3 → `400`. Trường nào không
gửi thì giữ nguyên (không ghi `null` đè) nếu đang sửa một `manual_entry` đã có cho đúng ngày đó.
Response `201`:
```json
{ "date": "2026-08-19", "videoViews": 150000, "followers": 9400, "videoCount": null }
```

### `GET /api/channels/:id/snapshots` — M/C
Query: `?from=`, `?to=`, `?source=`
Mặc định trả **nguồn ưu tiên cao nhất mỗi ngày** ([DATABASE_ERD.md](DATABASE_ERD.md)); truyền `source`
để xem riêng một nguồn.
```json
[{ "date": "2026-08-16", "views": 85117, "followers": 994, "videos": 15,
   "engagementRate": 0.0182, "source": "studio_import", "isComplete": true }]
```
**Sửa ở M3b**: tên cột đổi từ `videoViews`/`videoCount` (bản gốc) sang `views`/`videos` — khớp đúng
`latestStats` của `GET /api/channels` (2 chỗ tả cùng 1 shape số liệu theo ngày trong bản gốc lại dùng
2 bộ tên khác nhau; đã hợp nhất về tên đang chạy thật trong `lib/channels.ts:toChannelStats`, dùng
chung cho cả 2 endpoint).

---

## Dashboard

### `GET /api/dashboard` — M/C
**Một endpoint dùng chung cho cả hai vai trò.** Server đọc vai trò từ session và thêm/bớt khối dữ
liệu — client không tự quyết định. Implementation: [lib/dashboard.ts](../lib/dashboard.ts)
`getDashboard()`, gọi trực tiếp từ `app/(app)/page.tsx` (page không tự fetch route này — cùng quy
ước với mọi trang khác trong `app/(app)/`).

Query: `?from=`, `?to=` (khoảng thời gian; mặc định 7 ngày qua, neo theo **hôm nay** — quyết định
21/08/2026, xem CLAUDE.md). `from`/`to` phải đúng dạng `YYYY-MM-DD`, và `from <= to`. `?creatorId=`
(optional, thêm 21/08/2026 theo phản hồi sau khi xong M4) — lọc `teamStats`/`trend`/`growth`/
`viewShare`/`efficiency`/`channelCount`/`dataFreshness` xuống đúng các kênh Creator đó đang phụ
trách; không ảnh hưởng `myChannels` (luôn là kênh của người đang đăng nhập, bất kể filter này).
`?teamId=` (optional, thêm 21/08/2026 cùng tính năng Team — mục "Team" bên dưới) — lọc theo cùng cách
nhưng xuống đúng các kênh có Creator thuộc team đó; có thể kết hợp với `?creatorId=` cùng lúc (kết
quả rỗng nếu 2 điều kiện không giao nhau — là câu trả lời đúng, không phải lỗi).
"So với kỳ trước" (`period.comparedFrom`/`comparedTo`, mọi `deltaPct`/`deltaAbs`) tự giãn theo đúng
**độ dài** của `[from, to]` đang chọn — chu kỳ 14 ngày thì so với 14 ngày liền trước, không cố định
7 ngày (`previousPeriod()` trong `lib/dashboard.ts`). Hai trường ngày riêng — không phải chuỗi
`"2026-08-08/2026-08-14"` gộp — để không màn hình nào render "so với kỳ trước" mà bỏ sót không nói
kỳ đó là ngày nào (CLAUDE.md, vấn đề 21/08/2026).

`teamStats.views.value` và `teamStats.viewsPerVideo.value` là **`number | null`** (28/08/2026):
`null` = không kênh nào trong tập có nổi một ngày đo được, khác hẳn `0` (đo được và thật sự bằng 0).
UI phải render "—", **không bao giờ render "0 view"** — cùng luật `unknown ≠ known-zero` mà
`data_snapshot.video_views` đã theo. Nguồn: `sumViewsOrNull()` trong `lib/dashboard.ts`; cùng luật
áp cho `RollupStat.totalViews` (Nhân sự / Team).

`dataFreshness.reconciledThrough` là ngày **TOÀN BỘ** kênh trong tập đã đối chiếu tới — ngày sớm
nhất trong các "studio_import mới nhất" của từng kênh, **không** phải ngày muộn nhất trên toàn tập
(sửa 28/08/2026: lấy max khiến 1 kênh import tốt nói thay cho cả 9). `null` khi còn kênh chưa đối
chiếu lần nào, và số kênh đó nằm ở `channelsNeverReconciled` — chúng chưa chốt sổ KPI được.

`weekStats` (thêm 04/09/2026, theo yêu cầu) — tổng team trong **tuần lịch cố định** (thứ Hai giờ VN
→ hôm nay), **không đổi theo `?from=`/`?to=`** đang chọn. Lý do: kỳ mặc định của Tổng quan là "Toàn
bộ thời gian" (`from=2020-01-01`); nếu tăng trưởng tính "so với kỳ trước" theo đúng độ dài kỳ đó, kỳ
so sánh bị đẩy lùi hàng nghìn ngày về trước khi kênh tồn tại → luôn ra `null` bị coerce thành "+0"
giả (bug đã sửa). `weekStats.views` cùng luật `null` = "chưa đo được ngày nào" như `teamStats.views`
(vd sáng thứ Hai, trước khi cron đêm chạy). `weekStats.likes` là tổng thô cột `data_snapshot.likes`
(chỉ `studio_import` ghi, không gate theo độ phủ) — số sẽ thấp giữa tuần, tới khi Manager upload file
Studio thứ Tư mới đủ, đây là đánh đổi có chủ đích (không chặn bằng "chưa đủ dữ liệu" vì like chỉ có
1 nguồn cập nhật 1 lần/tuần, gate sẽ luôn treo). `growth` (bên dưới) cũng đổi sang lấy từ tuần cố
định này thay vì `period` — xem lib/dashboard.ts `thisWeekRangeVn()`.

`sourceCoverage` (thêm 05/09/2026, theo yêu cầu) — độ phủ nguồn của **kỳ đang chọn**, khác
`dataFreshness` vốn chỉ nói về ngày mới nhất. Đếm theo ô `(kênh, ngày)` **có dữ liệu**:
`reconciledCells`/`measuredCells` là tử/mẫu của badge "x% kỳ này đã đối chiếu";
`unreconciledChannels` là số kênh không có ngày `studio_import` nào trong kỳ (gồm cả kênh trống
hẳn — kênh chưa entry vẫn được tính là chưa đối chiếu, im lặng bỏ qua sẽ làm badge đẹp lên đúng lúc
dữ liệu tệ nhất). `perChannel` sắp kênh thiếu đối chiếu lên trước.

Lý do tồn tại: `v_channel_daily` chọn Studio cho ngày này, Display API cho ngày kia, mà **hai nguồn
đo hai thứ khác nhau** — Display cộng delta của những video nó lấy được, Studio báo tổng view thật cả
kênh. Đo trên dữ liệu thật 29/08→03/09 (ngày `is_complete=true`, cron chạy đúng, không thiếu gì):
Studio cao hơn Display **ổn định 1,2–1,6×**; ở 2 ngày sync đầu (25/08, 28/08) còn lệch 10–76×. Nên
tổng của một kỳ trộn nguồn là tổng của hai đơn vị đo, và Manager phải thấy tỷ lệ trước khi tin nó.
Cố tình **không** đo bằng "số kênh đã đối chiếu đủ kỳ": Studio trễ 2 ngày cố định nên ngày mới nhất
luôn là `display_api`, chỉ số đó sẽ đứng ở 0/9 vĩnh viễn. Nguồn: `aggregateSourceCoverage()` trong
`lib/dashboard.ts`. Quyết định chọn badge thay vì tách 2 tab Display/Studio: xem
[PROGRESS.md](PROGRESS.md) mục "Badge độ phủ nguồn".

`trend` trả **cả 2 mức chia** `week` (8 tuần gần nhất) và `month` (6 tháng gần nhất, thêm 21/08/2026
— docs/TASKS.md Đợt 2 "so tháng 7 với tháng 8") — client chuyển đổi không cần gọi lại API, giống hệt
cách 3 metric (views/followers/videos) đã bundle sẵn từ M4. Mỗi điểm `{label, value}` có
**`value: null`** khi không một ngày nào trong khoảng đó có số đo thật (khác `0` — số đo được và
đúng là 0). Client phải vẽ đứt đoạn ở điểm `null`, không được vẽ như một điểm 0 thật (CLAUDE.md,
vấn đề #7, 21/08/2026).

```json
{ "role": "manager",
  "channelCount": 8,
  "channels": [{ "id": "...", "name": "…" }],
  "period": { "from": "2026-08-15", "to": "2026-08-21", "comparedFrom": "2026-08-08", "comparedTo": "2026-08-14" },

  "teamStats": {
    "views":          { "value": 2418000, "deltaPct": 12 },
    "followers":      { "value": 53500, "deltaAbs": 2600 },
    "videos":         { "value": 111, "deltaPct": 7 },
    "viewsPerVideo":  { "value": 21784, "deltaPct": -3 },
    "totalLikes":     { "value": 88400 }
  },
  "weekStats": { "views": 512000, "followers": 340, "videos": 9, "likes": 6100 },
  "dataFreshness": { "latestDate": "2026-08-16", "source": "studio_import",
                     "label": "đã đối chiếu", "reconciledThrough": "2026-08-16",
                     "channelsNeverReconciled": 0 },
  "sourceCoverage": { "measuredCells": 356, "reconciledCells": 291,
                      "fullyReconciledChannels": 0, "unreconciledChannels": 4, "totalChannels": 9,
                      "perChannel": [{ "channelId": "...", "channelName": "Bé Na",
                                       "reconciledDays": 0, "estimatedDays": 9, "otherDays": 0 }] },
  "trend": {
    "week":  { "views": [{ "label": "T27", "value": 1820000 }],
               "followers": [{ "label": "T27", "value": 51200 }],
               "videos": [{ "label": "T27", "value": 14 }] },
    "month": { "views": [{ "label": "Th7", "value": 7300000 }],
               "followers": [{ "label": "Th7", "value": 48900 }],
               "videos": [{ "label": "Th7", "value": 56 }] }
  },
  "growth":     [{ "channelId": "...", "channelName": "…", "followers": 7700, "gain": 600, "ratePct": 8.5 }],
  "viewShare":  [{ "channelId": "...", "channelName": "…", "views": 470000, "sharePct": 19.4 }],
  "efficiency": [{ "channelId": "...", "channelName": "…", "videos": 18, "viewsPerVideo": 26111 }],

  "kpiSummary": { "onTrack": 3, "atRisk": 1, "behind": 1,
                  "attention": [{ "channelId": "...", "channelName": "…",
                                   "reason": "Đã qua 80% chu kỳ, hoàn thành 40% chỉ tiêu." }] },

  "myChannels": null
}
```

**6 chỗ lệch so với bản đặc tả gốc:**

1. **`channelCount`** (M4, 21/08/2026) — không có trong bản gốc. `growth`/`viewShare`/`efficiency`
   đều là top-5/6, không dùng được để suy ra tổng số kênh đang hoạt động cho dòng tiêu đề "N kênh" —
   thêm hẳn field.
2. **`trend`** (M4, 21/08/2026) đổi từ `{ metric, granularity, series }` (1 chuỗi tại 1 thời điểm)
   sang `{ granularity, views, followers, videos }` (cả 3 chuỗi luôn). Mockup có tab chuyển Lượt
   xem/Follower/Video ngay trên client (`app/(app)/trend-chart.tsx`) — nếu giữ 1 `series`, mỗi lần
   bấm tab phải gọi lại API với `?metric=`. Tính sẵn cả 3 rẻ hơn (cùng 1-2 query) và tab bấm tức thì.
3. **`channels`** (M5, 25/08/2026) — id+name của mọi kênh tính trong `channelCount`, không có trong
   bản gốc lẫn bản M4. `lib/kpi.ts`'s `buildDashboardKpiSummary()` cần đúng tập kênh này để tính
   `kpiSummary`/`myChannels`' phần KPI mà không phải tự lọc lại role/`creatorId`/`teamId` lần 2 —
   xem ghi chú "Tại sao 2 lệnh gọi, không phải 1" bên dưới.
4. **`kpiSummary` giờ có số thật** (M5) — trước đó luôn `{onTrack:0,atRisk:0,behind:0,attention:[]}`
   vì `kpi_cycle` chưa có row nào. `onTrack`/`atRisk`/`behind` đếm theo `health.value` của mọi cycle
   **đang chạy** (`activeOnly`) trong tập kênh này; `attention` liệt kê **toàn bộ** cycle `red`, không
   cắt top-N (theo đúng quyết định 24/08/2026 đã áp cho `growth`/`viewShare`/`efficiency`).
5. **`weekStats`** (04/09/2026, theo yêu cầu) — không có trong bản gốc. Tổng team trong tuần lịch
   cố định (thứ Hai giờ VN → hôm nay), độc lập với `?from=`/`?to=` — xem đoạn giải thích phía trên.
   `growth`'s `gain`/`ratePct` cũng đổi sang lấy từ cùng cửa sổ này thay vì `period`.
6. **Tại sao 2 lệnh gọi, không phải 1**: `getDashboard()` (`lib/dashboard.ts`) không tự tính
   `kpiSummary`/`myChannels`' phần KPI — `lib/kpi.ts` đã import runtime từ `lib/dashboard.ts` (dùng
   lại `fetchDailyRows`/`groupByChannel`/... cho `attachProgress`), nên chiều ngược lại sẽ tạo vòng
   lặp import. Route/trang gọi `getDashboard()` trước, rồi `buildDashboardKpiSummary(supabase,
   dashboard.channels)`, rồi `mergeDashboardKpi()` ghép 2 kết quả — xem
   `app/api/dashboard/route.ts`/`app/(app)/page.tsx`.

Khác biệt theo `role`:

| Trường | `manager` | `creator` |
| :--- | :--- | :--- |
| `teamStats`, `weekStats`, `trend`, `growth`, `viewShare`, `efficiency`, `channelCount`, `channels` | Có | Có (giống hệt) |
| `kpiSummary` | Tổng hợp toàn team + danh sách cần chú ý | Có (giống hệt) — **sửa 25/08/2026 (M5)**, xem dưới |
| `myChannels` | `null` | Mảng kênh đang phụ trách, kèm `progress` từng chỉ số và `hint` gợi ý hành động |

`kpiSummary` giống hệt giữa 2 vai trò — lệch so với dự định ban đầu ("Creator chỉ thấy KPI của kênh
mình") ghi trong bản đặc tả gốc trước khi có code thật. Quyết định lúc cài đặt M5: cùng logic "xem
chéo toàn team" mà `teamStats`/`growth`/`viewShare`/`efficiency` đã áp dụng — `kpiSummary` chỉ là một
lát cắt khác của CÙNG loại dữ liệu (tình hình các kênh), không phải chỉ tiêu cá nhân của riêng ai.
`myChannels` mới là chỗ dành riêng cho "KPI của tôi" — không đổi.

`myChannels` item — **`hasActiveKpi` thêm ở M4** (bản gốc giả định luôn có 1 cycle đang chạy), có số
thật từ M5: `metrics: []` + `overallStatus: null` khi `hasActiveKpi: false` (kênh chưa có cycle đang
chạy — UI hiện "Chưa có KPI cho kênh này"), có dữ liệu thật khi `true`. `metrics[]` chỉ liệt kê chỉ
tiêu **đã đặt VÀ đã tính được `pct`** — một chỉ tiêu đã đặt nhưng chưa có số đo không xuất hiện ở đây
(khác `progress` của `GET /api/kpi-cycles`, nơi vẫn trả `pct: null` tường minh cho ca đó):
```json
{ "channelId": "...", "channelName": "Học Tiếng Anh", "handle": "@hoctienganh",
  "followers": 9400, "overallStatus": "green", "hasActiveKpi": true,
  "metrics": [{ "name": "views", "pct": 94, "text": "470k / 500k",
                "hint": "Sắp về đích, cần thêm 30k view" }] }
```

---

## Công thức `progress` (server-side)

Cài đặt: [lib/kpi.ts](../lib/kpi.ts) — mọi hàm bên dưới là hàm thuần, test ở `lib/kpi.test.ts`.

```
viewsPct     = viewsTrongKỳ / targetViews * 100        (chỉ tính khi targetViews đã đặt)
videosPct    = videosTrongKỳ / targetVideos * 100       (chỉ tính khi targetVideos đã đặt)
followersPct = (followersHiệnTại - followersAtStart)
             / (targetFollowers - followersAtStart) * 100   (chỉ tính khi targetFollowers đã đặt)

overallPct   = trung bình cộng các pct KHÁC null ở trên
```

**Sửa 25/08/2026 (M5, theo yêu cầu) so với bản gốc `/3` cố định**: một cycle chỉ cần đặt **ít nhất 1
trong 3** chỉ tiêu, không bắt buộc cả 3. `overallPct` lấy trung bình đúng số chỉ tiêu đã đặt VÀ đã có
số đo (một chỉ tiêu đã đặt nhưng chưa có dữ liệu đo được vẫn trả `pct: null`, không tính vào trung
bình, không phải `0%`). `targetCount` (số chỉ tiêu đã đặt, 1-3) đi kèm để UI ghi rõ "đang tính trên N
chỉ tiêu". `target === 0` hoặc `targetFollowers === followersAtStart` (chia cho 0) → `pct: null`,
không bao giờ trả `Infinity`/`NaN`. Follower giảm so với đầu kỳ → `pct` âm thật, giữ nguyên (không
kẹp) — chỉ thanh tiến độ ở UI mới kẹp về 0.

**Nguồn từng số (`actuals` trong response `GET /api/kpi-cycles`):**

| Số | Lấy từ |
| :--- | :--- |
| `viewsTrongKỳ` (`actuals.views`) | `SUM(data_snapshot.video_views)` các ngày trong kỳ (theo nguồn ưu tiên cao nhất mỗi ngày), **loại bỏ ngày `is_complete = false`** — CLAUDE.md: không dùng snapshot không đầy đủ để tính KPI. `null` nếu không ngày nào có số đo (chưa có, không phải 0) |
| `videosTrongKỳ` (`actuals.videos`) | `COUNT(content_video)` có `posted_at` trong kỳ — **không** dùng hiệu `video_count`, vì video bị xoá sẽ làm hiệu sai. Luôn là số thật, không bao giờ `null` |
| `followersHiệnTại` (`actuals.followersNow`) | `data_snapshot.followers` của ngày mới nhất **trong kỳ** có số (không lấy ngoài kỳ) |

### Ngưỡng trạng thái (`health`) — ±10% quanh tiến độ thời gian

Đổi tên từ `status` (bản gốc) thành **`health`** — `kpi_cycle.status` đã dùng cho `draft`/`final`.

```
elapsedPct = % số ngày đã qua trong kỳ, tính cả ngày bắt đầu và hôm nay (kẹp [0, 100])

green  : overallPct >= elapsedPct + 10
red    : overallPct <= elapsedPct − 10
yellow : còn lại — kể cả khi overallPct là null (chưa đủ dữ liệu, không đoán màu)
```

Ví dụ: chu kỳ 7 ngày (17/08–23/08), đang ở ngày thứ 4 (20/08) → `elapsedPct = round(4/7*100) = 57`.
Đạt ≥67% là 🟢 · dưới 47% là 🔴 · 47-67% là 🟡 (áp dụng ±10 quanh elapsedPct=57 của ví dụ này — không
phải một mốc cố định 50/60/40).

Trả kèm `explanation` để UI hiển thị tooltip — Creator phải hiểu con số này ở đâu ra:
```json
"health": { "value": "yellow", "overallPct": 52, "elapsedPct": 57,
            "explanation": "Đã qua 57% chu kỳ, hoàn thành 52% chỉ tiêu." }
```

### Số cần làm mỗi ngày — chỉ số chính hiển thị cho Creator

Ưu tiên hiển thị số này thay vì dự đoán, vì nó là số học thuần và không bao giờ sai:
```
cầnMỗiNgày = (target − đãĐạt) / sốNgàyCònLại       (kẹp remaining >= 0 — đã đạt thì không âm)
```
Tổng quát hoá cho cả 3 chỉ tiêu (bản gốc chỉ có ví dụ views) — mỗi chỉ tiêu **đã đặt** có object riêng,
`null` nếu chưa đặt hoặc chưa có số đo. `text` là câu chính hiển thị, ưu tiên chỉ tiêu theo thứ tự
Views → Videos → Followers (chỉ tiêu ĐẦU TIÊN có mặt, không phải chỉ tiêu lệch nhiều nhất):
```json
"remaining": {
  "views":     { "remaining": 90000, "perDay": 45000 },
  "videos":    { "remaining": 8, "perDay": 4 },
  "followers": { "remaining": 800, "perDay": 400 },
  "daysLeft": 2,
  "text": "Cần 45k view/ngày trong 2 ngày còn lại."
}
```

### Dự đoán cuối kỳ — có điều kiện

Chỉ tính khi **`elapsedPct >= 50`**; trước mốc đó trả `null`. Lý do: view TikTok bùng nổ rất mạnh
(data thật: một kênh nhảy từ 27k lên 301k view/ngày sau 2 hôm), ngoại suy sớm cho số vô nghĩa và
nguy hiểm khi KPI gắn với thưởng.
```json
"forecast": { "overallPct": 87, "basis": "tốc độ trung bình từ đầu kỳ",
              "confidence": "low|medium" }
```
`basis` đơn giản hoá từ "tốc độ trung bình 4 ngày qua" (bản gốc) — ngoại suy tuyến tính
`overallPct / elapsedPct * 100` từ tốc độ trung bình CẢ KỲ tính tới hiện tại, không riêng 4 ngày gần
nhất. `confidence: "medium"` khi `elapsedPct >= 70`, còn lại `"low"`. UI **bắt buộc** ghi rõ "ước
tính", không hiển thị như số chắc chắn.

### Cảnh báo thiếu dữ liệu (`dataGaps`)

Không chặn tạo/xem cycle (M5) — chỉ cảnh báo % có thể chưa chính xác:
```json
"dataGaps": { "missingDates": ["2026-08-22"], "manualOnlyDates": [] }
```
`missingDates`: ngày (đã qua, trong kỳ) không có row nào **hoặc** có row nhưng `is_complete = false`
— gộp chung vì cả hai đều là "không có số view đáng tin cậy". `manualOnlyDates`: ngày mà nguồn ưu
tiên cao nhất là `manual_entry` (số Manager tự nhập, chưa xác thực) — không tự động gộp vào
`missingDates` vì `manual_entry` vẫn là một số thật, chỉ chưa qua đối chiếu Studio.
UI **bắt buộc** ghi rõ "ước tính", không hiển thị như số chắc chắn.
