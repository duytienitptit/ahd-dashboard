-- Username-based login (22/08/2026, theo yêu cầu) — Manager và Creator không cần nhớ/nhập email
-- nữa. `email` vẫn giữ nguyên cột (Supabase Auth bắt buộc phải có email nội bộ), nhưng từ giờ chỉ
-- dùng cho Auth ở tầng dưới — không hiển thị, không dùng để đăng nhập. `username` là định danh
-- người dùng thật sự thấy và gõ.
--
-- Mật khẩu và email hiện có của các tài khoản đang tồn tại GIỮ NGUYÊN — chỉ thêm cột tra cứu mới,
-- không đổi gì ở tầng Supabase Auth, không ai bị đăng xuất hay mất quyền truy cập.

alter table public.creator add column username text;
alter table public.manager add column username text;

comment on column public.creator.username is 'Định danh đăng nhập người dùng thấy — thay email ở tầng UI (22/08/2026). Cột email vẫn còn, chỉ dùng nội bộ cho Supabase Auth, không hiển thị/không dùng để đăng nhập nữa.';
comment on column public.manager.username is 'Định danh đăng nhập người dùng thấy — thay email ở tầng UI (22/08/2026). Cột email vẫn còn, chỉ dùng nội bộ cho Supabase Auth.';

-- Backfill tài khoản Manager thật đang có — chọn cùng người dùng (22/08/2026).
update public.manager set username = 'andang' where email = 'duytien@gmail.com';

-- Bảng creator hiện rỗng (đã kiểm tra trước khi viết migration này) — không có gì để backfill.
-- NOT NULL bên dưới vẫn an toàn vì không có row nào vi phạm.

alter table public.creator alter column username set not null;
alter table public.creator add constraint creator_username_format check (username ~ '^[a-z0-9._-]{3,32}$');
alter table public.creator add constraint creator_username_key unique (username);

alter table public.manager alter column username set not null;
alter table public.manager add constraint manager_username_format check (username ~ '^[a-z0-9._-]{3,32}$');
alter table public.manager add constraint manager_username_key unique (username);
