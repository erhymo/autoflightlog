import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM "secret box" for API keys/tokens at rest. The key lives only
 * in the CONNECTOR_SECRET_KEY environment variable (32 random bytes,
 * base64), so a Firestore dump alone can't reveal any employer credential.
 *
 * Generate a key with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Box format: "v1:<iv b64>:<ciphertext b64>:<auth tag b64>".
 */

const VERSION = "v1";

export class SecretBoxError extends Error {}

function getKey(): Buffer {
  const raw = process.env.CONNECTOR_SECRET_KEY;
  if (!raw) {
    throw new SecretBoxError(
      "CONNECTOR_SECRET_KEY is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\" and add it to .env.local / Vercel."
    );
  }
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) {
    throw new SecretBoxError("CONNECTOR_SECRET_KEY must be 32 bytes, base64-encoded.");
  }
  return key;
}

export function isSecretBoxConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), ciphertext.toString("base64"), tag.toString("base64")].join(":");
}

export function decryptSecret(box: string): string {
  const key = getKey();
  const parts = box.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new SecretBoxError("Stored secret has an unknown format.");
  }
  const [, ivB64, ctB64, tagB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretBoxError("Stored secret could not be decrypted - was CONNECTOR_SECRET_KEY rotated?");
  }
}
