import { describe, expect, it } from "vitest";

import { resolveStudioDate } from "./date";

describe("resolveStudioDate", () => {
  it("parses the Vietnamese form", () => {
    expect(resolveStudioDate("16 tháng Tám", "2026-08-20")).toBe("2026-08-16");
  });

  it("parses the English form", () => {
    expect(resolveStudioDate("August 16", "2026-08-20")).toBe("2026-08-16");
  });

  it("is case-insensitive on the month name", () => {
    expect(resolveStudioDate("16 THÁNG tám", "2026-08-20")).toBe("2026-08-16");
    expect(resolveStudioDate("august 16", "2026-08-20")).toBe("2026-08-16");
  });

  it("handles a Vietnamese two-word month name", () => {
    expect(resolveStudioDate("5 tháng Mười Một", "2026-11-10")).toBe("2026-11-05");
  });

  it("rolls back a year when the inferred date would be in the future", () => {
    // Exported early January 2027, but the row is a December date — assuming the reference year
    // (2027) would land on a future December, so it must resolve to December 2026.
    expect(resolveStudioDate("20 tháng Mười Hai", "2027-01-05")).toBe("2026-12-20");
    expect(resolveStudioDate("December 20", "2027-01-05")).toBe("2026-12-20");
  });

  it("keeps the reference year when the date is not in the future", () => {
    expect(resolveStudioDate("1 tháng Một", "2026-01-05")).toBe("2026-01-01");
  });

  it("throws on an unrecognized format", () => {
    expect(() => resolveStudioDate("2026-08-16", "2026-08-20")).toThrow();
  });

  it("throws on a calendar-invalid combination", () => {
    expect(() => resolveStudioDate("31 tháng Tư", "2026-08-20")).toThrow();
  });
});
