# Database ERD

Schema chạy trên Supabase Postgres. Quy tắc nghiệp vụ: [PRODUCT_SPEC.md](PRODUCT_SPEC.md).
Nguồn dữ liệu từng bảng: [DATA_SOURCES.md](DATA_SOURCES.md).

## ⏰ Quy ước thời gian — đọc trước khi viết migration

| Kiểu | Dùng cho | Múi giờ |
| :--- | :--- | :--- |
| `date` | Ngày của số liệu (`data_snapshot.date`, `follower_activity.date`…) | **Ngày lịch Asia/Ho_Chi_Minh** |
| `timestamptz` | Mốc thời gian hệ thống (`created_at`, hạn token, `finalized_at`) | Lưu UTC như bình thường |

Lý do chọn ngày VN cho `date`: TikTok Studio export **tổng theo ngày**, không phải timestamp — không
thể quy đổi múi giờ cho một con số đã cộng dồn cả ngày. Studio vào thẳng không cần đổi; chỉ Display
API (Unix timestamp UTC) cần **một** phép đổi tường minh sang giờ VN trước khi lấy phần ngày.

Cron đồng bộ chạy ~03:00 giờ VN (sau khi ngày hôm trước đã khép lại).

---

```mermaid
erDiagram
    MANAGER ||--o{ CREATOR : "quản lý"
    TEAM ||--o{ CREATOR : "gồm (tuỳ chọn)"
    CREATOR ||--o{ CHANNEL : "phụ trách hiện tại"
    CHANNEL ||--o{ CHANNEL_OWNERSHIP_HISTORY : "lịch sử sở hữu"
    CREATOR ||--o{ CHANNEL_OWNERSHIP_HISTORY : "từng phụ trách"
    CHANNEL ||--|| CHANNEL_OAUTH : "kết nối Display API"
    CHANNEL ||--o{ KPI_CYCLE : "có chu kỳ KPI"
    CHANNEL ||--o{ DATA_SNAPSHOT : "số liệu theo ngày"
    CHANNEL ||--o{ CONTENT_VIDEO : "có video"
    CONTENT_VIDEO ||--o{ VIDEO_SNAPSHOT : "số liệu video theo ngày"
    CHANNEL ||--o{ FOLLOWER_ACTIVITY : "giờ hoạt động"
    CHANNEL ||--o{ AUDIENCE_SNAPSHOT : "nhân khẩu học"

    MANAGER {
        uuid id PK "= auth.users.id"
        text name
        text username UK "định danh đăng nhập — người dùng thấy/gõ"
        text email UK "nội bộ, Supabase Auth cần — không hiển thị"
        timestamptz created_at
    }

    CREATOR {
        uuid id PK "= auth.users.id"
        text name
        text username UK "định danh đăng nhập — người dùng thấy/gõ"
        text email UK "nội bộ, Supabase Auth cần — không hiển thị"
        uuid manager_id FK
        uuid team_id FK "nullable — chưa gán team"
        boolean is_active
        timestamptz created_at
    }

    TEAM {
        uuid id PK
        text name UK
        timestamptz created_at
    }

    CHANNEL {
        uuid id PK
        text name
        text tiktok_handle UK
        uuid current_creator_id FK
        boolean is_active
        timestamptz created_at
    }

    CHANNEL_OWNERSHIP_HISTORY {
        uuid id PK
        uuid channel_id FK
        uuid creator_id FK
        date from_date
        date to_date "nửa mở — null = đang phụ trách"
    }

    CHANNEL_OAUTH {
        uuid id PK
        uuid channel_id FK UK
        text tiktok_open_id
        text access_token "ciphertext AES-256-GCM"
        timestamptz access_expires_at "~24h"
        text refresh_token "ciphertext — XOAY VÒNG"
        timestamptz refresh_expires_at "~365 ngày"
        text scopes "user.info.stats,video.list"
        timestamptz last_refreshed_at
        timestamptz last_sync_at
        text last_sync_status "ok | failed | rate_limited"
        text last_sync_error
    }

    DATA_SNAPSHOT {
        uuid id PK
        uuid channel_id FK
        date date "ngày lịch VN của số liệu"
        text source "display_api | studio_import | manual_entry | business_api | vendor_scraping"
        bigint video_views "view phát sinh trong ngày"
        bigint profile_views "chỉ studio_import"
        bigint likes
        bigint comments
        bigint shares
        bigint followers "mốc tuyệt đối cuối ngày"
        int video_count "tổng video luỹ kế"
        bigint total_viewers "chỉ studio_import"
        bigint new_viewers "chỉ studio_import"
        bigint returning_viewers "chỉ studio_import"
        boolean is_complete "false = API trả thiếu, không dùng tính KPI"
        text raw_file_ref "null trừ studio_import"
        timestamptz created_at
    }

    CONTENT_VIDEO {
        uuid id PK
        uuid channel_id FK
        text tiktok_video_id UK
        text video_link UK
        text title
        text hashtags "mảng tách từ title"
        timestamptz posted_at
        timestamptz first_seen_at
        timestamptz last_synced_at
    }

    VIDEO_SNAPSHOT {
        uuid id PK
        uuid content_video_id FK
        date date "ngày lịch VN"
        bigint view_count "LUỸ KẾ trọn đời, không phải view trong ngày"
        bigint like_count
        bigint comment_count
        bigint share_count
    }

    FOLLOWER_ACTIVITY {
        uuid id PK
        uuid channel_id FK
        date date
        smallint hour "0-23"
        int active_followers
    }

    AUDIENCE_SNAPSHOT {
        uuid id PK
        uuid channel_id FK
        date captured_on
        jsonb gender_distribution
        jsonb territory_distribution
    }

    KPI_CYCLE {
        uuid id PK
        uuid channel_id FK
        text period_type "weekly | custom"
        date period_start
        date period_end
        bigint target_views
        int target_videos
        bigint target_followers "mốc tuyệt đối"
        bigint followers_at_start "chụp khi tạo cycle, không sửa"
        text status "draft | final"
        uuid finalized_by FK
        timestamptz finalized_at
    }

    AUDIT_LOG {
        uuid id PK
        text entity_type
        uuid entity_id
        text action
        text actor
        timestamptz created_at
        text note
    }
```

