# Design System

Token trích từ mockup 10 màn hình. Dùng đúng các giá trị này khi code — không tự đặt màu mới.

## Màu

| Token | Hex | Dùng cho |
| :--- | :--- | :--- |
| `ink` | `#161823` | Chữ chính, nút phụ, avatar Manager |
| `ink-2` | `#5F6066` | Chữ phụ, header bảng |
| `ink-3` | `#86878B` | Chữ mờ, hint, metadata |
| `line` | `#E3E3E4` | Viền thẻ, viền input |
| `line-soft` | `#F1F1F2` | Viền trong bảng, nền surface, nền input |
| `surface` | `#FAFAFA` | Nền footer form, nền input disabled |
| `bg` | `#FFFFFF` | Nền trang |
| `cyan` | `#25C9D0` | Accent chính, thanh tiến độ tốt |
| `cyan-logo` | `#25F4EE` | Chỉ dùng cho icon logo |
| `cyan-bg` | `#F2FDFD` | Nền box thông tin |
| `cyan-ink` | `#0A6B70` / `#0A8B91` | Chữ trên nền cyan |
| `red` | `#FE2C55` | Nút primary, trạng thái đỏ, thanh tiến độ chậm |
| `red-dark` | `#C11238` | Chữ trạng thái đỏ |
| `red-bg` | `#FFE9EE` / `#FFF5F7` | Nền badge / box cảnh báo |
| `green` | `#0BAD5B` | Trạng thái vượt tiến độ |
| `green-dark` | `#046C45` | Chữ trạng thái xanh |
| `green-bg` | `#E6F9F0` | Nền badge xanh |
| `amber` | `#F5A623` | Trạng thái ổn định |
| `amber-dark` | `#8A5A06` | Chữ trạng thái vàng |
| `amber-bg` | `#FFF6E5` | Nền badge vàng |

**Quy tắc màu thanh tiến độ** (theo sức khoẻ của từng chỉ số, không theo trạng thái chung):
```
pct >= 70  → cyan   #25C9D0
pct >= 45  → amber  #F5A623
pct <  45  → red    #FE2C55
```

### Màu theo chỉ số (áp toàn app, 24/08/2026 — theo yêu cầu)

4 chỉ số chính — Lượt xem/Follower/Video/Like — có màu CỐ ĐỊNH riêng, dùng xuyên suốt app để quét
nhanh bằng mắt (ví dụ: mọi con số "Lượt xem" ở bất kỳ trang nào đều xanh dương). Nguồn sự thật duy
nhất: [lib/metric-tone.ts](../lib/metric-tone.ts) — import từ đó, đừng tự viết lại map này ở nơi
khác.

| Chỉ số | Token | Hex |
| :--- | :--- | :--- |
| Lượt xem | `blue` | `#2563EB` |
| Follower | `purple` | `#DB2777` — **LƯU Ý:** tên biến vẫn là "purple" (giữ để đỡ đổi tên class ở hàng chục chỗ) nhưng giá trị thật là hồng magenta, không còn tím |
| Video đã đăng | `orange` | `#F97316` |
| Like | `crimson` | `#DC2626` — token RIÊNG, không phải `red` (brand red `#FE2C55` dùng cho nút/link/badge cảnh báo khắp app) |

**Phạm vi áp dụng:** tiêu đề cột bảng, số liệu chính (giá trị lớn/số trong ô bảng), tab + đường biểu
đồ trong `TrendChart`. **KHÔNG áp dụng cho:** badge %thay đổi (`DeltaPill`/`formatDeltaPct` — vẫn xanh
lá=tăng/đỏ=giảm như trước), badge trạng thái (`Đang hoạt động`/`tạm tính`/`đã đối chiếu`...), thanh
tiến độ KPI. Quyết định có chủ đích (24/08/2026, theo yêu cầu): giữ 2 hệ màu tách biệt — "màu theo
chỉ số" (nhận diện chỉ số nào) và "màu theo chiều hướng" (tăng/giảm/cảnh báo) — để không lẫn nhau.

⚠️ **Đã đổi bộ màu 1 lần trong ngày 24/08/2026** — bản đầu dùng `blue #3B82F6`/`purple #8B5CF6`
(tím thật), bị chê "xanh dương và tím khó phân biệt". Bản hiện tại (trên) tách bạch rõ hơn. Nếu bị
chê tiếp, đừng tự đoán thêm — hỏi thẳng người dùng có ảnh/mã màu tham chiếu cụ thể không.

