import JSZip from "jszip";

import { ValidationError } from "@/lib/validation";

/** The inner CSV filenames this whole pipeline knows how to read — docs/CSV_FORMAT.md "Cấu trúc". */
export const KNOWN_CSV_FILES = [
  "Overview.csv",
  "FollowerHistory.csv",
  "FollowerGender.csv",
  "FollowerTopTerritories.csv",
  "FollowerActivity.csv",
  "Viewers.csv",
  "Content.csv",
] as const;

export type KnownCsvFile = (typeof KNOWN_CSV_FILES)[number];

/**
 * Extracts recognized CSVs out of one or more uploaded zip files, keyed by their filename INSIDE
 * the zip (`Overview.csv`, ...) — never by the outer zip's filename, which contains a garbage date
 * segment (docs/CSV_FORMAT.md point 7). A Manager uploads up to 4 zips per channel (Overview /
 * Followers / Viewers / Content); this doesn't care which outer zip a CSV came from.
 */
export async function extractCsvEntries(
  files: { filename: string; buffer: Buffer }[],
): Promise<Map<KnownCsvFile, string>> {
  const entries = new Map<KnownCsvFile, string>();

  for (const file of files) {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(file.buffer);
    } catch {
      throw new ValidationError(`Không đọc được file zip: "${file.filename}".`);
    }

    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      const innerName = entry.name.split("/").pop() ?? entry.name;
      const known = KNOWN_CSV_FILES.find((name) => name === innerName);
      if (known) entries.set(known, await entry.async("text"));
    }
  }

  return entries;
}
