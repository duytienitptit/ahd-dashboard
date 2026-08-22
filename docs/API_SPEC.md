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

### `GET /api/kpi-cycles` — M/C
Query: `?channelId=`, `?status=draft|final`, `?activeOnly=true`
```json
[{ "id": "...", "channelId": "...", "periodType": "weekly",
   "periodStart": "2026-08-17", "periodEnd": "2026-08-23",
   "targetViews": 500000, "targetVideos": 20, "targetFollowers": 10000,
   "followersAtStart": 5000, "status": "draft",
   "progress": { "viewsPct": 45.2, "videosPct": 60.0, "followersPct": 20.0,
                 "overallStatus": "yellow" } }]
```

### `POST /api/kpi-cycles` — M
```json
{ "channelId": "<uuid>", "periodType": "weekly",
  "periodStart": "2026-08-17", "periodEnd": "2026-08-23",
  "targetViews": 500000, "targetVideos": 20, "targetFollowers": 10000 }
```
→ `201`. Server tự chụp `followersAtStart` từ snapshot mới nhất. Lỗi `409` nếu trùng khoảng ngày với cycle khác cùng channel.

### `PATCH /api/kpi-cycles/:id` — M
Chỉ sửa được khi `status = draft`. Nếu `final` → `403`.

### `POST /api/kpi-cycles/:id/finalize` — M
**Không nhận file.** Chỉ tổng hợp `data_snapshot` đã có trong khoảng ngày của chu kỳ rồi khoá lại.
Import là việc riêng (xem `/api/channels/:id/import`).

Điều kiện mở khoá — thiếu bất kỳ cái nào đều trả `422` kèm chi tiết:
1. Đã qua `periodEnd + 3 ngày` (Studio trễ 2 ngày, +1 an toàn)
2. Mọi ngày trong chu kỳ đều có row `source = studio_import`
3. Không còn ngày nào chỉ có `manual_entry`

```json
// 422 khi chưa đủ điều kiện
{ "error": "cycle_not_ready",
  "reasons": ["missing_studio_data"],
  "missingDates": ["2026-08-22", "2026-08-23"],
  "unlockAt": "2026-08-26" }
```
→ Thành công: tính % Final → `status=final`, `finalized_by`, `finalized_at` → ghi `audit_log`.
`409` nếu đã final.

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

- **`GET`** — Vercel Cron gọi hằng ngày 03:00 giờ VN. Cron của Vercel **luôn gửi GET, không phải
  POST** (giới hạn nền tảng, không cấu hình được) — kiểm `Authorization: Bearer $CRON_SECRET`, không
  qua session.
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
bên dưới nhưng **không ghi gì vào DB/Storage** — dùng cho bước "xem trước" trước khi Manager bấm
"Lưu dữ liệu" (`design/Import.dc.html`). Bỏ `dryRun` (hoặc `dryRun=false`) mới ghi thật.

→ Giải nén, parse, ghi `data_snapshot(source=studio_import)` **chỉ cho ngày `< ngàyExport − 3`**
(cửa sổ chốt) — cửa sổ này **chỉ áp cho `data_snapshot`**, không áp cho `follower_activity`/
`audience_snapshot`/`content_video` (3 bảng này luôn ghi toàn bộ nội dung file, xem
[DATABASE_ERD.md](DATABASE_ERD.md) lý do: `FollowerActivity.csv` chỉ giữ 7 ngày/lần, cửa sổ không
chồng giữa các tuần nên lọc sẽ mất dữ liệu vĩnh viễn).
```json
{ "importedDates": ["2026-08-01", "…", "2026-08-16"],
  "skippedRecentDates": ["2026-08-17", "2026-08-18"],
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

`trend` trả **cả 2 mức chia** `week` (8 tuần gần nhất) và `month` (6 tháng gần nhất, thêm 21/08/2026
— docs/TASKS.md Đợt 2 "so tháng 7 với tháng 8") — client chuyển đổi không cần gọi lại API, giống hệt
cách 3 metric (views/followers/videos) đã bundle sẵn từ M4. Mỗi điểm `{label, value}` có
**`value: null`** khi không một ngày nào trong khoảng đó có số đo thật (khác `0` — số đo được và
đúng là 0). Client phải vẽ đứt đoạn ở điểm `null`, không được vẽ như một điểm 0 thật (CLAUDE.md,
vấn đề #7, 21/08/2026).

```json
{ "role": "manager",
  "channelCount": 8,
  "period": { "from": "2026-08-15", "to": "2026-08-21", "comparedFrom": "2026-08-08", "comparedTo": "2026-08-14" },

  "teamStats": {
    "views":          { "value": 2418000, "deltaPct": 12 },
    "followers":      { "value": 53500, "deltaAbs": 2600 },
    "videos":         { "value": 111, "deltaPct": 7 },
    "viewsPerVideo":  { "value": 21784, "deltaPct": -3 },
    "engagementRate": { "value": 0.0182, "deltaPct": -5 }
  },
  "dataFreshness": { "latestDate": "2026-08-16", "source": "studio_import",
                     "label": "đã đối chiếu", "reconciledThrough": "2026-08-16" },
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

  "kpiSummary": { "onTrack": 0, "atRisk": 0, "behind": 0, "attention": [] },

  "myChannels": null
}
```

**3 chỗ lệch so với bản đặc tả gốc, cả 3 quyết định lúc code M4 (21/08/2026):**

1. **`channelCount`** — không có trong bản gốc. `growth`/`viewShare`/`efficiency` đều là top-5/6,
   không dùng được để suy ra tổng số kênh đang hoạt động cho dòng tiêu đề "N kênh" — thêm hẳn field.
2. **`trend`** đổi từ `{ metric, granularity, series }` (1 chuỗi tại 1 thời điểm) sang
   `{ granularity, views, followers, videos }` (cả 3 chuỗi luôn). Mockup có tab chuyển Lượt
   xem/Follower/Video ngay trên client (`app/(app)/trend-chart.tsx`) — nếu giữ 1 `series`, mỗi lần
   bấm tab phải gọi lại API với `?metric=`. Tính sẵn cả 3 rẻ hơn (cùng 1-2 query) và tab bấm tức thì.
3. **`kpiSummary`** luôn `{onTrack:0, atRisk:0, behind:0, attention:[]}` — **đúng thực tế**, không
   phải giá trị giả: bảng `kpi_cycle` chưa có row nào (M5 chưa code). Không tính health/progress ở
   đây vì công thức đó (mục dưới) là phạm vi M5, viết trước khi có cycle thật để test sẽ vô nghĩa.

Khác biệt theo `role`:

| Trường | `manager` | `creator` |
| :--- | :--- | :--- |
| `teamStats`, `trend`, `growth`, `viewShare`, `efficiency`, `channelCount` | Có | Có (giống hệt) |
| `kpiSummary` | Tổng hợp toàn team + danh sách cần chú ý | Chỉ KPI của kênh mình phụ trách |
| `myChannels` | `null` | Mảng kênh đang phụ trách, kèm `progress` từng chỉ số và `hint` gợi ý hành động |

`myChannels` item — **`hasActiveKpi` thêm ở M4** (bản gốc giả định luôn có 1 cycle đang chạy; thực tế
chưa cái nào có, `metrics: []` + `overallStatus: null` khi `hasActiveKpi: false`, UI hiện "Chưa có
KPI cho kênh này" thay vì thanh tiến độ):
```json
{ "channelId": "...", "channelName": "Học Tiếng Anh", "handle": "@hoctienganh",
  "followers": 9400, "overallStatus": "green", "hasActiveKpi": true,
  "metrics": [{ "name": "views", "pct": 94, "text": "470k / 500k",
                "hint": "Sắp về đích, cần thêm 30k view" }] }