Áp dụng ở (không giới hạn, tìm `metric-tone` để thấy hết): `TeamStatsRow`/`StatTile` (Tổng quan,
`channels/[id]`, `creators/[id]`), header + giá trị bảng `/channels` và `/creators`
(`channels-table.tsx`, `channel-form.tsx`, `team-accordion.tsx`, `creator-channels-table.tsx`),
`DailyTable`, `TrendChart` (tab + đường), `HashtagTable`/`VideoList` (view), `GrowthCard`
(follower)/`ViewShareCard` (view)/`EfficiencyCard` (view) ở Tổng quan.

## Font

- Family: **Be Vietnam Pro** (Google Fonts), fallback `"Helvetica Neue", system-ui, sans-serif`
- Weight dùng: 400 / 500 / 600 / 700 / 800
- ⚠️ **Không dùng Figtree** dù mockup `design/*.dc.html` khai báo nó. Kiểm chứng 20/08/2026 trên
  Google Fonts: Figtree chỉ có subset `latin` + `latin-ext`, phủ `U+1E00-1E9F` và `U+1EF2-1EFF`
  nhưng **thiếu `U+1EA0-1EF1`** — đúng dải chứa gần hết nguyên âm có dấu tiếng Việt (ạ ấ ầ ậ ắ ặ ẹ
  ế ề ệ ị ọ ố ồ ộ ớ ờ ợ ụ ứ ừ ự…). Chữ có dấu sẽ rơi về font hệ thống ngay giữa từ, lỗi im lặng
  không báo gì. Be Vietnam Pro có subset `vietnamese` đầy đủ (`U+1EA0-1EF9` + dấu `₫ U+20AB`),
  cùng nhóm geometric sans x-height cao nên bố cục mockup giữ nguyên.
- Khai báo qua `next/font/google` trong [app/layout.tsx](../app/layout.tsx), lộ ra CSS var
  `--font-be-vietnam-pro`; Tailwind đọc nó qua `--font-sans` trong `app/globals.css`.

| Vai trò | Size | Weight | Letter-spacing |
| :--- | :--- | :--- | :--- |
| Tiêu đề trang | 24px | 800 | -0.6px |
| Tiêu đề section | 17-20px | 800 | -0.3 đến -0.5px |
| Số liệu lớn | 28-32px | 800 | -1px |
| Tên kênh trong bảng | 14px | 700 | -0.2px |
| Body | 13-14px | 400-600 | 0 |
| Label bảng | 12px | 700 | 0 |
| Hint / metadata | 11.5-12.5px | 400-500 | 0 |

## Hình khối

| Thành phần | Giá trị |
| :--- | :--- |
| Nút | `border-radius: 4px`, cao `38-40px` |
| Thẻ / bảng | `border-radius: 8px`, `border: 1px solid #E3E3E4` |
| Input | `border-radius: 6px`, cao `44-52px` |
| Chip / badge / avatar | `border-radius: 999px` |
| Icon container | `border-radius: 8px` |
| Thanh tiến độ | cao `5px` (bảng) / `7px` (thẻ Creator), `border-radius: 999px` |

## Bố cục

- Chiều rộng nội dung: padding ngang `32px`
- Header cao `60px`, viền dưới `1px solid #E3E3E4`
- Khoảng cách thẻ trong grid: `12-14px`
- Padding trong thẻ: `16-22px`
- Hàng bảng: padding `15px 20px`, phân cách `1px solid #F1F1F2`

## Icon

Inline SVG, stroke-based, `stroke-width: 2-2.4`, `stroke-linecap: round`. Kích thước `12/15/16/18/20px`.
**Không dùng emoji làm icon.**

## Mẫu bắt buộc dùng lại

### Ô mật khẩu — icon con mắt hiện/ẩn (thêm 24/08/2026, theo yêu cầu)

Mọi input `type="password"` phải có icon mắt bên trong (absolute, phải), bấm để đổi `type` sang
`"text"`/`"password"` — `useState` cục bộ, không cần server action. Đã áp ở `app/login/login-form.tsx`
(đăng nhập) và `app/(app)/creators/creator-form.tsx`'s `ResetPasswordForm` (Manager đặt mật khẩu mới
cho Creator — **trước đây input này là `type="text"` luôn hiện sẵn, không che**; đã đổi về mặc định
che + icon mắt để bật lộ theo ý muốn, giống mọi ô mật khẩu khác). Ô mật khẩu mới thêm ở đâu thì theo
đúng mẫu này — đừng để hiện sẵn plaintext mặc định, và đừng quên icon mắt.

