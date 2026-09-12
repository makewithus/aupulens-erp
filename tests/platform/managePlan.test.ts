import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_manageplan";

import Organization from "@/models/admin/Organization";
import Plan from "@/models/platform/Plan";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import AdminRole from "@/models/platform/AdminRole";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import { ADMIN_CAPABILITY, ADMIN_ROLE, PLAN_KEY, ORGANIZATION_TIER, SUPPORT_LEVEL } from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";

let updatePlan: typeof import("@/lib/platform/entitlements/managePlan").updatePlan;
let getPlanImpactCount: typeof import("@/lib/platform/entitlements/managePlan").getPlanImpactCount;
let ManagePlanError: typeof import("@/lib/platform/entitlements/managePlan").ManagePlanError;
let invalidateAdminRoleCache: typeof import("@/lib/platform/auth/adminRbac").invalidateAdminRoleCache;

function makeActor(role: string = ADMIN_ROLE.GLOBAL_ADMIN): AdminActor {
  return {
    id: new mongoose.Types.ObjectId().toString(),
    email: "actor@example.com",
    name: "Actor",
    role: role as AdminActor["role"],
    sessionId: "test-session",
  };
}

const FEATURES = {
  modules: ["admin", "hr", "inventory"],
  maxUsers: 5,
  maxCompanies: 1,
  storageGb: 5,
  apiRequestsPerMonth: 1000,
  aiCreditsPerMonth: 100,
  aiRequestsPerMonth: 100,
  automationRunsPerMonth: 20,
  documentLimitPerMonth: 100,
  supportLevel: SUPPORT_LEVEL.EMAIL,
  featureFlags: {},
};

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  await Organization.init();
  await Plan.init();
  await OrganizationEntitlement.init();
  await AdminRole.init();
  await PlatformAuditLog.init();
  ({ updatePlan, getPlanImpactCount, ManagePlanError } = await import(
    "@/lib/platform/entitlements/managePlan"
  ));
  ({ invalidateAdminRoleCache } = await import("@/lib/platform/auth/adminRbac"));
  await AdminRole.create({
    role: ADMIN_ROLE.GLOBAL_ADMIN,
    capabilities: [ADMIN_CAPABILITY.MANAGE_PLANS],
    description: "",
  });
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

afterEach(async () => {
  await Organization.deleteMany({});
  await Plan.deleteMany({});
  await OrganizationEntitlement.deleteMany({});
  await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
});

describe("updatePlan — a privileged, multi-tenant-impact action", () => {
  it("edits price and features, records a before/after audit entry, requires a reason", async () => {
    await Plan.create({ key: PLAN_KEY.PRO, name: "Pro", priceMonthly: 100, features: FEATURES });
    const actor = makeActor();

    await updatePlan(
      actor,
      PLAN_KEY.PRO,
      { priceMonthly: 150, features: { maxUsers: 10 } },
      "market repricing",
    );

    const plan = await Plan.findOne({ key: PLAN_KEY.PRO });
    expect(plan!.priceMonthly).toBe(150);
    expect(plan!.features.maxUsers).toBe(10);
    expect(plan!.features.modules).toEqual(FEATURES.modules); // untouched fields survive a partial features edit

    const audits = await PlatformAuditLog.find({ entityId: PLAN_KEY.PRO });
    expect(audits).toHaveLength(1);
    expect(audits[0].eventType).toBe("plan_updated");
    expect((audits[0].oldValue as any).priceMonthly).toBe(100);
    expect((audits[0].newValue as any).priceMonthly).toBe(150);
    expect(audits[0].metadata?.reason).toBe("market repricing");
  });

  it("rejects an edit with no reason and changes nothing", async () => {
    await Plan.create({ key: PLAN_KEY.PRO, name: "Pro", priceMonthly: 100, features: FEATURES });
    await expect(
      updatePlan(makeActor(), PLAN_KEY.PRO, { priceMonthly: 999 }, ""),
    ).rejects.toThrow(ManagePlanError);
    expect((await Plan.findOne({ key: PLAN_KEY.PRO }))!.priceMonthly).toBe(100);
  });

  it("rejects an edit to a nonexistent plan key", async () => {
    await expect(
      updatePlan(makeActor(), PLAN_KEY.PRO, { priceMonthly: 999 }, "test"),
    ).rejects.toThrow(ManagePlanError);
  });

  it("denies an actor without MANAGE_PLANS and changes nothing (proves the corrected §30 matrix is live: GLOBAL_ADMIN without MANAGE_PLANS seeded here behaves as denied)", async () => {
    await AdminRole.create({ role: ADMIN_ROLE.READ_ONLY_ADMIN, capabilities: [], description: "" });
    invalidateAdminRoleCache();
    await Plan.create({ key: PLAN_KEY.PRO, name: "Pro", priceMonthly: 100, features: FEATURES });

    await expect(
      updatePlan(makeActor(ADMIN_ROLE.READ_ONLY_ADMIN), PLAN_KEY.PRO, { priceMonthly: 999 }, "test"),
    ).rejects.toThrow();
    expect((await Plan.findOne({ key: PLAN_KEY.PRO }))!.priceMonthly).toBe(100);
  });
});

describe("getPlanImpactCount — 'how many organisations are on this plan' before an admin saves", () => {
  it("counts explicit OrganizationEntitlement assignments", async () => {
    await Organization.create({ name: "A", subdomain: "org-a", ownerUserId: new mongoose.Types.ObjectId() });
    await Organization.create({ name: "B", subdomain: "org-b", ownerUserId: new mongoose.Types.ObjectId() });
    await OrganizationEntitlement.create({ tenantId: "org-a", planKey: PLAN_KEY.PRO });
    await OrganizationEntitlement.create({ tenantId: "org-b", planKey: PLAN_KEY.STARTER });

    const impact = await getPlanImpactCount(PLAN_KEY.PRO);
    expect(impact.explicitlyAssigned).toBe(1);
  });

  it("counts legacy-tier-bridged tenants separately, and excludes any tenant with its own explicit row", async () => {
    await Organization.create({
      name: "Legacy Starter",
      subdomain: "legacy-starter",
      ownerUserId: new mongoose.Types.ObjectId(),
      tier: ORGANIZATION_TIER.STARTER,
    });
    await Organization.create({
      name: "Explicit Starter",
      subdomain: "explicit-starter",
      ownerUserId: new mongoose.Types.ObjectId(),
      tier: ORGANIZATION_TIER.STARTER,
    });
    await OrganizationEntitlement.create({ tenantId: "explicit-starter", planKey: PLAN_KEY.STARTER });

    const impact = await getPlanImpactCount(PLAN_KEY.STARTER);
    expect(impact.legacyTier).toBe(ORGANIZATION_TIER.STARTER);
    expect(impact.explicitlyAssigned).toBe(1); // explicit-starter only
    expect(impact.implicitlyBridged).toBe(1); // legacy-starter only, not double-counted
  });

  it("a plan with no legacy-tier counterpart (e.g. GROWTH) always reports zero implicitly bridged", async () => {
    const impact = await getPlanImpactCount(PLAN_KEY.GROWTH);
    expect(impact.legacyTier).toBeNull();
    expect(impact.implicitlyBridged).toBe(0);
  });
});
