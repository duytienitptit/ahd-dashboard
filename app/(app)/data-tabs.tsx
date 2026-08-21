"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/import", label: "Nhập file Studio" },
  { href: "/connections", label: "Kết nối Display API" },
] as const;

/** Sub-tab bar shared by /import and /connections (design/Import.dc.html, design/Connections.dc.html) —
 *  not a top-level nav item, "Dữ liệu" in the header already points at /import. */
export function DataTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-[18px] flex items-center gap-1">
      {TABS.map((tab) => {
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
