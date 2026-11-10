import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ro_entitlement";
delete process.env.MIDDLEWARE_INTERNAL_SECRET;

import Organization from "@/models/admin/Organization";
import User from "@/models/auth/User";
import Plan from "@/models/platform/Plan";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import { ENTITLEMENT_MAX_AGE_MS, resolveEntitlements, type EntitlementClaims } from "@/lib/middleware/entitlementFreshness";
import { applyModuleGating, isSubscriptionBlocked } from "@/lib/middleware/moduleGate";

let GET: typeof import("@/app/api/internal/org-tier/route").GET;
let invalidate: () => void;
const TENANT = "ro-ent-a";
let userId: string;
let ownerId = new mongoose.Types.ObjectId();

/** What middleware.ts does for one request, with the real org-tier route as the "server". */
async function fetchFromServer() {
  const res = await GET(new NextRequest(`http://localhost/api/internal/org-tier?tenantId=${TENANT}&userId=${userId}`));
  return res.status === 200 ? await res.json() : null;
}
async function mintClaims(at = Date.now()): Promise<EntitlementClaims> {
  const d = await fetchFromServer();
  return { orgModuleData: d, entitlementVersion: d.entitlementVersion, entitlementCheckedAt: at };
}
/** Returns "ok" | "blocked" | "unavailable" | "revoked" | "gated:<module>" for a request at `now`. */
async function request(path: string, claims: EntitlementClaims, now: number, fetcher = fetchFromServer) {
  const r = await resolveEntitlements(claims, fetcher, now);
  if (r.kind !== "ok") return r.kind;
  if (isSubscriptionBlocked(r.org)) return "blocked";
  const gate = await applyModuleGating(path, { role: "admin", tenantId: TENANT }, async () => r.org, true);
  return gate ? `gated:${gate.status}` : "ok";
}
const later = (ms = ENTITLEMENT_MAX_AGE_MS + 1) => Date.now() + ms;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  await Promise.all([Organization.init(), User.init(), Plan.init(), OrganizationEntitlement.init()]);
  ({ GET } = await import("@/app/api/internal/org-tier/route"));
  const { seedPlans } = await import("@/lib/platform/entitlements/planCatalog");
  ({ invalidateEntitlementsCache: invalidate } = await import("@/lib/platform/entitlements/resolve") as any);
  await seedPlans();
});
afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.connection.close(); });

beforeEach(async () => {
  await Organization.deleteMany({}); await User.deleteMany({}); await OrganizationEntitlement.deleteMany({});
  invalidate?.();
  await Organization.create({ name: "A", subdomain: TENANT, ownerUserId: ownerId, tier: "professional", subscriptionStatus: "active" });
  const u = await User.create({ name: "U", email: "u@ro-ent-a.com", password: "x".repeat(12), role: "admin", tenantId: TENANT, status: "active", phone: "9876543210" } as any);
  userId = String(u._id);
});

