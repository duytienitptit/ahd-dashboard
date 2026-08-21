import { describe, expect, it } from "vitest";

import { determineSyncDate } from "./sync";

describe("determineSyncDate", () => {
  it("is a bootstrap when there is no previous sync at all — uses the caller's `today`, not wall-clock now", () => {
    const result = determineSyncDate(null, "2026-08-21");
    expect(result.isBootstrap).toBe(true);
    expect(result.date).toBe("2026-08-21");
  });

  it("attributes the cron's fixed 03:00 ICT run to YESTERDAY, not the day it runs on", () => {
    // Previous sync: 2026-08-19 03:00 ICT (cron the morning before).
    const lastSyncAt = "2026-08-18T20:00:00.000Z"; // 2026-08-19 03:00 ICT
    // This sync runs 2026-08-20 03:00 ICT (today's cron).
    const result = determineSyncDate(lastSyncAt, "2026-08-20");
    expect(result.isBootstrap).toBe(false);
    // The delta spans [2026-08-19 03:00, 2026-08-20 03:00] — overwhelmingly the 19th's activity.
    expect(result.date).toBe("2026-08-19");
  });

  it("attributes a same-day manual re-sync to today, not back to the last cron's day", () => {
    // Cron already ran this morning: 2026-08-20 03:00 ICT.
    const lastSyncAt = "2026-08-19T20:00:00.000Z"; // 2026-08-20 03:00 ICT
    // Manager clicks "Chạy đồng bộ ngay" the same afternoon.
    const result = determineSyncDate(lastSyncAt, "2026-08-20");
    // Baseline (lastSyncAt) is already ON 2026-08-20 — the delta is same-day growth.
    expect(result.date).toBe("2026-08-20");
  });

  it("is never a bootstrap once a channel has synced at least once", () => {
    const result = determineSyncDate("2020-01-01T00:00:00.000Z", "2026-08-20");
    expect(result.isBootstrap).toBe(false);
  });

  it("bootstrap date tracks the caller's `today` even if wall-clock now disagrees", () => {
    // Regression guard: an earlier version called `new Date()` internally for the bootstrap branch
    // instead of using the `today` the caller already computed — harmless in production (both are
    // the same VN calendar day almost always) but silently wrong for anything that pins `today`
    // explicitly, which is exactly what a test (or a delayed/retried job) does.
    const result = determineSyncDate(null, "2020-01-01");
    expect(result.date).toBe("2020-01-01");
  });
});
