import { LoginForm } from "./login-form";

export const metadata = { title: "Đăng nhập · AHD Dashboard" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-[380px] rounded-[10px] border border-line bg-bg px-9 py-10">
        <div className="mb-[30px] flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-card bg-ink">
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-cyan-logo)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 18l5-5 4 3 7-7" />
            </svg>
          </div>
          <div className="text-[17px] font-extrabold tracking-[-0.3px]">AHD</div>
        </div>

        <LoginForm next={typeof next === "string" ? next : "/"} />

        <p className="text-center text-xs leading-relaxed text-ink-3">
          Chưa có tài khoản? Liên hệ quản lý để được cấp.
        </p>
      </div>
    </main>
  );
}