## `team` — nhãn tổ chức, KHÔNG phải biên giới phân quyền

Quyết định 21/08/2026 (đã hỏi người dùng trước khi viết migration, vì đây là loại quyết định khó sửa
về sau): thêm `team` để nhóm Creator (ví dụ "1 manager quản lý 2 team") **thuần cho mục đích lọc/hiển
thị** — `getDashboard()` nhận `teamId` để lọc xuống đúng kênh của team đó, giống hệt cách `creatorId`
đã lọc. **Không đổi RLS, không đổi ai-thấy-được-gì**: vẫn đúng 1 tầng Manager (thấy toàn bộ) + Creator
(cross-channel visibility, đã chốt từ đầu dự án — xem `0006_rls.sql`). Nếu sau này cần Team thật sự
là biên giới phân quyền (nhiều Manager, mỗi người chỉ thấy team mình), đó là quyết định RLS mới, phải
hỏi lại, không tự suy diễn từ quyết định này.

`channel` cố tình **không có** cột `team_id` riêng — team của một kênh luôn suy ra qua
`current_creator_id → creator.team_id`, để chỉ có đúng 1 chỗ team membership có thể lệch (chính
`creator.team_id`), không phải 2.

## Ràng buộc chính

| Bảng | Ràng buộc |
| :--- | :--- |
| `channel` | `tiktok_handle` unique |
| `channel_oauth` | `channel_id` unique — 1 kênh 1 kết nối |
| `data_snapshot` | **`UNIQUE(channel_id, date, source)`** — cùng ngày cùng nguồn thì upsert |
| `data_snapshot` | Index `(channel_id, date DESC)` |
| `video_snapshot` | **`UNIQUE(content_video_id, date)`** |
| `video_snapshot` | Index `(content_video_id, date DESC)` — dùng tính delta hằng ngày |
| `content_video` | `tiktok_video_id` unique và `video_link` unique — dedup giữa các lần lấy |
| `follower_activity` | `UNIQUE(channel_id, date, hour)` |
| `kpi_cycle` | Không cho 2 cycle cùng `channel_id` trùng khoảng ngày |
| `kpi_cycle` | `followers_at_start` bắt buộc — set 1 lần khi tạo, không sửa |
| `kpi_cycle` | `status = final` → read-only ở tầng app; thay đổi phải ghi `audit_log` |
| `channel_ownership_history` | Mỗi channel chỉ 1 row có `to_date IS NULL` |
| `audit_log` | Append-only, không update/delete |

## Cột KHÔNG có — cố ý

| Không lưu | Lý do |
| :--- | :--- |
| `data_snapshot.followers_diff` | Cột gốc trong CSV bị đặt sai tên (là chênh lệch ngày SAU). Tự tính từ chuỗi `followers` — xem [CSV_FORMAT.md](CSV_FORMAT.md) |
| `data_snapshot.engagement_rate` | Suy ra được: `(likes+comments+shares)/video_views`. Không lưu số dẫn xuất |
| `data_snapshot.views_per_video` | Như trên |

## Chọn nguồn khi 1 ngày có nhiều `source`

Một `(channel_id, date)` có thể tồn tại nhiều row khác `source`. Tầng đọc phải chọn theo thứ tự:

```
studio_import > business_api > display_api > vendor_scraping > manual_entry
```

