import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_entitlements";

import Organization from "@/models/admin/Organization";
import Plan from "@/models/platform/Plan";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import { ORGANIZATION_TIER, PLAN_KEY, SUPPORT_LEVEL } from "@/lib/constants/statuses";

let resolveEntitlements: typeof import("@/lib/platform/entitlements/resolve").resolveEntitlements;
let invalidateEntitlementsCache: typeof import("@/lib/platform/entitlements/resolve").invalidateEntitlementsCache;

const STARTER_FEATURES = {
  modules: ["admin", "finance"],
  maxUsers: 5,
  maxCompanies: 1,
  storageGb: 5,
  apiRequestsPerMonth: 1000,
  aiCreditsPerMonth: 100,
  aiRequestsPerMonth: 100,
  automationRunsPerMonth: 20,
  documentLimitPerMonth: 100,
  supportLevel: SUPPORT_LEVEL.EMAIL,
  featureFlags: { betaReports: false },
};

describe("resolveEntitlements — the single source of truth for what a tenant gets", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Organization.init();
    await Plan.init();
    await OrganizationEntitlement.init();
    await PlatformAuditLog.init();
    ({ resolveEntitlements, invalidateEntitlementsCache } = await import(
      "@/lib/platform/entitlements/resolve"
    ));
    await Plan.create({
      key: PLAN_KEY.STARTER,
      name: "Starter",
      priceMonthly: 999,
      priceYearly: 9990,
      billingCycleOptions: ["monthly"],
      features: STARTER_FEATURES,
    });
    await Plan.create({
      key: PLAN_KEY.PRO,
      name: "Pro",
      priceMonthly: 7999,
      priceYearly: 79990,
      billingCycleOptions: ["monthly"],
      features: { ...STARTER_FEATURES, maxUsers: 50, modules: ["admin", "finance", "sales", "hr"] },
    });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Organization.deleteMany({});
    await OrganizationEntitlement.deleteMany({});
    await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
    invalidateEntitlementsCache();
  });

  it("resolves the assigned plan when an OrganizationEntitlement exists", async () => {
    await Organization.create({ name: "Org", subdomain: "org-a", ownerUserId: new mongoose.Types.ObjectId() });
    await OrganizationEntitlement.create({ tenantId: "org-a", planKey: PLAN_KEY.PRO });

    const result = await resolveEntitlements("org-a");
    expect(result.planKey).toBe(PLAN_KEY.PRO);
    expect(result.limits.maxUsers).toBe(50);
    expect(result.modules).toEqual(["admin", "finance", "sales", "hr"]);
    expect(result.source).toBe("assigned");
  });

  it("bridges the pre-existing Organization.tier to a plan key when no entitlement row exists", async () => {
    await Organization.create({
      name: "Legacy Org",
      subdomain: "legacy-org",
      ownerUserId: new mongoose.Types.ObjectId(),
      tier: ORGANIZATION_TIER.PROFESSIONAL,
    });

    const result = await resolveEntitlements("legacy-org");
    expect(result.planKey).toBe(PLAN_KEY.PRO); // documented bridge mapping
    expect(result.source).toBe("tier_fallback");
  });

  it("layers overrides on top of the base plan without duplicating the whole plan (§11)", async () => {
    await Organization.create({ name: "Custom Org", subdomain: "custom-org", ownerUserId: new mongoose.Types.ObjectId() });
    await OrganizationEntitlement.create({
      tenantId: "custom-org",
      planKey: PLAN_KEY.STARTER,
      overrides: { maxUsers: 999, featureFlags: { betaReports: true } },
    });

    const result = await resolveEntitlements("custom-org");
    expect(result.limits.maxUsers).toBe(999); // overridden
    expect(result.limits.aiCreditsPerMonth).toBe(100); // NOT overridden — still the base plan's value
    expect(result.featureFlags.betaReports).toBe(true);
    expect(result.modules).toEqual(STARTER_FEATURES.modules); // unchanged base
  });

  it("changing the base plan's own feature changes what a custom-override tenant resolves to for the untouched fields", async () => {
    await Organization.create({ name: "Custom Org", subdomain: "custom-org", ownerUserId: new mongoose.Types.ObjectId() });
    await OrganizationEntitlement.create({
      tenantId: "custom-org",
      planKey: PLAN_KEY.STARTER,
      overrides: { maxUsers: 999 },
    });

    await Plan.updateOne({ key: PLAN_KEY.STARTER }, { $set: { "features.aiCreditsPerMonth": 250 } });
    invalidateEntitlementsCache("custom-org");

    const result = await resolveEntitlements("custom-org");
    expect(result.limits.aiCreditsPerMonth).toBe(250); // picked up the base plan's new value
    expect(result.limits.maxUsers).toBe(999); // override still holds
  });

  it("defaults to permissive (never a lockout) and audits at SECURITY severity when the resolver errors", async () => {
    await Organization.create({ name: "Broken Org", subdomain: "broken-org", ownerUserId: new mongoose.Types.ObjectId() });
    // No Plan document for whatever key the tier bridges to is impossible here
    // (STARTER/PRO both seeded) — force a real error path instead: corrupt the
    // stored entitlement's planKey to one with no matching Plan document.
    await OrganizationEntitlement.create({ tenantId: "broken-org", planKey: PLAN_KEY.ENTERPRISE });

    const result = await resolveEntitlements("broken-org");
    expect(result.source).toBe("permissive_default");
    expect(result.modules.length).toBeGreaterThan(0); // permissive, not empty/lockout

    const logs = await PlatformAuditLog.find({ tenantId: "broken-org" });
    expect(logs).toHaveLength(1);
    expect(logs[0].severity).toBe("security");
  });

  it("caches the result for repeat calls within the TTL (one DB round trip)", async () => {
    await Organization.create({ name: "Org", subdomain: "cached-org", ownerUserId: new mongoose.Types.ObjectId() });
    await OrganizationEntitlement.create({ tenantId: "cached-org", planKey: PLAN_KEY.STARTER });

    const findOneSpy = vi.spyOn(OrganizationEntitlement, "findOne");
    await resolveEntitlements("cached-org");
    const callsAfterFirst = findOneSpy.mock.calls.length;
    await resolveEntitlements("cached-org");
    expect(findOneSpy.mock.calls.length).toBe(callsAfterFirst); // no new DB call
    findOneSpy.mockRestore();
  });
});
