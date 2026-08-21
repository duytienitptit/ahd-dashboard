# AHD Dashboard

Dashboard nội bộ lưu trữ và hiển thị dữ liệu 8 kênh TikTok theo thời gian.
Bối cảnh sản phẩm và quy tắc nghiệp vụ: [CLAUDE.md](CLAUDE.md) và [docs/](docs/).

## Chạy lần đầu

```bash
npm install
cp .env.example .env.local   # rồi điền giá trị thật
```

### 1. Supabase

Tạo project (free tier, region Singapore), rồi:

- **Project Settings → API**: copy `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` vào `.env.local`.
- **Authentication → Providers → Email**: tắt *Enable email signups* (không có self-signup) và tắt
  *Confirm email* (Manager cấp tài khoản cho Creator).

### 2. Khoá mã hoá token

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Bỏ kết quả vào `TOKEN_ENCRYPTION_KEY`. Khoá này mã hoá token Display API trước khi ghi vào DB —
**đổi khoá = mọi token đã lưu mất, phải OAuth lại 8 kênh**.

### 3. Migration

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

### 4. Seed

Điền `SEED_MANAGER_EMAIL` / `SEED_MANAGER_PASSWORD` vào `.env.local` rồi:

```bash
npm run seed
```

Tạo tài khoản Manager và các kênh. Muốn seed kèm Creator: copy
`data/samples/channels_seed.example.csv` thành `data/samples/channels_seed.csv`, điền vào,
đặt thêm `SEED_CREATOR_DEFAULT_PASSWORD`, rồi chạy lại.

### 5. Chạy

```bash
npm run dev
```

## Lệnh

| Lệnh | Việc |
| :--- | :--- |
| `npm run dev` | Dev server |
| `npm run build` | Build production (chạy cả typecheck) |
| `npm test` | Unit test (Vitest) |
| `npm run lint` | ESLint |
| `npm run seed` | Seed Manager + Creator + kênh |
| `./scripts/dryrun/run.sh` | Áp toàn bộ migration lên Postgres tạm trong Docker + chạy assertion. Chạy trước khi `db push` mỗi khi sửa schema |

## Cấu trúc

| Thư mục | Nội dung |
| :--- | :--- |
| `app/` | Route (App Router) + Server Action |
| `lib/supabase/` | 3 client: `server` (theo session, RLS áp dụng) · `client` (browser) · `admin` (service role, **bypass RLS**) |
| `lib/auth.ts` | `getCurrentUser()`, `requireManager()` — vai trò luôn resolve ở server |
| `lib/crypto/` | Mã hoá token at-rest (AES-256-GCM) |
| `supabase/migrations/` | Schema, RLS, view chọn nguồn `v_channel_daily` |
| `scripts/` | Seed + dry-run schema |
| `docs/` | Spec sản phẩm, ERD, API, format CSV, task list |
| `design/` | Mockup gốc 10 màn hình MVP |

`proxy.ts` ở gốc (Next 16 đổi tên từ `middleware.ts`) làm mới session cookie và chặn route khi chưa
đăng nhập. Phân quyền theo vai trò **không** nằm ở đó — nó cần truy vấn DB, xem `lib/auth.ts`.
