/**
 * Post-login callbackUrl validation (Part 1.2).
 *
 * A user arriving from /accept-invite should be returned there after signing
 * in, but callbackUrl is attacker-controllable, so only same-origin relative
 * paths may be honoured — everything else must be rejected (open-redirect /
 * phishing protection) so the caller falls back to its default destination.
 */
import { describe, it, expect } from "vitest";
import { safeCallbackUrl } from "@/lib/auth/safeCallbackUrl";

describe("safeCallbackUrl", () => {
  it("accepts a normal internal path", () => {
    expect(safeCallbackUrl("/accept-invite?token=abc")).toBe("/accept-invite?token=abc");
    expect(safeCallbackUrl("/finance/summary")).toBe("/finance/summary");
  });

  it("accepts a URL-encoded internal path (as the invite link passes it)", () => {
    expect(safeCallbackUrl(encodeURIComponent("/accept-invite?token=xyz&email=a@b.com")))
      .toBe("/accept-invite?token=xyz&email=a@b.com");
  });

  it("returns null when there's no callbackUrl (normal login unchanged)", () => {
    expect(safeCallbackUrl(null)).toBeNull();
    expect(safeCallbackUrl(undefined)).toBeNull();
    expect(safeCallbackUrl("")).toBeNull();
  });

  it("rejects absolute URLs (open-redirect vector)", () => {
    expect(safeCallbackUrl("https://evil.com")).toBeNull();
    expect(safeCallbackUrl("http://evil.com/path")).toBeNull();
    expect(safeCallbackUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects protocol-relative and backslash tricks", () => {
    expect(safeCallbackUrl("//evil.com")).toBeNull();
    expect(safeCallbackUrl("/\\evil.com")).toBeNull();
    expect(safeCallbackUrl("/\\\\evil.com")).toBeNull();
  });

  it("rejects a path that doesn't start at the site root", () => {
    expect(safeCallbackUrl("evil.com")).toBeNull();
    expect(safeCallbackUrl("../etc/passwd")).toBeNull();
  });

  it("rejects an encoded absolute URL", () => {
    expect(safeCallbackUrl(encodeURIComponent("https://evil.com"))).toBeNull();
  });
});
