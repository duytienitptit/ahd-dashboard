import { describe, expect, it } from "vitest";

import {
  formatCompact,
  formatDeltaPct,
  formatFullDate,
  formatNumber,
  formatRatePct,
  formatShortDate,
  formatSignedNumber,
} from "./format";

describe("formatNumber", () => {
  it("groups with vi-VN dots", () => {
    expect(formatNumber(9400)).toBe("9.400");
  });
});

describe("formatCompact", () => {
  it("formats thousands with one decimal below 100k", () => {
    expect(formatCompact(9400)).toBe("9,4k");
  });
  it("drops the decimal at 100k+", () => {
    expect(formatCompact(120000)).toBe("120k");
  });
  it("formats millions", () => {
    expect(formatCompact(2420000)).toBe("2,42M");
  });
  it("leaves sub-1000 values as plain integers", () => {
    expect(formatCompact(500)).toBe("500");
  });
  it("signs negative values with a minus sign, not a hyphen", () => {
    expect(formatCompact(-500)).toBe("−500");
  });
});

describe("formatSignedNumber", () => {
  it("prefixes a plus for non-negative, a minus sign for negative", () => {
    expect(formatSignedNumber(2600)).toBe("+2.600");
    expect(formatSignedNumber(-500)).toBe("−500");
    expect(formatSignedNumber(0)).toBe("+0");
  });
});

describe("formatDeltaPct", () => {
  it("signs the percentage", () => {
    expect(formatDeltaPct(12)).toBe("+12%");
    expect(formatDeltaPct(-5)).toBe("−5%");
  });
  it("renders null as an em dash placeholder", () => {
    expect(formatDeltaPct(null)).toBe("—");
  });
});

describe("formatRatePct", () => {
  it("converts a 0..1 ratio to a vi-VN percentage", () => {
    expect(formatRatePct(0.0182)).toBe("1,82%");
  });
  it("renders null as a placeholder", () => {
    expect(formatRatePct(null)).toBe("—");
  });
});

describe("formatShortDate / formatFullDate", () => {
  it("formats day/month and day/month/year", () => {
    expect(formatShortDate("2026-08-17")).toBe("17/08");
    expect(formatFullDate("2026-08-17")).toBe("17/08/2026");
  });
});
