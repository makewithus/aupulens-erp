import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  MemoryRateLimitStore,
  checkRateLimit,
  getClientIp,
  resetRateLimitStore,
  setRateLimitStore,
  type RateLimitStore,
} from "@/lib/middleware/rateLimit";

describe("AUP-007: Rate Limiter Store & Enforcement", async () => {
  beforeEach(async () => {
    resetRateLimitStore();
    setRateLimitStore(new MemoryRateLimitStore());
    vi.restoreAllMocks();
  });

  it("extracts sanitized client IP from headers and prevents header injection", async () => {
    const reqWithCf = new Request("http://localhost/api/crm/search", {
      headers: { "cf-connecting-ip": "203.0.113.195" },
    });
    expect(getClientIp(reqWithCf)).toBe("203.0.113.195");

    const reqWithRealIp = new Request("http://localhost/api/crm/search", {
      headers: { "x-real-ip": "198.51.100.42" },
    });
    expect(getClientIp(reqWithRealIp)).toBe("198.51.100.42");

    const reqWithForwarded = new Request("http://localhost/api/crm/search", {
      headers: { "x-forwarded-for": "192.0.2.1, 10.0.0.1" },
    });
    expect(getClientIp(reqWithForwarded)).toBe("192.0.2.1");

    // Injection attempt with command injection characters or invalid delimiters
    const reqWithBadHeader = new Request("http://localhost/api/crm/search", {
      headers: { "x-forwarded-for": "1.2.3.4; DROP TABLE users; --, 10.0.0.1" },
    });
    const sanitized = getClientIp(reqWithBadHeader);
    expect(sanitized).toBe("unknown-ip");
    expect(sanitized).not.toContain(";");
    expect(sanitized).not.toContain(" ");
  });

  it("enforces rate limits within the window and returns 429 when exceeded", async () => {
    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "x-real-ip": "192.0.2.55" },
    });

    // Rule limit for /api/auth/register is 5
    for (let i = 0; i < 5; i++) {
      const res = await checkRateLimit(req, "/api/auth/register");
      expect(res).toBeNull();
    }

    // 6th request must be rejected with 429
    const blockedRes = await checkRateLimit(req, "/api/auth/register");
    expect(blockedRes).not.toBeNull();
    expect(blockedRes?.status).toBe(429);
    expect(blockedRes?.headers.get("Retry-After")).toBeDefined();
    expect(blockedRes?.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("fails closed on sensitive auth routes when rate limit store encounters an error", async () => {
    const brokenStore: RateLimitStore = {
      increment: async () => {
        throw new Error("Redis cluster disconnected");
      },
      reset: async () => {},
    };
    setRateLimitStore(brokenStore);

    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "x-real-ip": "192.0.2.99" },
    });

    // On sensitive auth endpoints, must fail closed (429 / throttled)
    const res = await checkRateLimit(req, "/api/auth/register");
    expect(res).not.toBeNull();
    expect(res?.status).toBe(429);
  });

  it("fails open on non-sensitive read routes when rate limit store encounters an error", async () => {
    const brokenStore: RateLimitStore = {
      increment: async () => {
        throw new Error("Transient cache failure");
      },
      reset: async () => {},
    };
    setRateLimitStore(brokenStore);

    const req = new Request("http://localhost/api/crm/search", {
      method: "GET",
      headers: { "x-real-ip": "192.0.2.99" },
    });

    // On generic read routes, fail open to avoid full site outage
    const res = await checkRateLimit(req, "/api/crm/search");
    expect(res).toBeNull();
  });
});
