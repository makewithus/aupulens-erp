import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { signPublicToken, verifyPublicToken } from "@/lib/publicLinks";

describe("publicLinks", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "test-encryption-key-for-signing";
  });
  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it("a freshly signed token verifies for the same resource+id", () => {
    const { token, exp } = signPublicToken("invoice", "inv-1");
    expect(verifyPublicToken("invoice", "inv-1", token, exp)).toBe(true);
  });

  it("rejects a token for a different id (can't reuse a link across invoices)", () => {
    const { token, exp } = signPublicToken("invoice", "inv-1");
    expect(verifyPublicToken("invoice", "inv-2", token, exp)).toBe(false);
  });

  it("rejects a token for a different resource type", () => {
    const { token, exp } = signPublicToken("invoice", "inv-1");
    expect(verifyPublicToken("quote", "inv-1", token, exp)).toBe(false);
  });

  it("rejects an expired token", () => {
    const { token } = signPublicToken("invoice", "inv-1");
    const pastExp = Date.now() - 1000;
    expect(verifyPublicToken("invoice", "inv-1", token, pastExp)).toBe(false);
  });

  it("rejects a tampered token", () => {
    const { token, exp } = signPublicToken("invoice", "inv-1");
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    expect(verifyPublicToken("invoice", "inv-1", tampered, exp)).toBe(false);
  });

  it("rejects a token signed with a different key", () => {
    const { token, exp } = signPublicToken("invoice", "inv-1");
    process.env.ENCRYPTION_KEY = "a-different-key";
    expect(verifyPublicToken("invoice", "inv-1", token, exp)).toBe(false);
  });

  it("rejects empty/garbage tokens without throwing", () => {
    expect(verifyPublicToken("invoice", "inv-1", "", Date.now() + 10000)).toBe(false);
    expect(verifyPublicToken("invoice", "inv-1", "garbage", NaN)).toBe(false);
  });
});
