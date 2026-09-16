// Integration test for the parsing + planning pipeline against the real Studio exports in `data/`
// (60 real days, 2 channels — see data/README.md). No Supabase involved: plan-import.ts is pure, so
// this is the cheapest way to satisfy M3a's "test bằng data thật" requirement.
//
// `data/` is intentionally not committed (see .gitignore) — skip instead of failing on a machine
// that doesn't have it.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { parseOverviewCsv } from "./overview";
import { parseFollowerHistoryCsv } from "./follower-history";
import { parseViewersCsv } from "./viewers";
import { planStudioImport } from "./plan-import";
import { settledBeforeDate } from "./settle-window";

const DATA_DIR = join(process.cwd(), "data");
const EXPORT_DATE = "2026-08-20"; // any date safely after the real export's content (2026-08-18)

async function readCsvFromZip(zipPath: string, innerName: string): Promise<string> {
  const zip = await JSZip.loadAsync(readFileSync(zipPath));
  const entry = zip.file(innerName);
  if (!entry) throw new Error(`${innerName} không có trong ${zipPath}`);
  return entry.async("text");
}

const hasFixtures = existsSync(join(DATA_DIR, "Overview_2026-06-18_1786845545_nong.nghiep.xanh.17.zip"));

describe.skipIf(!hasFixtures)("planStudioImport (real data/ fixtures)", () => {
  it("nong.nghiep.xanh.17: imports every day the export has real numbers for", async () => {
    const [overviewText, followerText, viewerText] = await Promise.all([
      readCsvFromZip(join(DATA_DIR, "Overview_2026-06-18_1786845545_nong.nghiep.xanh.17.zip"), "Overview.csv"),
      readCsvFromZip(join(DATA_DIR, "Followers_nong.nghiep.xanh.17.zip"), "FollowerHistory.csv"),
      readCsvFromZip(join(DATA_DIR, "Viewers_nong.nghiep.xanh.17.zip"), "Viewers.csv"),
    ]);

    const overviewRows = parseOverviewCsv(overviewText, EXPORT_DATE);
    const followerRows = parseFollowerHistoryCsv(followerText, EXPORT_DATE);
    const viewerRows = parseViewersCsv(viewerText, EXPORT_DATE);

    const plan = planStudioImport({
      overviewRows,
      followerRows,
      viewerRows,
      exportDate: EXPORT_DATE,
      existingDisplayApi: {},
      existingStudioImport: {},
    });

    // The real export's freshest real numbers stop at 2026-08-16 (docs/CSV_FORMAT.md "Độ trễ dữ
    // liệu"), but Viewers.csv alone extends one row further, to 2026-08-17 (still "undefined" —
    // confirmed by inspecting the fixture directly). The settle window for EXPORT_DATE=2026-08-20 is
    // settledBefore=2026-08-19, so it catches nothing in this fixture: 2026-08-17 is dropped one
    // step later by hasAnyValue, because every column of that row is undefined.
    expect(settledBeforeDate(EXPORT_DATE)).toBe("2026-08-19");
    expect(plan.skippedRecentDates).toEqual([]);
    expect(plan.dailyWrites.has("2026-08-17")).toBe(false);

    // Overview.csv reports a genuine 0 (not "undefined") for the channel's first tracked day —
    // 0 is real data, not "no data" (CLAUDE.md: "0 và 'chưa có số' là hai trạng thái khác nhau"), so
    // this date IS written, with the columns Overview doesn't cover left null.
    const firstDay = plan.dailyWrites.get("2026-06-18");
    expect(firstDay?.videoViews).toBe(0);
    expect(firstDay?.followers).toBeNull(); // FollowerHistory.csv has "undefined" for this date

    // The last day with real numbers in the fixture.
    const last = plan.dailyWrites.get("2026-08-16");
    expect(last?.videoViews).toBe(85117);
    expect(last?.followers).toBe(994);

    // No display_api rows were supplied, so nothing should ever be flagged as a discrepancy.
    expect(plan.discrepancies).toEqual([]);

    expect(plan.importedDates).toContain("2026-08-16");
    expect(plan.importedDates.length).toBeGreaterThan(30);
  });

  it("flags a >10% discrepancy against an existing display_api row", async () => {
    const overviewText = await readCsvFromZip(
      join(DATA_DIR, "Overview_2026-06-18_1786845545_nong.nghiep.xanh.17.zip"),
      "Overview.csv",
    );
    const overviewRows = parseOverviewCsv(overviewText, EXPORT_DATE);

    const plan = planStudioImport({
      overviewRows,
      followerRows: [],
      viewerRows: [],
      exportDate: EXPORT_DATE,
      // Real Studio value for 2026-08-16 is 85117; make the "existing" display_api value far off.
      existingDisplayApi: { "2026-08-16": { videoViews: 50000 } },
      existingStudioImport: {},
    });

    const flagged = plan.discrepancies.find((d) => d.date === "2026-08-16");
    expect(flagged).toBeDefined();
    expect(flagged?.studio).toBe(85117);
    expect(flagged?.displayApi).toBe(50000);
  });

  it("preserves an existing studio_import value when the fresh parse is null for that column", async () => {
    const overviewText = await readCsvFromZip(
      join(DATA_DIR, "Overview_2026-06-18_1786845545_nong.nghiep.xanh.17.zip"),
      "Overview.csv",
    );
    const overviewRows = parseOverviewCsv(overviewText, EXPORT_DATE);

    const plan = planStudioImport({
      overviewRows,
      followerRows: [], // fresh followers is null for every date
      viewerRows: [],
      exportDate: EXPORT_DATE,
      existingDisplayApi: {},
      existingStudioImport: { "2026-08-16": { followers: 900 } },
    });

    expect(plan.dailyWrites.get("2026-08-16")?.followers).toBe(900);
  });
});

