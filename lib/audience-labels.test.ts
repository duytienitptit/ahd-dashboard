import { describe, expect, it } from "vitest";

import { genderLabelVi, territoryLabelVi } from "./audience-labels";

describe("genderLabelVi", () => {
  it("maps English keys (the real sample data)", () => {
    expect(genderLabelVi("Male")).toBe("Nam");
    expect(genderLabelVi("Female")).toBe("Nữ");
    expect(genderLabelVi("Other")).toBe("Khác");
  });

  it("maps Vietnamese keys too (Studio UI language can change)", () => {
    expect(genderLabelVi("Nam")).toBe("Nam");
    expect(genderLabelVi("Nữ")).toBe("Nữ");
  });

  it("unknown key passes through, never undefined", () => {
    expect(genderLabelVi("Nonbinary")).toBe("Nonbinary");
  });
});

describe("territoryLabelVi", () => {
  it("maps ISO alpha-2 codes (the real sample data)", () => {
    expect(territoryLabelVi("VN")).toBe("Việt Nam");
    expect(territoryLabelVi("KH")).toBe("Campuchia");
    expect(territoryLabelVi("us")).toBe("Mỹ");
  });

  it("maps the literal Others bucket", () => {
    expect(territoryLabelVi("Others")).toBe("Khác");
  });

  it("unknown 2-letter code passes through uppercased, never undefined", () => {
    expect(territoryLabelVi("xz")).toBe("XZ");
  });

  it("unknown long name passes through as-is", () => {
    expect(territoryLabelVi("Atlantis")).toBe("Atlantis");
  });
});
