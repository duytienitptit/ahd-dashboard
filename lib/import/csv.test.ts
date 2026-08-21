import { describe, expect, it } from "vitest";

import { parseCsv, parseNullableFloat, parseNullableInt } from "./csv";

describe("parseCsv", () => {
  it("strips a leading BOM from the header", () => {
    const text = "﻿\"Date\",\"Views\"\n\"1 tháng Tám\",\"100\"\n";
    const rows = parseCsv(text);
    expect(rows).toEqual([{ Date: "1 tháng Tám", Views: "100" }]);
  });

  it("handles a missing trailing newline on the last row", () => {
    const text = '"Date","Views"\n"1 tháng Tám","100"';
    expect(parseCsv(text)).toEqual([{ Date: "1 tháng Tám", Views: "100" }]);
  });

  it("handles quoted fields containing commas", () => {
    const text = '"Title","Link"\n"Hello, world","https://x/1"';
    expect(parseCsv(text)).toEqual([{ Title: "Hello, world", Link: "https://x/1" }]);
  });

  it("handles escaped double quotes inside a field", () => {
    const text = '"Title"\n"She said ""hi"""';
    expect(parseCsv(text)).toEqual([{ Title: 'She said "hi"' }]);
  });

  it("returns an empty array for a header-only file", () => {
    expect(parseCsv('"Date","Views"\n')).toEqual([]);
  });
});

describe("parseNullableInt", () => {
  it('parses "undefined" as null, not 0', () => {
    expect(parseNullableInt("undefined")).toBeNull();
  });

  it("parses a genuine 0 as 0", () => {
    expect(parseNullableInt("0")).toBe(0);
  });

  it("parses a normal integer", () => {
    expect(parseNullableInt("85117")).toBe(85117);
  });

  it("treats an empty string as null", () => {
    expect(parseNullableInt("")).toBeNull();
  });
});

describe("parseNullableFloat", () => {
  it("parses a decimal ratio", () => {
    expect(parseNullableFloat("0.55")).toBe(0.55);
  });

  it('parses "undefined" as null', () => {
    expect(parseNullableFloat("undefined")).toBeNull();
  });
});