describe("planStudioImport (synthetic)", () => {
  it("skips a settled date with no real data in any of the 3 files", () => {
    const plan = planStudioImport({
      overviewRows: [{ date: "2026-01-01", videoViews: null, profileViews: null, likes: null, comments: null, shares: null }],
      followerRows: [{ date: "2026-01-01", followers: null }],
      viewerRows: [{ date: "2026-01-01", totalViewers: null, newViewers: null, returningViewers: null }],
      exportDate: "2026-02-01",
      existingDisplayApi: {},
      existingStudioImport: {},
    });

    expect(plan.dailyWrites.has("2026-01-01")).toBe(false);
    expect(plan.importedDates).toEqual([]);
    expect(plan.skippedRecentDates).toEqual([]);
    expect(plan.readDates).toBe(1);
  });

  // The rule set on 25/08/2026: Studio lags 2 days, so an import run on the 25th writes through the
  // 23rd and leaves only 24-25 to display_api.
  it("skips exactly the 2 lagging days and writes through importDate − 2", () => {
    const dates = ["2026-08-21", "2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25"];

    const plan = planStudioImport({
      overviewRows: dates.map((date) => ({
        date,
        videoViews: 100,
        profileViews: null,
        likes: null,
        comments: null,
        shares: null,
      })),
      followerRows: [],
      viewerRows: [],
      exportDate: "2026-08-25",
      existingDisplayApi: {},
      existingStudioImport: {},
    });

    expect(plan.importedDates).toEqual(["2026-08-21", "2026-08-22", "2026-08-23"]);
    expect(plan.skippedRecentDates).toEqual(["2026-08-24", "2026-08-25"]);
  });

  // 26/08/2026, theo yêu cầu — the gap flagged during M6: nothing stopped an import
  // from silently overwriting a date a Manager had already finalized.
  it("skips locked (final-cycle) dates even when they'd otherwise be well inside the settle window", () => {
    const dates = ["2026-08-10", "2026-08-11", "2026-08-12"];

    const plan = planStudioImport({
      overviewRows: dates.map((date) => ({
        date,
        videoViews: 100,
        profileViews: null,
        likes: null,
        comments: null,
        shares: null,
      })),
      followerRows: [],
      viewerRows: [],
      exportDate: "2026-08-25", // settledBefore = 2026-08-24, all 3 dates comfortably importable
      existingDisplayApi: {},
      existingStudioImport: {},
      lockedDates: new Set(["2026-08-10", "2026-08-11"]),
    });

    expect(plan.skippedFinalDates).toEqual(["2026-08-10", "2026-08-11"]);
    expect(plan.importedDates).toEqual(["2026-08-12"]);
    expect(plan.dailyWrites.has("2026-08-10")).toBe(false);
    expect(plan.dailyWrites.has("2026-08-11")).toBe(false);
  });

  it("locked check runs before the settle window — a date can't be reported as both", () => {
    const plan = planStudioImport({
      overviewRows: [{ date: "2026-08-24", videoViews: 100, profileViews: null, likes: null, comments: null, shares: null }],
      followerRows: [],
      viewerRows: [],
      exportDate: "2026-08-25", // settledBefore = 2026-08-24 — this date would ALSO be "recent"
      existingDisplayApi: {},
      existingStudioImport: {},
      lockedDates: new Set(["2026-08-24"]),
    });

    expect(plan.skippedFinalDates).toEqual(["2026-08-24"]);
    expect(plan.skippedRecentDates).toEqual([]);
  });
});
