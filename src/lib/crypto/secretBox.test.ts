import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// "server-only" is a Next.js guard that throws outside a React Server
// Components bundle; stub it so the module can be unit-tested in Node.
vi.mock("server-only", () => ({}));

import { decryptSecret, encryptSecret, isSecretBoxConfigured, SecretBoxError } from "./secretBox";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("secretBox", () => {
  beforeEach(() => {
    process.env.CONNECTOR_SECRET_KEY = KEY;
  });
  afterEach(() => {
    delete process.env.CONNECTOR_SECRET_KEY;
  });

  it("round-trips a secret and never stores it in the clear", () => {
    const box = encryptSecret("super-secret-token");
    expect(box.startsWith("v1:")).toBe(true);
    expect(box).not.toContain("super-secret-token");
    expect(decryptSecret(box)).toBe("super-secret-token");
  });

  it("uses a fresh IV per encryption", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });

  it("rejects tampered ciphertext", () => {
    const box = encryptSecret("abc");
    const parts = box.split(":");
    parts[2] = Buffer.from("zzzz").toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow(SecretBoxError);
  });

  it("fails loudly when the key is missing or malformed", () => {
    delete process.env.CONNECTOR_SECRET_KEY;
    expect(isSecretBoxConfigured()).toBe(false);
    expect(() => encryptSecret("x")).toThrow(/CONNECTOR_SECRET_KEY/);
    process.env.CONNECTOR_SECRET_KEY = "tooshort";
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
  });
});
