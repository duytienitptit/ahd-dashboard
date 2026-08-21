// Studio date strings carry no year, and switch language depending on the TikTok Studio UI locale
// at export time (docs/CSV_FORMAT.md points 2-3). Both forms seen on real exports:
//   Vietnamese: "18 tháng Sáu"   (day, "tháng", month name)
//   English:    "August 18"     (month name, day)

const VN_MONTHS: Record<string, number> = {
  một: 1,
  hai: 2,
  ba: 3,
  tư: 4,
  năm: 5,
  sáu: 6,
  bảy: 7,
  tám: 8,
  chín: 9,
  mười: 10,
  "mười một": 11,
  "mười hai": 12,
};

const EN_MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseMonthDay(raw: string): { month: number; day: number } {
  const value = normalize(raw);

  const vnMatch = value.match(/^(\d{1,2})\s+tháng\s+(.+)$/);
  if (vnMatch) {
    const day = Number.parseInt(vnMatch[1], 10);
    const month = VN_MONTHS[vnMatch[2]];
    if (month) return { month, day };
  }

  const enMatch = value.match(/^([a-z]+)\s+(\d{1,2})$/);
  if (enMatch) {
    const month = EN_MONTHS[enMatch[1]];
    const day = Number.parseInt(enMatch[2], 10);
    if (month) return { month, day };
  }

  throw new Error(`Không nhận diện được định dạng ngày Studio: "${raw}"`);
}

/**
 * Resolves a year-less Studio date string against `referenceDate` (the day the file was exported/
 * uploaded — never parsed from anything in the file itself, per docs/CSV_FORMAT.md point 7).
 *
 * Assumes the reference year first; if that lands in the future relative to `referenceDate`, rolls
 * back one year (docs/CSV_FORMAT.md point 3 — the December→January boundary case).
 */
export function resolveStudioDate(raw: string, referenceDate: string): string {
  const { month, day } = parseMonthDay(raw);
  const referenceYear = Number.parseInt(referenceDate.slice(0, 4), 10);

  const pad = (n: number) => String(n).padStart(2, "0");
  const candidate = (year: number) => `${year}-${pad(month)}-${pad(day)}`;

  let resolved = candidate(referenceYear);
  if (resolved > referenceDate) resolved = candidate(referenceYear - 1);

  // Round-trip through Date.UTC to reject calendar-invalid combinations (e.g. day 31 of a 30-day
  // month) instead of silently rolling over into the next month.
  const [y, m, d] = resolved.split("-").map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new Error(`Ngày Studio không hợp lệ: "${raw}" (suy ra ${resolved})`);
  }

  return resolved;
}
