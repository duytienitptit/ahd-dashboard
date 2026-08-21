"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-[6px] px-3.5 py-[7px] text-sm ${
              active ? "bg-line-soft font-semibold text-ink" : "font-medium text-ink-2 hover:bg-surface"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
