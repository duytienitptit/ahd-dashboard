import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser, type AppRole } from "@/lib/auth";
import { initialsFromEnd } from "@/lib/format";

import { NavLinks } from "./nav-links";

// Tabs per docs/USER_FLOW.md "Khác biệt theo vai trò".
const NAV_ITEMS: Record<AppRole, { href: string; label: string }[]> = {
  manager: [
    { href: "/", label: "Tổng quan" },
    { href: "/channels", label: "Kênh" },
    // Trang vẫn ở route /creators (đổi URL không có lợi gì, không ai bookmark trong app nội bộ) —
    // chỉ đổi nhãn hiển thị (21/08/2026, theo yêu cầu) vì trang giờ gồm cả Team, không chỉ Creator.
    { href: "/creators", label: "Nhân sự" },
    { href: "/import", label: "Dữ liệu" },
    { href: "/kpi", label: "KPI" },
  ],
  creator: [
    { href: "/", label: "Tổng quan" },
    { href: "/channels", label: "Kênh" },
    // Cùng "Dữ liệu" như Manager từ 21/08/2026 — Creator giờ upload được file Studio cho kênh
    // mình phụ trách (theo vận hành thực tế, xem CLAUDE.md). /import có DataTabs điều hướng sang
    // /connections, nên chỉ cần 1 mục nav trỏ vào /import là đủ, không cần 2 mục riêng.
    { href: "/import", label: "Dữ liệu" },
    { href: "/kpi", label: "KPI của tôi" },
  ],
};

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-line px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-card bg-ink">
              <svg
                width="16"
                height="16"
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
            </span>
            <span className="text-[16px] font-extrabold tracking-[-0.3px]">AHD</span>
          </Link>
          <NavLinks items={NAV_ITEMS[user.role]} />
        </div>

        <div className="flex items-center gap-2.5">
          <div className="text-right">
            <div className="text-[13px] font-semibold leading-tight">{user.name}</div>
            <div className="text-[11px] leading-tight text-ink-3">
              {user.role === "manager" ? "Quản lý" : "Creator"}
            </div>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-pill bg-ink text-[12px] font-bold text-white">
            {initialsFromEnd(user.name)}
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="h-[38px] rounded-btn border border-line px-3 text-[13px] font-semibold hover:bg-surface"
            >
              Đăng xuất
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
