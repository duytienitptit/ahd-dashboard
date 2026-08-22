"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BASE_TABS = [
  { href: "/import", label: "Nhập file Studio" },
  { href: "/connections", label: "Kết nối Display API" },
] as const;

/** "Nhập tay" stays Manager-only (CLAUDE.md: manual_entry là ngoại lệ duy nhất KHÔNG mở cho Creator,
 *  khác với Nhập file Studio ở trên — người hưởng thưởng không tự khai số tính thưởng). */
const MANUAL_ENTRY_TAB = { href: "/import/manual-entry", label: "Nhập tay" } as const;

/** Sub-tab bar shared by /import and /connections (design/Import.dc.html, design/Connections.dc.html) —
 *  not a top-level nav item, "Dữ liệu" in the header already points at /import. */
export function DataTabs({ isManager }: { isManager: boolean }) {
  const pathname = usePathname();
  const tabs = isManager ? [...BASE_TABS, MANUAL_ENTRY_TAB] : BASE_TABS;

  return (
    <div className="mb-[18px] flex items-center gap-1">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-t-[6px] px-4 py-2 text-sm ${
              active ? "bg-line-soft font-bold text-ink" : "font-medium text-ink-3 hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