### Thanh cuộn mảnh, tự ẩn (thêm 24/08/2026, theo yêu cầu)

Class `.scroll-thin` (`app/globals.css`) — track trong suốt, thumb `6px` chỉ hiện khi hover/focus.
Dùng cho khối danh sách dài trong 1 thẻ cố định chiều cao thay vì cắt bớt dữ liệu (top-N) hay để
trang phình vô hạn. Áp đầu tiên ở `ListCard` (Tổng quan — "Tăng trưởng follower"/"Đóng góp lượt
xem"/"Hiệu quả nội dung": bỏ `.slice(0, N)` ở `lib/dashboard.ts`, hiện **toàn bộ kênh**, khối cuộn
`max-h-[320px]`). Mở rộng sang danh sách dài khác thì dùng lại đúng class này, đừng tự viết CSS cuộn
riêng.

### Nhãn độ tin cậy dữ liệu

Mọi nơi hiển thị số liệu theo ngày **phải** cho biết số đó đã đối chiếu chưa:

| Nhãn | Nền | Chấm | Chữ | Nghĩa |
| :--- | :--- | :--- | :--- | :--- |
| `tạm tính` | `amber-bg` | `amber` | `amber-dark` | Từ Display API, chưa đối chiếu Studio |
| `đã đối chiếu` | `green-bg` | `green` | `green-dark` | Từ Studio, dùng được để chốt sổ |
| `chưa xác thực` | `line-soft` | `ink-3` | `ink-2` | Nhập tay, sẽ bị thay khi Studio về |
| `dữ liệu cũ` | `red-bg` | `red` | `red-dark` | Kênh mất kết nối, số đã ngừng cập nhật |

### Tiến độ KPI — thứ tự hiển thị

1. **Chính:** "Cần 45k view/ngày trong 2 ngày còn lại" — chữ đậm, cỡ `12.5-14px`
2. **Phụ:** dòng giải thích `11px` màu `ink-3` — "Đã qua 57% chu kỳ, hoàn thành 52% chỉ tiêu"
3. Badge 🟢🟡🔴 dùng mẫu badge trạng thái thường

Không hiển thị dự đoán cuối kỳ khi chu kỳ chưa qua 50%.

### Kiểm tra điều kiện (checklist)

Dùng ở màn chốt sổ. Vòng tròn `22px` nền `green-bg`/`red-bg` + icon check/x `12px`, tiêu đề `13px/600`,
chú thích `11.5px` màu `ink-3`.

### Chưa đặt KPI (chip trung tính)

Dùng bất cứ đâu một chỉ số KPI đáng lẽ hiển thị nhưng chưa có `kpi_cycle` — cột "Tiến độ KPI" ở
`/channels`, khối "Kênh của tôi" ở Tổng quan Creator: chip nền `line-soft`, chữ `ink-3`, không chấm
tròn (phân biệt với 4 nhãn độ tin cậy dữ liệu ở trên, vốn luôn có chấm). Không vẽ thanh tiến độ 0%
hay số `0%` — dễ đọc nhầm là "đang ở 0%" thay vì "chưa có chỉ tiêu để đo".

### Icon-box màu cho thẻ số liệu (thêm 24/08/2026, theo yêu cầu — chưa có trong mockup gốc)

`StatTile` ở Tổng quan (`app/(app)/dashboard-widgets.tsx`) có icon màu góc phải, cùng công thức badge
"nền mềm + chữ/icon đậm" ở trên. Hộp `36px` (`h-9 w-9`), bo `rounded-card` (8px), icon `18px` stroke.
Gán cố định theo ý nghĩa, không đổi ngẫu nhiên theo thứ tự:

Tone khớp đúng bảng "Màu theo chỉ số" ở trên (`lib/metric-tone.ts` là nguồn sự thật cho hex/token —
`StatTile`'s `StatTone` trong `dashboard-widgets.tsx` là tập cha, thêm `cyan`/`green`/`amber` cho các
`StatTile` không thuộc 4-chỉ-số, xem file đó). Icon `EyeIcon`→`blue`, `UsersIcon`→`purple`,
`VideoIcon`→`orange`, `HeartIcon`→`crimson` (không phải `red` — xem lý do ở mục "Màu theo chỉ số").

