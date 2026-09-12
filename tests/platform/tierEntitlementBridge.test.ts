import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_tierbridge";

import Organization from "@/models/admin/Organization";
import Plan from "@/models/platform/Plan";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import { getTierLimits } from "@/lib/constants/tiers";
import { isModuleAccessible } from "@/lib/middleware/moduleGate";
import { ORGANIZATION_TIER } from "@/lib/constants/statuses";

let resolveEntitlements: typeof import("@/lib/platform/entitlements/resolve").resolveEntitlements;
let invalidateEntitlementsCache: typeof import("@/lib/platform/entitlements/resolve").invalidateEntitlementsCache;
let seedPlans: typeof import("@/lib/platform/entitlements/planCatalog").seedPlans;
let moduleIsEnabled: typeof import("@/lib/platform/entitlements/enforce").moduleIsEnabled;

const ALL_MODULES = ["admin", "hr", "inventory", "finance", "sales", "crm", "manufacturing"];

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  await Organization.init();
  await Plan.init();
  await OrganizationEntitlement.init();
  ({ resolveEntitlements, invalidateEntitlementsCache } = await import(
    "@/lib/platform/entitlements/resolve"
  ));
  ({ seedPlans } = await import("@/lib/platform/entitlements/planCatalog"));
  ({ moduleIsEnabled } = await import("@/lib/platform/entitlements/enforce"));
  await seedPlans();
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

afterEach(async () => {
  await Organization.deleteMany({});
  await OrganizationEntitlement.deleteMany({});
  invalidateEntitlementsCache();
});

/**
 * docs/admin/BRIEF-PHASE-9a-ADDENDUM.md Part 1.2: "the bridge must be
 * non-breaking by construction, not by care." These tests are the
 * equivalence proof the addendum asks for — if anyone ever edits
 * planCatalog.ts's STARTER/PRO/ENTERPRISE definitions to drift from
 * lib/constants/tiers.ts again, this file fires, not a silent tenant-access
 * change discovered in production.
 */
describe("getTierLimits(tier) vs resolveEntitlements() — byte-for-byte equivalence for legacy tiers", () => {
  const cases: Array<{ tier: string; label: string }> = [
    { tier: ORGANIZATION_TIER.STARTER, label: "starter" },
    { tier: ORGANIZATION_TIER.PROFESSIONAL, label: "professional" },
    { tier: ORGANIZATION_TIER.ENTERPRISE, label: "enterprise" },
  ];

  it.each(cases)("$label: module set and limits match exactly", async ({ tier }) => {
    const tenantId = `equiv-${tier}`;
    await Organization.create({
      name: "Equivalence Co",
      subdomain: tenantId,
      ownerUserId: new mongoose.Types.ObjectId(),
      tier,
    });

    const legacy = getTierLimits(tier);
    const resolved = await resolveEntitlements(tenantId);

    expect(resolved.source).toBe("tier_fallback"); // no OrganizationEntitlement row exists
    expect(new Set(resolved.modules)).toEqual(new Set(legacy.enabledModules));
    expect(resolved.limits.maxUsers).toBe(legacy.maxUsers);
    expect(resolved.limits.aiRequestsPerMonth).toBe(legacy.aiCallsPerMonth);
  });
});

describe("isModuleAccessible() — the bridge itself: absent resolvedModules reproduces tiers.ts exactly", () => {
  it.each([
    ["starter", "admin", true],
    ["starter", "hr", true],
    ["starter", "inventory", true],
    ["starter", "finance", false],
    ["starter", "sales", false],
    ["starter", "crm", false],
    ["starter", "manufacturing", false],
    ["enterprise", "manufacturing", true],
  ] as const)("%s / %s → %s, with resolvedModules omitted entirely (untouched tenant)", (tier, moduleName, expected) => {
    expect(isModuleAccessible(moduleName, tier, [], undefined)).toBe(expected);
  });

  it("a present resolvedModules list overrides the tier ceiling", () => {
    // Simulates a tenant an admin has deliberately assigned a CUSTOM
    // entitlement to that grants "finance" despite being nominally on the
    // starter tier — proving the bridge actually takes over, not just
    // agrees by coincidence.
    expect(isModuleAccessible("finance", "starter", [], undefined, ["admin", "finance"])).toBe(true);
    expect(isModuleAccessible("hr", "starter", [], undefined, ["admin", "finance"])).toBe(false);
  });

  it("trial bypass still wins over resolvedModules, exactly as it wins over the tier ceiling today", () => {
    expect(isModuleAccessible("finance", "starter", [], "trial", ["admin"])).toBe(true);
  });
});

describe("enforce.ts's moduleIsEnabled() vs moduleGate's isModuleAccessible() — cannot diverge for a legacy tier", () => {
  it.each([
    ["starter", ORGANIZATION_TIER.STARTER],
    ["professional", ORGANIZATION_TIER.PROFESSIONAL],
    ["enterprise", ORGANIZATION_TIER.ENTERPRISE],
  ] as const)("%s: every module agrees between the two enforcement paths", async (label, tier) => {
    const tenantId = `diverge-${label}`;
    await Organization.create({
      name: "Diverge Co",
      subdomain: tenantId,
      ownerUserId: new mongoose.Types.ObjectId(),
      tier,
    });

    for (const moduleName of ALL_MODULES) {
      const viaModuleGate = isModuleAccessible(moduleName, tier, [], undefined, undefined);
      const viaEnforce = await moduleIsEnabled(tenantId, moduleName);
      expect(viaEnforce, `module "${moduleName}" on ${label}`).toBe(viaModuleGate);
    }
  });

  it("regression proof: a STARTER tenant with no entitlement row can use the inventory module via enforce.ts (this was silently broken before the Part 1.1 catalogue fix — the old STARTER plan definition omitted inventory entirely)", async () => {
    const tenantId = "starter-inventory-regression";
    await Organization.create({
      name: "Starter Inventory Co",
      subdomain: tenantId,
      ownerUserId: new mongoose.Types.ObjectId(),
      tier: ORGANIZATION_TIER.STARTER,
    });
    expect(await moduleIsEnabled(tenantId, "inventory")).toBe(true);
    expect(await moduleIsEnabled(tenantId, "finance")).toBe(false);
  });
});
