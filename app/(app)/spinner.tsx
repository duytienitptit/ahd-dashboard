/** Matches DESIGN_SYSTEM.md's icon rules (inline SVG, stroke-based) — used wherever a filter
 *  control needs to show "a server round trip is in flight" (see date-range-picker.tsx's comment on
 *  why this is more than cosmetic). */
export function Spinner({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      className="animate-spin"
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}
