import { beforeAll, describe, expect, it } from "vitest";

import { decryptToken, encryptToken } from "./token";

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
});

describe("token encryption", () => {
  it("round-trips a token", () => {
    const token = "act.example-refresh-token-0123456789";
    expect(decryptToken(encryptToken(token))).toBe(token);
  });

  it("produces a different ciphertext each time", () => {
    const token = "act.example-refresh-token-0123456789";
    // A fresh IV per call: two channels holding the same token must not look identical in the
    // database, and neither must two consecutive refreshes of one channel.
    expect(encryptToken(token)).not.toBe(encryptToken(token));
  });

  it("rejects a tampered ciphertext", () => {
    const payload = encryptToken("act.example");
    const [version, iv, tag, ciphertext] = payload.split(":");
    const flipped = Buffer.from(ciphertext, "base64");
    flipped[0] ^= 0xff;

    expect(() =>
      decryptToken([version, iv, tag, flipped.toString("base64")].join(":")),
    ).toThrow();
  });

  it("rejects a malformed payload", () => {
    expect(() => decryptToken("not-a-payload")).toThrow(/Malformed/);
  });

  it("rejects a key that is not 32 bytes", () => {
    const original = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = "abcd";
    expect(() => encryptToken("act.example")).toThrow(/32 bytes/);
    process.env.TOKEN_ENCRYPTION_KEY = original;
  });
});
