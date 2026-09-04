import Link from "next/link";

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

        {/* Câu mô tả + 2 link dưới đây là để reviewer TikTok biết đang nhìn cái gì: đơn nộp
            production 26/08 bị từ chối vì Website URL chỉ dẫn tới một form đăng nhập trần
            (04/09/2026). Không phải landing page — reviewer nói rõ landing page cũng không tính. */}
        <p className="mb-5 text-[12.5px] leading-relaxed text-ink-3">
          Công cụ nội bộ theo dõi số liệu các kênh TikTok của công ty: follower, lượt xem, video theo
          từng ngày và tiến độ KPI.
        </p>

        <LoginForm next={typeof next === "string" ? next : "/"} />

        <p className="text-center text-xs leading-relaxed text-ink-3">
          Chưa có tài khoản? Liên hệ quản lý để được cấp.
        </p>

        <p className="mt-4 border-t border-line-soft pt-4 text-center text-xs text-ink-3">
          <Link href="/terms" className="font-semibold text-ink-3 hover:text-ink">
            Điều khoản sử dụng
          </Link>
          <span className="px-2">·</span>
          <Link href="/privacy" className="font-semibold text-ink-3 hover:text-ink">
            Chính sách riêng tư
          </Link>
        </p>
      </div>
    </main>
  );
}