Đã bọc sẵn trong view **`v_channel_daily`**
([migration](../supabase/migrations/20260820000005_source_resolver.sql)) — trả đúng 1 row mỗi
`(channel_id, date)`, là nguồn ưu tiên cao nhất hiện có. Thứ tự nằm ở hàm `source_rank(text)`.

- **Mọi query đọc số liệu kênh phải đi qua view này**, không query thẳng `data_snapshot`. Ngoại lệ
  duy nhất: API nhận `?source=` để xem riêng một nguồn ([API_SPEC.md](API_SPEC.md) `/snapshots`).
- View tạo với `security_invoker = on` để RLS của `data_snapshot` vẫn áp cho người gọi (view mặc
  định chạy bằng quyền owner, sẽ hở dữ liệu).
- View **giữ nguyên** row `is_complete = false` và phơi cột đó ra — hiển thị thì được, còn query
  tính KPI phải tự thêm `where is_complete`.

**`v_channel_latest`** ([migration](../supabase/migrations/20260820000007_ownership_trigger.sql)) —
`distinct on (channel_id) * from v_channel_daily order by channel_id, date desc`, tức 1 row mới nhất
mỗi kênh. `GET /api/channels` dùng view này cho `latestStats` thay vì tự kéo cả chuỗi ngày về lọc ở
JS. Cùng `security_invoker = on`. `null` cho kênh chưa có `data_snapshot` nào.

## `channel_ownership_history` được đồng bộ tự động bằng trigger

**Không viết trực tiếp vào `channel_ownership_history`.** Trigger `channel_ownership_sync_insert` /
`channel_ownership_sync_update` trên bảng `channel`
([migration](../supabase/migrations/20260820000007_ownership_trigger.sql)) tự đóng/mở row mỗi khi
`current_creator_id` đổi — route handler, seed script, cron, hay code M3-M6 sau này chỉ cần
`UPDATE channel SET current_creator_id = ...`, không tự tay thêm bớt lịch sử. Ghi thẳng vào bảng này
sẽ đụng trigger hoặc phá vỡ tính nhất quán của nó.

`to_date` là **nửa mở**: `[from_date, to_date)` — `to_date` là ngày ĐẦU TIÊN Creator không còn phụ
trách nữa, không phải ngày cuối cùng còn phụ trách. Nhờ vậy ngày bàn giao thuộc về đúng 1 Creator,
không rơi vào cả hai hoặc không ai.

Ba nhánh xử lý trong `sync_channel_ownership()` (đều dùng `today_vn()`, không phải `current_date` —
xem múi giờ ở đầu file):

1. **Row đang mở có `from_date = hôm nay`** (mở rồi sửa lại trong cùng ngày, vd. gán nhầm Creator rồi
   sửa vài phút sau): sửa đè `creator_id` tại chỗ nếu Creator mới khác `null`; **xoá hẳn row** nếu gỡ
   về `null`. Tránh sinh row rỗng độ dài 0 (`to_date = from_date`).
2. **Row đang mở từ trước hôm nay**: đóng lại (`to_date = hôm nay`), rồi mở row mới nếu Creator mới
   khác `null`.
3. **Không có row đang mở** (kênh đang chưa gán): mở row mới nếu Creator mới khác `null`, không làm
   gì nếu gán về `null` (đã `null` rồi).

`select ... for update` khoá row đang mở trước khi quyết định nhánh, để hai request đổi Creator cùng
lúc không cùng đi qua nhánh 2/3 và cùng cố insert — request thua sẽ đợi rồi tự rơi vào nhánh phù hợp
thay vì vỡ `channel_ownership_history_one_open_idx`.

## Storage: bucket `studio-imports`

Zip gốc từ mỗi lần import Studio ([migration](../supabase/migrations/20260820000008_studio_import_storage.sql))
— bucket riêng, `public = false`, RLS trên `storage.objects` chỉ cho `is_manager()` đọc/ghi, cùng mẫu
với `channel_oauth`/`audit_log`. Route dùng `createSupabaseServerClient()` như thường lệ (Manager tự
ghi qua RLS), không cần admin client.

Đường dẫn: `studio-imports/<channelId>/<batchId>/<tên file gốc>`. `data_snapshot.raw_file_ref` lưu
**đường dẫn thư mục batch** (`studio-imports/<channelId>/<batchId>`), không phải 1 file cụ thể — một
ngày trong `data_snapshot` được gộp từ tối đa 3 file khác nhau (Overview/Followers/Viewers) của cùng
1 lần upload, nên không có 1 file duy nhất để trỏ tới; batch là đơn vị "lần import" tự nhiên hơn.

