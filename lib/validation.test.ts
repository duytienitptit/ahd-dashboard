import { describe, expect, it } from "vitest";

import { ValidationError, normalizeTiktokHandle, optionalNonNegativeInt, requireDateString } from "./validation";

describe("normalizeTiktokHandle", () => {
  it("accepts a bare handle without @", () => {
    expect(normalizeTiktokHandle("vuonvuonvang")).toBe("@vuonvuonvang");
  });

  it("accepts a handle already prefixed with @", () => {
    expect(normalizeTiktokHandle("@vuonvuonvang")).toBe("@vuonvuonvang");
  });

  it("lowercases mixed-case handles", () => {
    expect(normalizeTiktokHandle("@VuonVuonVang")).toBe("@vuonvuonvang");
  });

  it("extracts the handle from a full profile URL", () => {
    expect(normalizeTiktokHandle("https://www.tiktok.com/@vuonvuonvang")).toBe("@vuonvuonvang");
  });

  it("strips query params off a profile URL", () => {
    expect(normalizeTiktokHandle("https://www.tiktok.com/@vuonvuonvang?lang=en")).toBe(
      "@vuonvuonvang",
    );
  });

  it("rejects a handle that is too short", () => {
    expect(() => normalizeTiktokHandle("@a")).toThrow(ValidationError);
  });

  it("rejects a handle that is too long", () => {
    expect(() => normalizeTiktokHandle(`@${"a".repeat(25)}`)).toThrow(ValidationError);
  });

  it("rejects characters TikTok handles cannot contain", () => {
    expect(() => normalizeTiktokHandle("@not a handle!!")).toThrow(ValidationError);
  });

  it("rejects an empty handle", () => {
    expect(() => normalizeTiktokHandle("@")).toThrow(ValidationError);
  });
});

describe("requireDateString", () => {
  it("accepts a YYYY-MM-DD string", () => {
    expect(requireDateString({ date: "2026-08-21" }, "date")).toBe("2026-08-21");
  });

  it("rejects a missing field", () => {
    expect(() => requireDateString({}, "date")).toThrow(ValidationError);
  });

  it("rejects a non-ISO date format", () => {
    expect(() => requireDateString({ date: "21/08/2026" }, "date")).toThrow(ValidationError);
  });
});

describe("optionalNonNegativeInt", () => {
  it("returns undefined when the field is omitted", () => {
    expect(optionalNonNegativeInt({}, "followers")).toBeUndefined();
  });

  it("returns undefined when the field is explicitly null", () => {
    expect(optionalNonNegativeInt({ followers: null }, "followers")).toBeUndefined();
  });

  it("accepts a non-negative integer, including zero", () => {
    expect(optionalNonNegativeInt({ followers: 9400 }, "followers")).toBe(9400);
    expect(optionalNonNegativeInt({ followers: 0 }, "followers")).toBe(0);
  });

  it("rejects a negative number", () => {
    expect(() => optionalNonNegativeInt({ followers: -1 }, "followers")).toThrow(ValidationError);
  });

  it("rejects a non-integer number", () => {
    expect(() => optionalNonNegativeInt({ followers: 9.5 }, "followers")).toThrow(ValidationError);
  });

  it("rejects a non-number type", () => {
    expect(() => optionalNonNegativeInt({ followers: "9400" }, "followers")).toThrow(ValidationError);
  });
});
