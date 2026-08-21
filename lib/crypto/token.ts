import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { requireEnv } from "@/lib/env";

/**
 * At-rest encryption for the Display API tokens stored in `channel_oauth`.
 *
 * The ERD originally called for Supabase Vault, but pgsodium's transparent column encryption is
 * deprecated and Vault is meant for configuration secrets rather than per-row data. These tokens
 * are only ever touched by server code holding the service role, so encrypting in the application
 * layer keeps the guarantee without depending on a deprecated extension.
 *
 * Stored format: `v1:<iv>:<authTag>:<ciphertext>`, each part base64. The version prefix exists so a
 * future algorithm change can be detected instead of guessed.
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

function encryptionKey(): Buffer {
  const key = Buffer.from(requireEnv("TOKEN_ENCRYPTION_KEY"), "hex");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must be ${KEY_BYTES} bytes of hex (${KEY_BYTES * 2} characters), got ${key.length} bytes.`,
    );
  }
  return key;
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return [
    VERSION,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptToken(payload: string): string {
  const [version, iv, authTag, ciphertext] = payload.split(":");
  if (version !== VERSION || !iv || !authTag || !ciphertext) {
    throw new Error("Malformed encrypted token payload.");
  }

  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
