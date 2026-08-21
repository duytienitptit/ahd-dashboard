# Data

Dữ liệu thật phục vụ seed & viết parser. **Không commit dữ liệu thật lên repo** (xem `.gitignore`
ở gốc dự án — đã chặn toàn bộ `data/` trừ file này và các file `.example.*`).

## Cấu trúc thật (đã xác nhận từ export TikTok Studio)

Mỗi kênh xuất ra **4 file zip riêng**, không phải 1 CSV duy nhất. Chi tiết cột, các bẫy parser bắt
buộc phải xử lý (BOM, ngôn ngữ ngày tháng VN/EN lẫn lộn, không có năm, `"undefined"`): xem
[docs/CSV_FORMAT.md](../docs/CSV_FORMAT.md) — viết ra từ chính data thật trong thư mục này.

| File | Trạng thái | Dùng để |
| :--- | :--- | :--- |
| `Overview_*.zip`, `Followers_*.zip`, `Viewers_*.zip`, `Content_*.zip` (2 kênh: `nong.nghiep.xanh.17`, `vuonvuonvang`, 60 ngày) | ✅ Có | Viết & test parser import (M3) |
| `samples/channels_seed.example.csv` | ✅ Template | Copy thành `channels_seed.csv` rồi điền kênh thật khi seed DB (M1) |
| `samples/channels_seed.csv` | ⬜ Cần tạo | Seed database — hiện có data đầy đủ cho 2/8 kênh, seed phần còn lại khi có |
| `samples/business_api_response.json` | ⬜ Chờ duyệt app | Mock provider cho M7 (Business API — V2) |

## Quy trình cập nhật hàng tuần (V1)

Xem quy trình đầy đủ ở [PRODUCT_SPEC.md §5](../docs/PRODUCT_SPEC.md#5-data-pipeline). Tóm tắt: mỗi
tuần export 4 zip/kênh từ TikTok Studio, upload thẳng — hệ thống tự giải nén và parse, không cần
tự bung file trước.
