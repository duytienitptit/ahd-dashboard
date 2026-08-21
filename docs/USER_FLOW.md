# User Flow

## Trang Tổng quan — một route, rẽ nhánh theo vai trò

`/` dùng chung một component. Vai trò quyết định phần đầu trang và các nút hiển thị.

```mermaid
flowchart TD
    A[Đăng nhập email/password] --> B{Vai trò?}

    B -- Manager --> M1[Tổng quan: thẻ số toàn team → biểu đồ xu hướng → 3 thẻ phân tích → thẻ KPI]
    B -- Creator --> C1[Tổng quan: khối 'Kênh của tôi' ghim đầu → phần dữ liệu toàn team, chỉ xem]

    M1 --> M2[Tab Kênh: danh sách + bộ lọc đầy đủ]
    C1 --> M2
    M2 --> M3[Chi tiết kênh: biểu đồ riêng, KPI, số liệu lưu theo ngày]

    M1 --> M4[Tab Creator: hiệu suất từng người + tạo tài khoản]
    M1 --> M5[Đặt KPI: chọn kênh, chu kỳ, 3 chỉ tiêu]
    M5 --> M6[Hệ thống tự chụp followersAtStart và khoá]
    M1 --> I1[Import thứ Tư: kéo-thả 4 zip/kênh → parse → ghi snapshot]
    I1 --> M7[Chốt sổ: tổng hợp snapshot đã có → khoá kỳ → ghi AuditLog]
    M1 --> T1[Trạng thái kết nối: Manager thấy 8 kênh, cảnh báo trước 30 ngày]
    C1 --> T2[Kết nối: Creator tự Authorize đúng kênh mình phụ trách]
```

## Hai luồng vận hành định kỳ

| Việc | Ai | Khi nào | Màn hình |
| :--- | :--- | :--- | :--- |
| Đồng bộ Display API | Cron tự động | Hằng ngày ~03:00 giờ VN | — (kết quả hiện ở Tổng quan, nhãn *tạm tính*) |
| Import file Studio | Manager | **Thứ Tư**, cho tuần trước đó | Màn import |
| Chốt sổ chu kỳ | Manager | Sau khi import phủ hết chu kỳ | Màn chốt sổ |
| OAuth (kết nối/kết nối lại) | **Manager hoặc Creator** — Creator chỉ kênh mình phụ trách | Lần đầu, hoặc khi token sắp hết hạn (cảnh báo trước 30 ngày) | Màn kết nối |

## Khác biệt theo vai trò

| | Manager | Creator |
| :--- | :--- | :--- |
| Đầu trang Tổng quan | Thẻ số tổng hợp toàn team | Khối "Kênh của tôi" + gợi ý hành động |
| Phần dữ liệu toàn team | Đầy đủ | Đầy đủ, gắn nhãn "Chỉ xem"; kênh của mình được tô đậm |
| Tab điều hướng | Tổng quan · Kênh · Creator · Dữ liệu (Import + Kết nối) · KPI | Tổng quan · Kênh · Kết nối · KPI của tôi |
| Nút Đặt KPI / Chốt sổ / Xuất dữ liệu / Import Studio | Có | Ẩn |
| Kết nối Display API | Toàn bộ 8 kênh + nút "Chạy đồng bộ ngay" | Chỉ kênh mình đang phụ trách, không có nút đồng bộ toàn hệ thống |
| Tạo tài khoản Creator | Có | Ẩn |

## Ghi chú

- Creator xem được số liệu kênh khác (yêu cầu minh bạch để học hỏi chéo), nhưng không sửa được gì.
- Không có self-signup. Manager tạo tài khoản Creator.
- Chốt sổ chỉ Manager thực hiện.
- **Kết nối Display API là ngoại lệ**: Creator được tự Authorize kênh mình phụ trách (quyết định M3b,
  20/08/2026) — Creator có sẵn tài khoản TikTok của chính kênh, Manager thì không, nên bắt Manager làm
  hộ cả 8 kênh không thực tế. Vẫn phải thêm tài khoản đó vào Sandbox Target Users trên TikTok developer
  portal trước — việc chỉ người có quyền truy cập portal (hiện là Manager) làm được, không tránh được
  dù ai bấm "Kết nối" trong app.
