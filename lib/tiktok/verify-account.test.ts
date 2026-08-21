import { describe, expect, it } from "vitest";

import { extractHandleFromVideoLink, normalizeHandle } from "./verify-account";

describe("extractHandleFromVideoLink", () => {
  it("extracts the handle from a real share_url shape", () => {
    expect(extractHandleFromVideoLink("https://www.tiktok.com/@nong.nghiep.xanh.17/video/7672373276106181908")).toBe(
      "nong.nghiep.xanh.17",
    );
  });

  it("is case-insensitive on the way in but normalizes to lowercase", () => {
    expect(extractHandleFromVideoLink("https://www.tiktok.com/@FooBar/video/1")).toBe("foobar");
  });

  it("returns null for a link with no recognizable handle", () => {
    expect(extractHandleFromVideoLink("https://example.com/not-tiktok")).toBeNull();
  });
});

describe("normalizeHandle", () => {
  it("strips a leading @ and lowercases", () => {
    expect(normalizeHandle("@Nong.Nghiep.Xanh.17")).toBe("nong.nghiep.xanh.17");
  });

  it("works the same with no leading @", () => {
    expect(normalizeHandle("Nong.Nghiep.Xanh.17")).toBe("nong.nghiep.xanh.17");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeHandle("  @foo  ")).toBe("foo");
  });
});
