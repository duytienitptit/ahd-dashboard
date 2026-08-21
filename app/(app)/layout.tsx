import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser, type AppRole } from "@/lib/auth";

import { NavLinks } from "./nav-links";

// Tabs per docs/USER_FLOW.md "Khác biệt theo vai trò". KPI (Manager) and "KPI của tôi" (Creator) are
// M5 work — no link to a route that doesn't exist yet.
const NAV_ITEMS: Record<AppRole, { href: string; label: string }[]> = {
  manager: [
    { href: "/", label: "Tổng quan" },
    { href: "/channels", label: "Kênh" },
    { href: "/creators", label: "Creator" },
    { href: "/import", label: "Dữ liệu" },
  ],
  creator: [
    { href: "/", label: "Tổng quan" },
    { href: "/channels", label: "Kênh" },
    // Không phải "Dữ liệu" như Manager — Creator không có /import, chỉ kết nối kênh mình phụ trách.
    { href: "/connections", label: "Kết nối" },
  ],
};

/** Last two words' initials — matches design/Creators.dc.html's avatar rule. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(-2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

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
            {initials(user.name)}
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
