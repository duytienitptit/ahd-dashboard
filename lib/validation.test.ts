import { describe, expect, it } from "vitest";

import { ValidationError, normalizeTiktokHandle } from "./validation";

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
