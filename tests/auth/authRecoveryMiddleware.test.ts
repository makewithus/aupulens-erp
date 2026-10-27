import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ default: () => ({ auth: (handler: unknown) => handler }) }));
vi.mock("@/lib/middleware/rateLimit", () => ({ checkRateLimit: async () => null }));
vi.mock("@/lib/middleware/moduleGate", () => ({
  applyModuleGating: async () => null, isPathAllowlisted: () => true,
  isSubscriptionBlocked: () => false,
}));
import middleware from "@/middleware";

function request(path: string, user: unknown) {
  const req = new NextRequest(`http://localhost:3000${path}`);
  Object.assign(req, { auth: user ? { user } : null });
  return req;
}
const stale = { id: "u1", role: "admin", tenantId: "acme", sessionStale: true };
const run = (path: string, user: unknown = stale) => (middleware as any)(request(path, user));

describe("authentication recovery middleware", () => {
  it.each(["/api/auth/csrf", "/api/auth/callback/credentials", "/api/auth/session", "/api/auth/signout"])(
    "keeps %s reachable with an old session", async path => {
      const res = await run(path);
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    },
  );
  it.each(["/platform/login", "/platform/login/mfa", "/api/platform/auth/mfa/verify"])(
    "does not let tenant expiry block %s", async path => {
      const res = await run(path);
      expect(res.status).toBe(200);
    },
  );
  it("rejects an old tenant session on protected pages", async () => {
    const res = await run("/sales/invoices/123");
    const url = new URL(res.headers.get("location")!);
    expect(url.pathname).toBe("/auth");
    expect(url.searchParams.get("error")).toBe("SessionExpired");
    expect(url.searchParams.get("callbackUrl")).toBe("/sales/invoices/123");
  });
  it("opens /auth after exiting to the root", async () => {
    const res = await run("/", null);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/auth");
  });
  it("accepts a fresh session after expiry", async () => {
    const res = await run("/sales/summary", { ...stale, sessionStale: false });
    expect(res.status).toBe(200);
  });
});