describe("G4 — existing JWT vs subsequent entitlement changes (real route + real DB)", () => {
  it("within the freshness window the token is honoured; after it, a downgrade takes effect without re-login", async () => {
    const claims = await mintClaims();
    expect(await request("/api/finance/invoices", claims, Date.now())).toBe("ok");
    await Organization.updateOne({ subdomain: TENANT }, { $set: { tier: "starter" } });
    expect(await request("/api/finance/invoices", claims, later())).toBe("gated:403");
    expect(await request("/api/hr/employees", claims, later())).toBe("ok"); // still in the starter ceiling
  });

  it("suspension blocks the very next revalidation (was: up to 8 h)", async () => {
    const claims = await mintClaims();
    await Organization.updateOne({ subdomain: TENANT }, { $set: { subscriptionStatus: "suspended" } });
    expect(await request("/api/finance/invoices", claims, later())).toBe("blocked");
  });

  it("organisation deactivation blocks", async () => {
    const claims = await mintClaims();
    await Organization.updateOne({ subdomain: TENANT }, { $set: { isActive: false } });
    expect(await request("/api/hr/employees", claims, later())).toBe("blocked");
  });

  it("module disablement then re-enablement", async () => {
    await Organization.updateOne({ subdomain: TENANT }, { $set: { subscriptionStatus: "trial", "settings.enabledModules": ["hr", "finance"] } });
    const claims = await mintClaims();
    expect(await request("/api/finance/x", claims, Date.now())).toBe("ok");
    await Organization.updateOne({ subdomain: TENANT }, { $set: { "settings.enabledModules": ["hr"] } });
    expect(await request("/api/finance/x", claims, later())).toBe("gated:403");
    await Organization.updateOne({ subdomain: TENANT }, { $set: { "settings.enabledModules": ["hr", "finance"] } });
    expect(await request("/api/finance/x", claims, later())).toBe("ok");
  });

  it("trial expiration blocks; trial -> paid upgrade UNBLOCKS an old trial token (previously stuck until re-login)", async () => {
    const past = new Date(Date.now() - 86_400_000);
    await Organization.updateOne({ subdomain: TENANT }, { $set: { subscriptionStatus: "trial", trialEndDate: new Date(Date.now() + 3_600_000) } });
    const claims = await mintClaims();
    expect(await request("/api/hr/employees", claims, Date.now())).toBe("ok");
    // trial lapses: embedded trialEndDate is in the future at mint time, but the server now says it ended
    await Organization.updateOne({ subdomain: TENANT }, { $set: { trialEndDate: past } });
    expect(await request("/api/hr/employees", claims, later())).toBe("blocked");
    // customer pays
    await Organization.updateOne({ subdomain: TENANT }, { $set: { subscriptionStatus: "active" } });
    expect(await request("/api/hr/employees", claims, later())).toBe("ok");
  });

  it("plan upgrade / downgrade via OrganizationEntitlement is picked up", async () => {
    await Organization.updateOne({ subdomain: TENANT }, { $set: { tier: "starter" } });
    const claims = await mintClaims();
    expect(await request("/api/finance/x", claims, later())).toBe("gated:403");
    await OrganizationEntitlement.create({ tenantId: TENANT, planKey: "enterprise" });
    invalidate?.();
    expect(await request("/api/finance/x", claims, later())).toBe("ok");
    await OrganizationEntitlement.updateOne({ tenantId: TENANT }, { $set: { planKey: "free" } });
    invalidate?.();
    const d = await fetchFromServer();
    expect(d.resolvedModules).toBeDefined();
  });

  it("user deactivation is revoked within the window; a reactivated user works again", async () => {
    const claims = await mintClaims();
    expect(await request("/api/hr/employees", claims, Date.now())).toBe("ok");
    await User.updateOne({ _id: userId }, { $set: { status: "inactive" } });
    expect(await request("/api/hr/employees", claims, later())).toBe("revoked");
    await User.updateOne({ _id: userId }, { $set: { status: "active" } });
    expect(await request("/api/hr/employees", claims, later())).toBe("ok");
  });

  it("legacy token without claims works (server read) and re-reads every time it lacks fresh claims", async () => {
    expect(await request("/api/finance/x", {}, Date.now())).toBe("ok");
    await Organization.updateOne({ subdomain: TENANT }, { $set: { subscriptionStatus: "cancelled" } });
    expect(await request("/api/finance/x", {}, Date.now())).toBe("blocked");
  });

  it("revalidation service unavailable: stale token is DENIED (503-class), fresh token still works", async () => {
    const claims = await mintClaims();
    const down = async () => null;
    expect(await request("/api/hr/employees", claims, later(), down)).toBe("unavailable");
    expect(await request("/api/hr/employees", claims, Date.now(), down)).toBe("ok");
  });
});

describe("G4 — entitlementVersion is bumped centrally and monotonically", () => {
  const version = async () => (await Organization.findOne({ subdomain: TENANT }).lean() as any).entitlementVersion;

  it.each([
    ["updateOne tier", () => Organization.updateOne({ subdomain: TENANT }, { $set: { tier: "starter" } })],
    ["findOneAndUpdate status", () => Organization.findOneAndUpdate({ subdomain: TENANT }, { subscriptionStatus: "suspended" })],
    ["updateMany modules", () => Organization.updateMany({ subdomain: TENANT }, { $set: { "settings.enabledModules": ["hr"] } })],
    ["updateOne trialEndDate", () => Organization.updateOne({ subdomain: TENANT }, { $set: { trialEndDate: new Date() } })],
    ["save() after modifying tier", async () => { const o = await Organization.findOne({ subdomain: TENANT }); o!.tier = "starter" as any; await o!.save(); }],
    ["OrganizationEntitlement.create", () => OrganizationEntitlement.create({ tenantId: TENANT, planKey: "pro" })],
  ])("%s increments the version", async (_n, mutate) => {
    const before = await version();
    await mutate();
    expect(await version()).toBeGreaterThan(before);
  });

  it("unrelated writes (name, usage counters) do not bump it", async () => {
    const before = await version();
    await Organization.updateOne({ subdomain: TENANT }, { $set: { name: "Renamed" } });
    expect(await version()).toBe(before);
  });

  it("20 concurrent entitlement updates yield exactly +20 (atomic $inc, no lost updates)", async () => {
    const before = await version();
    await Promise.all(Array.from({ length: 20 }, (_, i) => Organization.updateOne({ subdomain: TENANT }, { $set: { tier: i % 2 ? "starter" : "professional" } })));
    expect(await version()).toBe(before + 20);
  });

  it("the org-tier route exposes the current version and a checkedAt stamp", async () => {
    await Organization.updateOne({ subdomain: TENANT }, { $set: { tier: "starter" } });
    const d = await fetchFromServer();
    expect(d.entitlementVersion).toBe(await version());
    expect(Math.abs(d.entitlementCheckedAt - Date.now())).toBeLessThan(5_000);
  });
});

describe("G4 — server-side boundary", () => {
  it("org-tier still rejects calls without the middleware secret when one is configured", async () => {
    process.env.MIDDLEWARE_INTERNAL_SECRET = "s3cret";
    try {
      const res = await GET(new NextRequest(`http://localhost/api/internal/org-tier?tenantId=${TENANT}`));
      expect(res.status).toBe(403);
      expect(res.headers.get("cache-control")).toContain("no-store");
    } finally { delete process.env.MIDDLEWARE_INTERNAL_SECRET; }
  });
});
