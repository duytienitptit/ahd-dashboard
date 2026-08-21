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