⚠️ **`blue`/`purple`/`orange`/`crimson` là token MỚI**, lệch quy tắc gốc đầu file "không tự đặt màu
mới". **Người dùng đã xác nhận rõ ràng cho phép đổi màu** — không cần hỏi lại cho các lần điều chỉnh
màu icon-box/số liệu tiếp theo. Đã qua 3 vòng chỉnh trong ngày 24/08/2026 (nhạt → sáng hơn → đổi hẳn
bộ màu vì tím/xanh dương khó phân biệt) — nếu còn bị chê lần nữa, đừng tự đoán tiếp, hỏi thẳng người
dùng có ảnh/mã hex tham chiếu cụ thể không.

✅ **Số liệu lớn (`value`) của `StatTile` cũng tô theo `tone`** khi có `tone` — đồng thời áp cho tiêu
đề cột/giá trị bảng và tab/đường `TrendChart` khắp app (xem "Màu theo chỉ số" ở trên, đây là bản đầy
đủ, phần này chỉ còn nói riêng về `StatTile`). `icon`/`tone` là prop **tuỳ chọn** trên `StatTile` —
`StatTile` không thuộc 4-chỉ-số (ví dụ tile không có `deltaText`) không truyền thì layout giữ nguyên
như cũ, không tự nhiên có icon.

### Avatar kênh nhiều màu (mở rộng 24/08/2026, theo yêu cầu)

`avatarPalette()` (`lib/format.ts`) đổi từ cycle 3 màu → **5 màu**, vẫn toàn bộ là token sẵn có, không
thêm hex mới: `cyan-bg/cyan-ink-2` → `red-bg/red-dark` → `green-bg/green-dark` → `amber-bg/amber-dark`
→ `line-soft/ink-2`. Dùng ở mọi danh sách avatar-theo-index: Tổng quan (`ChannelRow` trong
`GrowthCard`/`EfficiencyCard`, và `MyChannelsBlock`), bảng `/channels` (`ChannelRow` trong
`app/(app)/channels/channel-form.tsx`), và từ 24/08/2026 cũng ở `/creators` — `CreatorRow` trong
`app/(app)/creators/team-accordion.tsx` (danh sách nhân sự mỗi team) và bảng "Kênh phụ trách" trong
`app/(app)/creators/[id]/creator-channels-table.tsx`. Cả 3 nơi đều nhận `index` từ `.map((x, i) => …)`
của chính nó — palette không share state giữa các danh sách khác nhau, mỗi bảng tự đếm lại từ 0.
**Vẫn không áp dụng cho avatar đơn lẻ** (header trang chi tiết 1 kênh `channels/[id]/page.tsx`, header
trang chi tiết 1 Creator `creators/[id]/page.tsx`) — avatar 1-mục không cần phân biệt màu theo index
như trong danh sách nhiều mục.

### Heatmap giờ × ngày (thêm ở M4, không có trong mockup gốc)

`app/(app)/channels/[id]/detail-widgets.tsx` → `ActivityHeatmapCard`. Ô `10px` cao, bo `2px`, tô màu
bằng `color-mix(in srgb, var(--color-cyan) N%, white)` với `N = giá trị/max*100` (sàn `8%` để ô có
dữ liệu thật nhưng bằng 0 vẫn phân biệt được với ô hoàn toàn không có dữ liệu — ô không có dữ liệu
dùng thẳng `line-soft`, không phải cyan 0%). Nhãn giờ chỉ hiện mỗi 3 giờ (`0h 3h 6h…`) để đỡ rối,
nhãn ngày dạng `DD/MM` phía trên mỗi cột.

### Danh sách xếp hạng có thanh ngang (hashtag / đóng góp view)

`HashtagTable`, `ViewShareCard`, per-channel bar trong thẻ Creator — cùng 1 mẫu: nhãn trái + số liệu
phải trên 1 dòng (`12.5px`), thanh `5px` bo tròn `line-soft` bên dưới, độ dài thanh tỷ lệ theo giá
trị lớn nhất trong danh sách đang hiển thị (không phải theo tổng) — mục cao nhất luôn kín thanh.

## Trạng thái chờ (skeleton)

Mọi màn trong `app/(app)/` render trên server và phải đợi Supabase trả về, nên **mỗi segment cần
một `loading.tsx`** — không có nó, bấm chuyển tab sẽ đứng im ở trang cũ cho tới khi query xong.

- Dùng lại `Skeleton` / `PageHeaderSkeleton` / `TableSkeleton` trong `app/(app)/skeleton.tsx`,
  không tự viết khối xám mới.
- Khối skeleton **phải khớp kích thước thật** (cùng `grid-template-columns`, cùng `min-width` với
  bảng thật) — lệch thì nội dung nhảy khi về, khó chịu hơn cả việc chờ.
