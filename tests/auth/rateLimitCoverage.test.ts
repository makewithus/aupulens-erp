import { describe, it, expect } from "vitest";
import { checkRateLimit } from "@/lib/middleware/rateLimit";

describe("AUP-007: Rate Limiting Coverage for Auth Endpoints", async () => {
  it("enforces rate limits on /api/auth/register", async () => {
    const makeReq = () =>
      new Request("http://localhost:3000/api/auth/register", {
        headers: { "x-forwarded-for": "198.51.100.1" },
      });

    // Limit is 5 requests per minute
    for (let i = 0; i < 5; i++) {
      const res = await checkRateLimit(makeReq(), "/api/auth/register");
      expect(res).toBeNull(); // Allowed
    }

    // 6th request should be rate-limited
    const blockedRes = await checkRateLimit(makeReq(), "/api/auth/register");
    expect(blockedRes).not.toBeNull();
    expect(blockedRes?.status).toBe(429);
    expect(blockedRes?.headers.get("Retry-After")).toBeDefined();
  });

  it("enforces rate limits on /api/auth/password-reset/request", async () => {
    const makeReq = () =>
      new Request("http://localhost:3000/api/auth/password-reset/request", {
        headers: { "x-forwarded-for": "198.51.100.2" },
      });

    // Limit is 5 requests per minute
    for (let i = 0; i < 5; i++) {
      const res = await checkRateLimit(makeReq(), "/api/auth/password-reset/request");
      expect(res).toBeNull(); // Allowed
    }

    // 6th request should be rate-limited
    const blockedRes = await checkRateLimit(makeReq(), "/api/auth/password-reset/request");
    expect(blockedRes).not.toBeNull();
    expect(blockedRes?.status).toBe(429);
  });
});
