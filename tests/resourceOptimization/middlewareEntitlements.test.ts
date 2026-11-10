import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("next-auth", () => ({ default: () => ({ auth: (handler: unknown) => handler }) }));
vi.mock("@/auth.config", () => ({ authConfig: {} }));
vi.mock("@/lib/middleware/orgTierCache", () => ({ createOrgTierCache: () => ({ get: getMock }) }));
import middleware from "@/middleware";

const ACTIVE = { tier: "enterprise", enabledModules: [] as string[], subscriptionStatus: "active", userActive: true };
type U = Record<string, unknown>;

async function call(path: string, user: U | null) {
  const req = new NextRequest(`https://localhost${path}`, { headers: { accept: "application/json" } });
  Object.assign(req, { auth: user ? { user: { id: "u1", tenantId: "t1", role: "admin", ...user } } : null });
  return (await middleware(req as never, {} as never)) as Response;
}
const claims = (ageMs: number, org: U = ACTIVE) => ({ orgModuleData: org, entitlementVersion: 1, entitlementCheckedAt: Date.now() - ageMs });

beforeEach(() => getMock.mockReset());

describe("G4 — middleware enforces entitlement freshness", () => {
  it("claims younger than 60 s are used with NO server lookup", async () => {
    const res = await call("/api/finance/invoices", claims(10_000));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(getMock).not.toHaveBeenCalled();
  });

  it("claims older than 60 s trigger a server lookup, and the server's answer (suspended) wins over the token", async () => {
    getMock.mockResolvedValue({ ...ACTIVE, subscriptionStatus: "suspended" });
    const res = await call("/api/finance/invoices", claims(61_000));
    expect(getMock).toHaveBeenCalledOnce();
    expect(getMock.mock.calls[0][0]).toBe("t1|u1"); // keyed by tenant AND user so user revocation is seen
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("SUBSCRIPTION_INACTIVE");
  });

  it("a stale token for a downgraded tenant loses the module without re-login", async () => {
    getMock.mockResolvedValue({ tier: "starter", enabledModules: [], subscriptionStatus: "active", userActive: true });
    const res = await call("/api/finance/invoices", claims(120_000, { ...ACTIVE }));
    expect(res.status).toBe(403);
  });

  it("legacy token with no entitlement claims is checked against the server", async () => {
    getMock.mockResolvedValue(ACTIVE);
    const res = await call("/api/finance/invoices", {});
    expect(getMock).toHaveBeenCalledOnce();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("entitlement service unavailable => DENY with 503 (never fail open, never trust stale claims)", async () => {
    getMock.mockResolvedValue(null);
    for (const user of [{}, claims(300_000)]) {
      const res = await call("/api/finance/invoices", user);
      expect(res.status).toBe(503);
      expect((await res.json()).code).toBe("ENTITLEMENT_UNAVAILABLE");
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  it("a deactivated user is revoked (401, API) at the next revalidation", async () => {
    getMock.mockResolvedValue({ ...ACTIVE, userActive: false });
    const res = await call("/api/finance/invoices", claims(90_000));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("USER_REVOKED");
  });

  it("a deactivated user opening a page is redirected to sign-in", async () => {
    getMock.mockResolvedValue({ ...ACTIVE, userActive: false });
    const res = await call("/finance/dashboard", claims(90_000));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://localhost/auth");
  });

  it("an organisation that has been deactivated is blocked", async () => {
    getMock.mockResolvedValue({ ...ACTIVE, isActive: false });
    expect((await call("/api/finance/invoices", claims(90_000))).status).toBe(402);
  });

  it("allow-listed paths (e.g. session/sign-out) still work while entitlements are unavailable", async () => {
    getMock.mockResolvedValue(null);
    const res = await call("/api/auth/session", claims(300_000));
    expect(res.status).not.toBe(503);
  });
});

describe("scheduler endpoints reach their own Bearer check without a browser session", () => {
  it.each(["/api/platform/scheduler/run-due", "/api/platform/scheduler/health"])("%s is not blocked by the admin-session gate", async (path) => {
    const res = await call(path, null);
    expect(res.headers.get("x-middleware-next")).toBe("1"); // handled by the route (CRON_SECRET), not rejected here
  });

  it("other platform APIs still require an admin session", async () => {
    const res = await call("/api/platform/scheduler/jobs", null);
    expect(res.status).toBe(401);
  });
});
