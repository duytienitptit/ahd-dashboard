import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — AHD Dashboard",
};

export default function TermsPage() {
  return (
    <main className="flex-1 max-w-2xl mx-auto px-6 py-16 text-sm leading-relaxed">
      <h1 className="text-xl font-bold mb-6">Terms of Service — AHD Dashboard</h1>

      <p className="mb-4">
        AHD Dashboard is an internal tool used by our company to view and
        manage data from our own TikTok channels. It is not a public product
        and is not available for use by external parties.
      </p>

      <p className="mb-4">
        By connecting a TikTok account to AHD Dashboard, you agree that the
        account is owned or authorized by the company for the purpose of
        viewing channel performance data (followers, video views, engagement)
        within this internal tool.
      </p>

      <p className="text-neutral-500">
        Contact: anzstudio.acc@gmail.com
        <br />
        Last updated: August 2026
      </p>
      <p className="mt-8 border-t border-line-soft pt-5 text-[13px]">
        <Link href="/login" className="font-semibold text-ink-3 hover:text-ink">
          ← Quay lại đăng nhập
        </Link>
      </p>
    </main>
  );
}
