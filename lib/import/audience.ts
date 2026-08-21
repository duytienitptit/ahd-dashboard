import { parseCsv, parseNullableFloat } from "./csv";

/**
 * `FollowerGender.csv` / `FollowerTopTerritories.csv` — docs/CSV_FORMAT.md. Both are point-in-time
 * snapshots ("ảnh chụp tại thời điểm export"), not a daily series — there is no date column and no
 * settle-window concept for these. Ratios are decimal (`"0.55"` = 55%).
 */
export function parseFollowerGenderCsv(text: string): Record<string, number> {
  const distribution: Record<string, number> = {};
  for (const row of parseCsv(text)) {
    const value = parseNullableFloat(row["Distribution"]);
    if (row["Gender"] && value !== null) distribution[row["Gender"]] = value;
  }
  return distribution;
}

export function parseFollowerTerritoriesCsv(text: string): Record<string, number> {
  const distribution: Record<string, number> = {};
  for (const row of parseCsv(text)) {
    const value = parseNullableFloat(row["Distribution"]);
    if (row["Top territories"] && value !== null) distribution[row["Top territories"]] = value;
  }
  return distribution;
}
