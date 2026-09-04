import { afterEach, describe, expect, it } from "vitest";

import { isDemoAccount, type AppUser } from "./auth";

const BASE: AppUser = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "review@creator.internal",
  username: "tiktok_review",
  name: "TikTok Review",
  role: "creator",
};

const original = process.env.DEMO_CREATOR_USERNAME;

afterEach(() => {
  if (original === undefined) delete process.env.DEMO_CREATOR_USERNAME;
  else process.env.DEMO_CREATOR_USERNAME = original;
});

describe("isDemoAccount", () => {
  it("is false for everyone when the env var is unset — the normal state of production", () => {
    delete process.env.DEMO_CREATOR_USERNAME;
    expect(isDemoAccount(BASE)).toBe(false);
  });

  it("is false when the env var is set but empty, not 'matches every username'", () => {
    process.env.DEMO_CREATOR_USERNAME = "";
    expect(isDemoAccount(BASE)).toBe(false);
    expect(isDemoAccount({ ...BASE, username: "" })).toBe(false);
  });

  it("matches the named account", () => {
    process.env.DEMO_CREATOR_USERNAME = "tiktok_review";
    expect(isDemoAccount(BASE)).toBe(true);
  });

  it("ignores case and surrounding whitespace in the env value", () => {
    process.env.DEMO_CREATOR_USERNAME = "  TikTok_Review  ";
    expect(isDemoAccount(BASE)).toBe(true);
  });

  it("leaves other accounts alone, including the real Manager", () => {
    process.env.DEMO_CREATOR_USERNAME = "tiktok_review";
    expect(isDemoAccount({ ...BASE, username: "andang", role: "manager" })).toBe(false);
    expect(isDemoAccount({ ...BASE, username: "tiktok_review2" })).toBe(false);
  });
});
