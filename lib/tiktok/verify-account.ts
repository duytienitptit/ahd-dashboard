/**
 * Cross-checks the TikTok account that was just OAuth-authorized against the channel it was meant
 * for. TikTok's consent screen only ever asks "does the currently-logged-in TikTok account agree to
 * this?" — it has no idea our app thinks of this as "kênh X's connection". If the browser doing the
 * Authorize step happened to be logged into a DIFFERENT TikTok account (a personal account, a test
 * account, the wrong channel), that account's token silently gets stored as kênh X's connection, and
 * every sync afterward writes THAT account's numbers into kênh X's data_snapshot — a wrong-but-silent
 * failure, exactly the kind CLAUDE.md calls out repeatedly.
 *
 * Verified via a video's `share_url` (e.g. `https://www.tiktok.com/@handle/video/123`) rather than
 * requesting the `user.info.profile` scope for `username` — that scope was never exercised in M0
 * (docs/DISPLAY_API.md only confirms user.info.basic/stats + video.list), so this avoids requesting
 * an unverified scope just for a safety-net check.
 */
export function extractHandleFromVideoLink(link: string): string | null {
  const match = link.match(/tiktok\.com\/@([^/?]+)/i);
  return match ? match[1].toLowerCase() : null;
}

/** `@Foo.Bar` and `foo.bar` compare equal. */
export function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase().replace(/^@/, "");
}