- Màu nền `line-soft` + `animate-pulse`. Không dùng spinner xoay giữa màn.
- **Không vẽ phần UI phụ thuộc vai trò** trong `loading.tsx` (ví dụ thanh `DataTabs` chỉ Manager
  thấy): lúc đó chưa biết vai trò, vẽ ra là loé thao tác Manager trước mặt Creator.
- Thêm route mới trong `app/(app)/` thì thêm `loading.tsx` cùng lúc. Quên thì nó rơi về
  `app/(app)/loading.tsx` — chạy được nhưng sai hình dạng.

### ⚠️ `loading.tsx` KHÔNG hiện khi chỉ đổi `searchParams` trên cùng 1 route

Phát hiện 21/08/2026 lúc thêm date-range picker: **`loading.tsx` chỉ hiện khi ĐI VÀO một route segment
— không hiện khi searchParams của route đang đứng đổi** (`?from=&to=`, `?creatorId=`...), **kể cả khi
`router.replace()` được bọc trong `startTransition`.** Đã kiểm chứng bằng `MutationObserver` thật: bọc
`startTransition` không làm skeleton xuất hiện, nhưng `isPending` từ `useTransition` vẫn đúng và tức
thời (~7ms) — chỉ là nó không tự động lan sang Suspense boundary của route.

**Không có hiệu ứng chờ nào tự động cho filter kiểu này** — mọi filter đổi `searchParams` (date range,
dropdown lọc...) đều PHẢI tự tay dùng `isPending` để làm mờ/khoá vùng nội dung đang lọc, nếu không
màn hình sẽ đứng im không phản hồi trong lúc chờ (query Supabase Tokyo từ xa đo được ~1-1.5s thật) —
cảm giác giật/đơ, y hệt phản hồi đã nhận được.

**Mẫu dùng chung:** [app/(app)/filter-transition.tsx](../app/(app)/filter-transition.tsx) —
`FilterTransitionProvider` giữ 1 `useTransition` dùng chung cho mọi filter trên trang (không phải
mỗi control tự gọi `useTransition` riêng — như vậy mới lấy `isPending` đúng nghĩa "có filter nào đang
chờ" chứ không phải "riêng cái này"), `useFilterTransition()` cho control gọi `setParams()`, và
`FilterPendingOverlay` bọc quanh vùng nội dung để tự làm mờ (`opacity-40 pointer-events-none`) khi
`isPending`. Xem cách dùng ở `date-range-picker.tsx` / `creator-filter.tsx` (control, gọi
`setParams`) và `app/(app)/page.tsx` / `channels/page.tsx` (bọc `FilterTransitionProvider` quanh
control + `FilterPendingOverlay` quanh nội dung).

Route mới thêm filter kiểu `searchParams` → bọc theo đúng mẫu này, đừng tưởng `loading.tsx` sẵn có là
đủ.

## Nguyên tắc

- Nút primary dùng `red` (nền đỏ, chữ trắng). Nút phụ viền `line`, nền trắng.
- Trạng thái dùng badge nền mềm + chấm tròn màu đặc — không dùng nền đặc, để không lẫn với nút primary.
- Thao tác không hoàn tác (chốt sổ) phải có box cảnh báo nền `red-bg` + checkbox xác nhận trước khi bật nút.
- Vùng chỉ xem của Creator gắn nhãn "Chỉ xem" rõ ràng.
- **Engagement rate hiển thị ngang hàng** với view/follower trong hàng thẻ số, không xem là chỉ số phụ.
- **Không bịa thêm dữ liệu mẫu** ngoài mức tối thiểu đủ thể hiện các trạng thái khác nhau.

## Nguồn

Mockup gốc `design/*.dc.html` — 10 màn:
Main (Tổng quan Manager) · CreatorDashboard (Tổng quan Creator) · Channels · ChannelDetail ·
Creators · KpiForm · Finalize · Import · Connections · Login.
Sửa mockup → cập nhật lại file này.

**M4 (21/08/2026) thêm 2 mẫu không có trong 10 mockup gốc** — heatmap giờ vàng và bảng hiệu quả
hashtag ở `ChannelDetail`, tự thiết kế theo đúng token ở trên (xem 2 mục ngay phía trên trong
"Mẫu bắt buộc dùng lại"). Card "KPI tuần này"/"Các kỳ đã chốt" trong `design/ChannelDetail.dc.html`
gốc **cố tình bỏ** khỏi M4 (thay bằng "Tỷ lệ khán giả mới") — thuộc phạm vi M5, dựng UI cho bảng rỗng
không có giá trị.
