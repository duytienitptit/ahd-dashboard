// Shared number formatting — every screen that shows a stat (Tổng quan, Kênh, Chi tiết kênh,
// Creator) must render the same number the same way, so this is the one place it happens.
// Mirrors the `nf`/`kf` helpers duplicated across design/*.dc.html's mockup scripts.

/** "9.400" — vi-VN grouping, no decimals. */
export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("vi-VN");
}

/** "470k" / "2,42M" — compact form for space-tight stat tiles. */
export function formatCompact(n: number): string {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const digits = abs >= 100_000_000 ? 0 : 2;
    return sign + (abs / 1_000_000).toFixed(digits).replace(".", ",") + "M";
  }
  if (abs >= 1000) {
    const digits = abs >= 100_000 ? 0 : 1;
    return sign + (abs / 1000).toFixed(digits).replace(".", ",") + "k";
  }
  return sign + String(Math.round(abs));
}

/** "+2.600" / "−500" — signed, grouped. For raw deltas (followers gained, not a percentage). */
export function formatSignedNumber(n: number): string {
  const rounded = Math.round(n);
  return (rounded >= 0 ? "+" : "−") + Math.abs(rounded).toLocaleString("vi-VN");
}

/** "+12%" / "−5%" / "—" for a `null` (nothing to compare against). */
export function formatDeltaPct(pct: number | null): string {
  if (pct === null) return "—";
  return (pct >= 0 ? "+" : "−") + Math.abs(pct) + "%";
}

/** "1,82%" — a ratio (0..1) as a percentage with `digits` decimals, vi-VN comma. */
export function formatRatePct(ratio: number | null, digits = 2): string {
  if (ratio === null) return "—";
  return (ratio * 100).toFixed(digits).replace(".", ",") + "%";
}

/** "17/08" — day/month, no year (every screen here is inside one operating year). */
export function formatShortDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

/** "17/08/2026" — full VN date, for tables where the year matters. */
export function formatFullDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

/** First two words' initials — channel avatars (design/Channels.dc.html's rule). */
export function initialsFromStart(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

/** Last two words' initials — person avatars (design/Creators.dc.html's rule; differs from
 *  channels on purpose, kept as documented in app/(app)/channels/channel-form.tsx). */
export function initialsFromEnd(name: string): string {
  return name.trim().split(/\s+/).slice(-2).map((w) => w[0]).join("").toUpperCase();
}

const AVATAR_PALETTE = [
  { bg: "var(--color-cyan-bg)", fg: "var(--color-cyan-ink-2)" },
  { bg: "var(--color-red-bg)", fg: "var(--color-red-dark)" },
  { bg: "var(--color-green-bg)", fg: "var(--color-green-dark)" },
  { bg: "var(--color-amber-bg)", fg: "var(--color-amber-dark)" },
  { bg: "var(--color-line-soft)", fg: "var(--color-ink-2)" },
] as const;

/** Cycles the same 3-color avatar palette every list of channels/creators uses
 *  (design/Main.dc.html's `AV` array) — pass the item's index in its list. */
export function avatarPalette(index: number): { bg: string; fg: string } {
  return AVATAR_PALETTE[index % AVATAR_PALETTE.length];
}
