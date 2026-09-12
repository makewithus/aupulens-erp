import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_setoverride";

import Organization from "@/models/admin/Organization";
import Plan from "@/models/platform/Plan";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import AdminRole from "@/models/platform/AdminRole";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import { ADMIN_CAPABILITY, ADMIN_ROLE, PLAN_KEY, SUPPORT_LEVEL } from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";

let setEntitlementOverride: typeof import("@/lib/platform/entitlements/setOverride").setEntitlementOverride;
let clearEntitlementOverride: typeof import("@/lib/platform/entitlements/setOverride").clearEntitlementOverride;
let SetOverrideError: typeof import("@/lib/platform/entitlements/setOverride").SetOverrideError;
let resolveEntitlements: typeof import("@/lib/platform/entitlements/resolve").resolveEntitlements;
let invalidateEntitlementsCache: typeof import("@/lib/platform/entitlements/resolve").invalidateEntitlementsCache;

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
  featureFlags: {},
};

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  await Organization.init();
  await Plan.init();
  await OrganizationEntitlement.init();
  await AdminRole.init();
  await PlatformAuditLog.init();
  ({ setEntitlementOverride, clearEntitlementOverride, SetOverrideError } = await import(
    "@/lib/platform/entitlements/setOverride"
  ));
  ({ resolveEntitlements, invalidateEntitlementsCache } = await import(
    "@/lib/platform/entitlements/resolve"
  ));
  await AdminRole.create({
    role: ADMIN_ROLE.GLOBAL_ADMIN,
    capabilities: [ADMIN_CAPABILITY.ASSIGN_PLAN],
    description: "",
  });
  await Plan.create({ key: PLAN_KEY.BUSINESS, name: "Business", features: FEATURES });
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

describe("setEntitlementOverride — §11's override layer, never a copy of the base plan", () => {
  it("layers overrides on top of an existing base plan; unlisted fields still resolve from the base plan", async () => {
    const tenantId = "custom-co";
    await Organization.create({ name: "Custom Co", subdomain: tenantId, ownerUserId: new mongoose.Types.ObjectId() });
    await OrganizationEntitlement.create({ tenantId, planKey: PLAN_KEY.BUSINESS });

    await setEntitlementOverride(
      makeActor(),
      tenantId,
      { maxUsers: 999999, modules: ["admin", "finance", "sales", "custom_module"] },
      "enterprise deal — unlimited seats",
    );

    const resolved = await resolveEntitlements(tenantId);
    expect(resolved.limits.maxUsers).toBe(999999);
    expect(resolved.modules).toContain("custom_module");
    expect(resolved.limits.aiCreditsPerMonth).toBe(FEATURES.aiCreditsPerMonth); // untouched, still from base plan

    const audits = await PlatformAuditLog.find({ tenantId });
    expect(audits).toHaveLength(1);
    expect(audits[0].eventType).toBe("entitlement_overridden");
    expect(audits[0].metadata?.reason).toBe("enterprise deal — unlimited seats");
  });

  it("merges into existing overrides rather than replacing them wholesale", async () => {
    const tenantId = "merge-co";
    await Organization.create({ name: "Merge Co", subdomain: tenantId, ownerUserId: new mongoose.Types.ObjectId() });
    await OrganizationEntitlement.create({ tenantId, planKey: PLAN_KEY.BUSINESS, overrides: { maxUsers: 500 } });

    await setEntitlementOverride(makeActor(), tenantId, { storageGb: 5000 }, "extra storage");

    const entitlement = await OrganizationEntitlement.findOne({ tenantId });
    expect(entitlement!.overrides).toEqual({ maxUsers: 500, storageGb: 5000 });
  });

  it("rejects setting an override when no base plan is assigned yet", async () => {
    const tenantId = "no-plan-co";
    await Organization.create({ name: "No Plan Co", subdomain: tenantId, ownerUserId: new mongoose.Types.ObjectId() });
    await expect(
      setEntitlementOverride(makeActor(), tenantId, { maxUsers: 10 }, "test"),
    ).rejects.toThrow(SetOverrideError);
  });

  it("requires a reason", async () => {
    const tenantId = "reason-co";
    await Organization.create({ name: "Reason Co", subdomain: tenantId, ownerUserId: new mongoose.Types.ObjectId() });
    await OrganizationEntitlement.create({ tenantId, planKey: PLAN_KEY.BUSINESS });
    await expect(setEntitlementOverride(makeActor(), tenantId, { maxUsers: 10 }, "")).rejects.toThrow(
      SetOverrideError,
    );
  });

  it("denies an actor without ASSIGN_PLAN and changes nothing", async () => {
    await AdminRole.create({ role: ADMIN_ROLE.READ_ONLY_ADMIN, capabilities: [], description: "" });
    const tenantId = "denied-co";
    await Organization.create({ name: "Denied Co", subdomain: tenantId, ownerUserId: new mongoose.Types.ObjectId() });
    await OrganizationEntitlement.create({ tenantId, planKey: PLAN_KEY.BUSINESS });

    await expect(
      setEntitlementOverride(makeActor(ADMIN_ROLE.READ_ONLY_ADMIN), tenantId, { maxUsers: 10 }, "test"),
    ).rejects.toThrow();
    expect((await OrganizationEntitlement.findOne({ tenantId }))!.overrides).toBeUndefined();
  });
});

describe("clearEntitlementOverride — reverts to the base plan's own definition exactly", () => {
  it("removes overrides entirely; resolution falls back to the untouched base plan", async () => {
    const tenantId = "revert-co";
    await Organization.create({ name: "Revert Co", subdomain: tenantId, ownerUserId: new mongoose.Types.ObjectId() });
    await OrganizationEntitlement.create({ tenantId, planKey: PLAN_KEY.BUSINESS, overrides: { maxUsers: 999 } });

    await clearEntitlementOverride(makeActor(), tenantId, "deal ended");

    const entitlement = await OrganizationEntitlement.findOne({ tenantId }).lean();
    expect(entitlement!.overrides).toBeUndefined();

    const resolved = await resolveEntitlements(tenantId);
    expect(resolved.limits.maxUsers).toBe(FEATURES.maxUsers);

    const audits = await PlatformAuditLog.find({ tenantId, eventType: "entitlement_overridden" });
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata?.action).toBe("cleared");
  });
});
