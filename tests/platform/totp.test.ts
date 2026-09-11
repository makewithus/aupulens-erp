import { describe, expect, it } from "vitest";
import {
  generateBackupCodes,
  generateTotpCode,
  generateTotpSecret,
  totpOtpauthUrl,
  verifyTotpCode,
} from "@/lib/platform/auth/totp";

describe("TOTP (RFC 6238)", () => {
  it("generates a base32 secret and a matching current code that verifies", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    const code = generateTotpCode(secret);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  it("rejects a code generated from a different secret", () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const codeFromB = generateTotpCode(secretB);
    expect(verifyTotpCode(secretA, codeFromB)).toBe(false);
  });

  it("rejects malformed input without throwing", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "abc123")).toBe(false);
    expect(verifyTotpCode(secret, "12")).toBe(false);
    expect(verifyTotpCode(secret, "")).toBe(false);
  });

  it("tolerates one 30s step of clock drift either direction", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const prevStepCode = generateTotpCode(secret, now - 30_000);
    const nextStepCode = generateTotpCode(secret, now + 30_000);
    expect(verifyTotpCode(secret, prevStepCode, now)).toBe(true);
    expect(verifyTotpCode(secret, nextStepCode, now)).toBe(true);
  });

  it("rejects a code from two steps away", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const farCode = generateTotpCode(secret, now + 90_000);
    expect(verifyTotpCode(secret, farCode, now)).toBe(false);
  });

  it("builds a valid otpauth:// URL", () => {
    const secret = generateTotpSecret();
    const url = totpOtpauthUrl(secret, "admin@aupulens.com");
    expect(url).toContain("otpauth://totp/");
    expect(url).toContain(`secret=${secret}`);
    expect(url).toContain("issuer=");
  });

  it("generates unique backup codes", () => {
    const codes = generateBackupCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
  });
});