**Cửa sổ chốt (3 ngày, xem "Đối chiếu khi Studio trễ 2 ngày" ở [DATA_SOURCES.md](DATA_SOURCES.md))
chỉ áp dụng cho `data_snapshot`.** `follower_activity`, `audience_snapshot`, `content_video` luôn ghi
toàn bộ nội dung file mỗi lần import, không lọc theo ngày export. Lý do: `FollowerActivity.csv` chỉ
chứa 7 ngày gần nhất mỗi lần export (không cộng dồn như 3 file kia) — với nhịp export hàng tuần, cửa
sổ 7 ngày của tuần này và tuần sau **không chồng nhau**, nên lọc bỏ 3 ngày gần nhất ở đây sẽ làm mất
vĩnh viễn đúng phần dữ liệu CSV_FORMAT.md cảnh báo tránh mất. `audience_snapshot` là ảnh chụp tại thời
điểm export (không phải chuỗi ngày). `content_video` là danh mục video, không phải số cần đối chiếu.

## Bảo mật token

`access_token` và `refresh_token` **mã hoá at-rest ở tầng app** — AES-256-GCM trong
[lib/crypto/token.ts](../lib/crypto/token.ts), khoá ở env `TOKEN_ENCRYPTION_KEY`. Hai cột đó chứa
**ciphertext**, không bao giờ plaintext. Định dạng lưu: `v1:<iv>:<authTag>:<ciphertext>` (base64),
tiền tố version để sau đổi thuật toán không phải đoán.

> **Không dùng Supabase Vault / pgsodium** như bản đầu của tài liệu này: pgsodium TCE (mã hoá cột
> trong suốt) đã bị Supabase deprecate, còn Vault vốn dành cho secret cấu hình chứ không phải dữ
> liệu theo từng row. Token chỉ do code server cầm service role đụng tới, nên mã hoá ở tầng app cho
> đúng đảm bảo đó mà không phụ thuộc extension sắp biến mất. Quyết định 20/08/2026.

RLS chặn `channel_oauth` **hoàn toàn** — bảng bật RLS nhưng **không có policy nào**, nên không vai
trò đăng nhập nào (kể cả Manager) đọc được; chỉ service role qua
[lib/supabase/admin.ts](../lib/supabase/admin.ts) vào được.

⚠️ `refresh_token` **xoay vòng**: mỗi lần refresh phải ghi đè token mới trả về. Dùng lại token cũ =
mất quyền, phải OAuth lại thủ công. Xem [DISPLAY_API.md](DISPLAY_API.md).

## Auth

Supabase Auth. **`manager.id` và `creator.id` CHÍNH LÀ `auth.users.id`** (`references auth.users(id)
on delete cascade`), không phải uuid riêng nối qua email. Policy chỉ cần so `auth.uid()` — nhanh, và
người dùng đổi email trong Auth không làm đứt liên kết. Quyết định 20/08/2026, thay cho cách nối qua
email ở bản đầu.

Hệ quả: tạo tài khoản phải qua Auth admin API trước (lấy `id`), rồi mới insert row — xem
[scripts/seed.mjs](../scripts/seed.mjs) và `POST /api/creators` ở M2.

**Đăng nhập bằng `username`, không phải `email` (22/08/2026, theo yêu cầu).** `email` vẫn là cột thật
trên cả `manager` lẫn `creator` (Supabase Auth bắt buộc phải có một giá trị nội bộ), nhưng không còn
ai thấy hay gõ nó nữa — `username` (thêm ở `20260822000001_username.sql`, unique, not null, format
`^[a-z0-9._-]{3,32}$`) mới là định danh hiển thị/đăng nhập thật. Tài khoản tạo sau ngày này có `email`
tự sinh (`{username}@creator.internal`) chỉ để thoả điều kiện của Auth; tài khoản tạo trước đó vẫn giữ
nguyên email thật, mật khẩu không đổi — chỉ thêm `username` để tra cứu, không migrate lại Auth.
`resolveLoginEmail()` (`lib/auth.ts`) là nơi tra `username → email` trước khi gọi
`signInWithPassword()`, chạy bằng admin client vì lúc đó chưa có phiên nào để RLS cho đọc.

Vai trò đọc từ server bằng `getCurrentUser()` ([lib/auth.ts](../lib/auth.ts)): tra `manager` trước,
không có thì tra `creator`. **User trong Auth mà không có row ở bảng nào = không có quyền**, bị coi
như chưa đăng nhập (chặn trường hợp tạo tài khoản thẳng trong dashboard Supabase mà quên tạo row).

RLS thực tế:

| Bảng | Creator | Manager |
| :--- | :--- | :--- |
| `manager` | đọc | đọc (ghi: chỉ service role) |
| `creator`, `channel`, `channel_ownership_history`, `kpi_cycle`, `data_snapshot`, `content_video`, `video_snapshot`, `follower_activity`, `audience_snapshot` | chỉ đọc | toàn quyền |
| `channel_oauth` | ✗ | ✗ (chỉ service role) |
| `audit_log` | ✗ | đọc + thêm; **không sửa/xoá** |
