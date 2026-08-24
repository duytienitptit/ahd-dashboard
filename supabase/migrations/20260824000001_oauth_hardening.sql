-- Siết kết nối Display API sau đợt rà 24/08/2026 (docs/DISPLAY_API.md bẫy #9, #12, #13).
--
-- Bối cảnh: guard so handle trong app/api/oauth/callback/route.ts là lớp phòng thủ DUY NHẤT chống
-- việc một tài khoản TikTok bị gắn vào nhiều kênh (sự cố 21/08/2026). Guard đó chạy ở tầng app nên
-- vẫn có đường vòng: peekFirstVideoLink lỗi → không đối chiếu được, hoặc người dùng bấm bypass.
-- Migration này bổ sung lớp thứ hai ở tầng DB, nơi không bypass được.

-- ── Một tài khoản TikTok chỉ được gắn vào đúng một kênh ────────────────────────────────────────
--
-- Đã xác nhận với người dùng 24/08/2026: mô hình là 1 kênh = 1 tài khoản TikTok, không có ngoại lệ
-- hợp lệ nào. Kiểm tra production trước khi viết migration này (scripts/diagnose-oauth.mjs, kiểm 1)
-- cho kết quả sạch — 6 kết nối, 6 open_id khác nhau — nên constraint áp được ngay, không cần dọn.
--
-- Đặt tên constraint tường minh vì app/api/oauth/callback/route.ts bắt lỗi 23505 để đổi thành thông
-- báo tiếng Việt tử tế thay vì 500.
alter table public.channel_oauth
  add constraint channel_oauth_tiktok_open_id_key unique (tiktok_open_id);

comment on column public.channel_oauth.tiktok_open_id is
  'UNIQUE: một tài khoản TikTok chỉ gắn được vào một kênh. Lớp chặn cuối cho sự cố 21/08/2026 (một tài khoản test dính vào cả 2 kênh thật) — guard so handle ở tầng app có thể không đối chiếu được, constraint này thì không.';

-- ── Handle của tài khoản đã Authorize ──────────────────────────────────────────────────────────
--
-- Trước đây `/connections` chỉ hiện "Đang chạy / Chưa xác minh" mà không nói kênh đang nối tài khoản
-- NÀO. Sự cố 21/08 lọt qua nhiều ngày đúng vì không ai nhìn thấy thông tin đó ở đâu cả. Lưu lại
-- handle đọc được lúc callback (từ share_url của 1 video) để hiện thường trực trên bảng.
--
-- Nullable: tài khoản chưa có video nào thì không có share_url để đọc handle — đúng trường hợp
-- account_verified = false.
alter table public.channel_oauth
  add column authorized_handle text;

comment on column public.channel_oauth.authorized_handle is
  'Handle TikTok đọc được từ share_url lúc Authorize, dạng "@handle". null = tài khoản chưa có video công khai nên không đối chiếu được (khi đó account_verified cũng false).';