```

---

## Công thức `progress` (server-side)

```
viewsPct     = viewsTrongKỳ / targetViews * 100
videosPct    = videosTrongKỳ / targetVideos * 100
followersPct = (followersHiệnTại - followersAtStart)
             / (targetFollowers - followersAtStart) * 100

overallPct   = (viewsPct + videosPct + followersPct) / 3
```

**Nguồn từng số:**

| Số | Lấy từ |
| :--- | :--- |
| `viewsTrongKỳ` | `SUM(data_snapshot.video_views)` các ngày trong kỳ (theo nguồn ưu tiên cao nhất mỗi ngày) |
| `videosTrongKỳ` | `COUNT(content_video)` có `posted_at` trong kỳ — **không** dùng hiệu `video_count`, vì video bị xoá sẽ làm hiệu sai |
| `followersHiệnTại` | `data_snapshot.followers` của ngày mới nhất trong kỳ |

### Ngưỡng trạng thái — ±10% quanh tiến độ thời gian

```
elapsedPct = (hôm nay − periodStart) / (periodEnd − periodStart) * 100

green  : overallPct >= elapsedPct + 10
red    : overallPct <= elapsedPct − 10
yellow : còn lại
```

Ví dụ: chu kỳ 7 ngày, đang ở ngày thứ 4 → `elapsedPct ≈ 50`.
Đạt ≥60% là 🟢 · dưới 40% là 🔴 · 40-60% là 🟡.

Trả kèm `explanation` để UI hiển thị tooltip — Creator phải hiểu con số này ở đâu ra:
```json
"status": { "value": "yellow", "overallPct": 52, "elapsedPct": 57,
            "explanation": "Đã qua 57% chu kỳ, hoàn thành 52% chỉ tiêu" }
```

### Số cần làm mỗi ngày — chỉ số chính hiển thị cho Creator

Ưu tiên hiển thị số này thay vì dự đoán, vì nó là số học thuần và không bao giờ sai:
```
cầnMỗiNgày = (target − đãĐạt) / sốNgàyCònLại
```
```json
"remaining": { "views": 90000, "daysLeft": 2, "viewsPerDay": 45000,
               "text": "Cần 45k view/ngày trong 2 ngày còn lại" }
```

### Dự đoán cuối kỳ — có điều kiện

Chỉ tính khi **`elapsedPct >= 50`**; trước mốc đó trả `null`. Lý do: view TikTok bùng nổ rất mạnh
(data thật: một kênh nhảy từ 27k lên 301k view/ngày sau 2 hôm), ngoại suy sớm cho số vô nghĩa và
nguy hiểm khi KPI gắn với thưởng.
```json
"forecast": { "overallPct": 87, "basis": "tốc độ trung bình 4 ngày qua",
              "confidence": "low|medium" }
```
UI **bắt buộc** ghi rõ "ước tính", không hiển thị như số chắc chắn.
