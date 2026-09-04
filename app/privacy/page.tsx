import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — AHD Dashboard",
};

export default function PrivacyPage() {
  return (
    <main className="flex-1 max-w-2xl mx-auto px-6 py-16 text-sm leading-relaxed">
      <h1 className="text-xl font-bold mb-6">Privacy Policy — AHD Dashboard</h1>

      <p className="mb-4">
        AHD Dashboard is an internal tool. It connects to TikTok&apos;s
        Display API, using the following scopes: user.info.basic,
        user.info.stats, video.list.
      </p>

      <p className="mb-4">
        Data collected via this connection (follower count, video count,
        video view/like/comment/share counts) is stored solely for internal
        reporting and is not shared with any third party or used for
        advertising.
      </p>

      <p className="mb-4">
        Access tokens are stored securely and used only to refresh this data
        on a scheduled basis. A channel owner may revoke access at any time
        via TikTok account settings.
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
