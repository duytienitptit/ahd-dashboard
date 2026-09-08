/**
 * Vietnamese labels for `audience_snapshot` distribution keys (FollowerGender.csv /
 * FollowerTopTerritories.csv — docs/CSV_FORMAT.md).
 *
 * Verified against the two real sample zips in `data/` (08/09/2026): even the channel
 * `docs/CSV_FORMAT.md` documents as exporting in Vietnamese still emits English gender keys
 * ("Male"/"Female"/"Other") and ISO-3166 alpha-2 territory codes ("VN", "KH", …) plus a literal
 * "Others" bucket. Two files are not proof and the Studio UI language can change, so both languages
 * are mapped.
 *
 * **Fallback rule:** an unrecognised key is returned as-is (uppercased when it looks like a 2-letter
 * code). Never drop the row, never render "undefined" — a stray "XZ" on screen is a legible bug
 * report; a silently dropped row is invisible data loss.
 */

const GENDER: Record<string, string> = {
  male: "Nam",
  nam: "Nam",
  female: "Nữ",
  "nữ": "Nữ",
  nu: "Nữ",
  other: "Khác",
  others: "Khác",
  "khác": "Khác",
  khac: "Khác",
  unknown: "Không rõ",
};

/** ISO-3166 alpha-2 codes plausible for a Vietnamese TikTok audience, plus a few full names in case
 *  Studio localizes the column. */
const TERRITORY: Record<string, string> = {
  vn: "Việt Nam",
  kh: "Campuchia",
  la: "Lào",
  th: "Thái Lan",
  id: "Indonesia",
  tw: "Đài Loan",
  au: "Úc",
  jp: "Nhật Bản",
  ph: "Philippines",
  my: "Malaysia",
  sg: "Singapore",
  us: "Mỹ",
  kr: "Hàn Quốc",
  cn: "Trung Quốc",
  hk: "Hồng Kông",
  mo: "Ma Cao",
  mm: "Myanmar",
  bd: "Bangladesh",
  in: "Ấn Độ",
  gb: "Anh",
  uk: "Anh",
  de: "Đức",
  fr: "Pháp",
  ca: "Canada",
  ru: "Nga",
  nl: "Hà Lan",
  it: "Ý",
  es: "Tây Ban Nha",
  se: "Thụy Điển",
  pl: "Ba Lan",
  cz: "Séc",
  ae: "UAE",
  sa: "Ả Rập Xê Út",
  nz: "New Zealand",
  br: "Brazil",
  mx: "Mexico",
  others: "Khác",
  other: "Khác",
  "khác": "Khác",
};

function fallback(key: string): string {
  const trimmed = key.trim();
  return /^[a-z]{2}$/i.test(trimmed) ? trimmed.toUpperCase() : trimmed;
}

export function genderLabelVi(key: string): string {
  return GENDER[key.trim().toLowerCase()] ?? fallback(key);
}

export function territoryLabelVi(key: string): string {
  return TERRITORY[key.trim().toLowerCase()] ?? fallback(key);
}
