import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

// The design system specified Figtree, but Figtree ships only latin + latin-ext and its ranges skip
// U+1EA0–U+1EF1 — most Vietnamese accented vowels. Every accented character would silently fall back
// to another typeface mid-word. Be Vietnam Pro is the same geometric-sans register with a real
// vietnamese subset. See docs/DESIGN_SYSTEM.md.
const bodyFont = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AHD Dashboard",
  description:
    "Internal dashboard for our team to track and manage TikTok channel performance and data over time.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${bodyFont.variable} h-full antialiased`}>
      {/* suppressHydrationWarning: browser extensions (translators, "reader mode" tools, etc.) can
          inject attributes onto <body> before React hydrates — a false-positive mismatch that has
          nothing to do with our own markup. Scoped to this one tag; does not hide real hydration
          bugs in children. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
