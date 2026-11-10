import { describe, expect, it, vi } from "vitest";
import { ENTITLEMENT_MAX_AGE_MS, claimsAreFresh, resolveEntitlements } from "@/lib/middleware/entitlementFreshness";
import { createOrgTierCache } from "@/lib/middleware/orgTierCache";
import { authConfig } from "@/auth.config";
import { updateTouchesEntitlement, withVersionBump } from "@/lib/platform/entitlements/version";

const org = (over: any = {}) => ({ tier: "professional", enabledModules: [], subscriptionStatus: "active", ...over });
const T0 = 1_700_000_000_000;

describe("G4 — claim freshness", () => {
  it("claims younger than 60 s are used without any server call", async () => {
    const fetchFresh = vi.fn();
    const r = await resolveEntitlements({ orgModuleData: org(), entitlementCheckedAt: T0 }, fetchFresh, T0 + 59_000);
    expect(r).toMatchObject({ kind: "ok", source: "jwt" });
    expect(fetchFresh).not.toHaveBeenCalled();
  });

  it("claims exactly at / older than the bound trigger a server re-read and the SERVER data wins", async () => {
    const fetchFresh = vi.fn(async () => org({ tier: "starter", entitlementVersion: 9 }));
    const r = await resolveEntitlements({ orgModuleData: org(), entitlementVersion: 1, entitlementCheckedAt: T0 }, fetchFresh, T0 + ENTITLEMENT_MAX_AGE_MS + 1);
    expect(fetchFresh).toHaveBeenCalledOnce();
    expect(r).toMatchObject({ kind: "ok", source: "server" });
    expect((r as any).org.tier).toBe("starter");
    expect((r as any).org.entitlementVersion).toBe(9); // version mismatch (1 vs 9) -> fresh data used
  });

  it("legacy token with no entitlement claims at all is re-read from the server", async () => {
    const fetchFresh = vi.fn(async () => org());
    expect((await resolveEntitlements({}, fetchFresh, T0)).kind).toBe("ok");
    expect(fetchFresh).toHaveBeenCalledOnce();
  });

  it("claims without a checkedAt stamp, or with a far-future stamp, are never treated as fresh", () => {
    expect(claimsAreFresh({ orgModuleData: org() }, T0)).toBe(false);
    expect(claimsAreFresh({ orgModuleData: org(), entitlementCheckedAt: T0 + 3_600_000 }, T0)).toBe(false);
    expect(claimsAreFresh({ entitlementCheckedAt: T0 }, T0)).toBe(false);
  });

  it("revalidation service unavailable (null or throwing) => DENY, never fall back to stale claims", async () => {
    const stale = { orgModuleData: org(), entitlementCheckedAt: T0 };
    expect((await resolveEntitlements(stale, async () => null, T0 + 120_000)).kind).toBe("unavailable");
    expect((await resolveEntitlements(stale, async () => { throw new Error("net"); }, T0 + 120_000)).kind).toBe("unavailable");
  });

  it("a deactivated user is revoked at the next revalidation", async () => {
    const r = await resolveEntitlements({}, async () => org({ userActive: false }), T0);
    expect(r).toEqual({ kind: "revoked", reason: "user_inactive" });
  });
});

describe("G4 — org-tier cache never serves stale (no stale-while-revalidate past the bound)", () => {
  it("with staleMs=0 an expired entry is re-fetched, and a failed re-fetch returns null instead of the old value", async () => {
    vi.useFakeTimers();
    try {
      let fail = false;
      const fetcher = vi.fn(async () => { if (fail) throw new Error("x"); return org({ n: Math.random() }) as any; });
      const cache = createOrgTierCache(fetcher, { freshMs: 30_000, staleMs: 0 });
      const a = await cache.get("t|u", "o");
      expect(await cache.get("t|u", "o")).toBe(a); // fresh hit
      expect(fetcher).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(30_001);
      fail = true;
      expect(await cache.get("t|u", "o")).toBeNull(); // old value NOT served
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
});

describe("G4 — token refresh does not extend entitlement freshness", () => {
  it("jwt callback copies claims once at sign-in and leaves checkedAt untouched on every later refresh", async () => {
    const jwt = authConfig.callbacks!.jwt as any;
    const user = { id: "u1", role: "admin", tenantId: "t", permissions: [], orgModuleData: org(), entitlementVersion: 3, entitlementCheckedAt: T0 };
    const issued = await jwt({ token: {}, user });
    expect(issued).toMatchObject({ entitlementVersion: 3, entitlementCheckedAt: T0 });
    const refreshed = await jwt({ token: { ...issued }, user: undefined });
    expect(refreshed.entitlementCheckedAt).toBe(T0); // not re-stamped -> will be treated as stale after 60 s
    expect(refreshed.orgModuleData).toEqual(issued.orgModuleData);
    const session = await (authConfig.callbacks!.session as any)({ session: { user: {} }, token: refreshed });
    expect(session.user).toMatchObject({ entitlementVersion: 3, entitlementCheckedAt: T0 });
  });
});

describe("G4 — version-bump predicate", () => {
  it.each([
    [{ $set: { tier: "starter" } }, true],
    [{ tier: "starter" }, true],
    [{ $set: { subscriptionStatus: "suspended" } }, true],
    [{ $set: { trialEndDate: new Date() } }, true],
    [{ $set: { "settings.enabledModules": ["hr"] } }, true],
    [{ $set: { isActive: false } }, true],
    [{ $unset: { trialEndDate: 1 } }, true],
    [{ $set: { name: "x" } }, false],
    [{ $set: { "settings.theme": "dark" } }, false],
    [{ $inc: { entitlementVersion: 1 } }, false],
  ])("%j -> %s", (u, expected) => expect(updateTouchesEntitlement(u)).toBe(expected));

  it("withVersionBump merges into an existing $inc", () => {
    expect(withVersionBump({ $set: { tier: "x" }, $inc: { aiCallsUsed: 2 } })).toMatchObject({ $inc: { aiCallsUsed: 2, entitlementVersion: 1 } });
  });
});
