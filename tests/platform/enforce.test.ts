import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_enforce";

import Organization from "@/models/admin/Organization";
import Plan from "@/models/platform/Plan";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import { PLAN_KEY, SUPPORT_LEVEL } from "@/lib/constants/statuses";

let moduleIsEnabled: typeof import("@/lib/platform/entitlements/enforce").moduleIsEnabled;
let requireModuleEnabled: typeof import("@/lib/platform/entitlements/enforce").requireModuleEnabled;
let invalidateEntitlementsCache: typeof import("@/lib/platform/entitlements/resolve").invalidateEntitlementsCache;

describe("entitlement enforcement (Phase 3b) — the primitive, in isolation", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Organization.init();
    await Plan.init();
    await OrganizationEntitlement.init();
    await PlatformAuditLog.init();
    ({ moduleIsEnabled, requireModuleEnabled } = await import("@/lib/platform/entitlements/enforce"));
    ({ invalidateEntitlementsCache } = await import("@/lib/platform/entitlements/resolve"));
    await Plan.create({
      key: PLAN_KEY.STARTER,
      name: "Starter",
      features: {
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
      },
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

  it("allows a module that IS in the resolved plan", async () => {
    await Organization.create({ name: "Org", subdomain: "org-a", ownerUserId: new mongoose.Types.ObjectId() });
    await OrganizationEntitlement.create({ tenantId: "org-a", planKey: PLAN_KEY.STARTER });

    expect(await moduleIsEnabled("org-a", "finance")).toBe(true);
    expect(await requireModuleEnabled("org-a", "finance")).toBeNull();
  });

  it("blocks a module that is NOT in the resolved plan, with a clear message", async () => {
    await Organization.create({ name: "Org", subdomain: "org-b", ownerUserId: new mongoose.Types.ObjectId() });
    await OrganizationEntitlement.create({ tenantId: "org-b", planKey: PLAN_KEY.STARTER });

    expect(await moduleIsEnabled("org-b", "inventory")).toBe(false);
    const response = await requireModuleEnabled("org-b", "inventory");
    expect(response).not.toBeNull();
    expect(response!.status).toBe(403);
    const body = await response!.json();
    expect(body.success).toBe(false);
    expect(body.message).toContain("inventory");
  });

  it("supports the legacy {error} response shape for pre-existing routes", async () => {
    await Organization.create({ name: "Org", subdomain: "org-c", ownerUserId: new mongoose.Types.ObjectId() });
    await OrganizationEntitlement.create({ tenantId: "org-c", planKey: PLAN_KEY.STARTER });

    const response = await requireModuleEnabled("org-c", "inventory", { legacyErrorShape: true });
    const body = await response!.json();
    expect(body.error).toContain("inventory");
    expect(body.success).toBeUndefined();
  });

  it("fails OPEN when the resolver itself is in its own permissive-default mode — never compounds a resolver error into a lockout", async () => {
    await Organization.create({ name: "Broken Org", subdomain: "broken-org", ownerUserId: new mongoose.Types.ObjectId() });
    // No Plan for this key at all -> resolver falls back to permissive_default
    await OrganizationEntitlement.create({ tenantId: "broken-org", planKey: PLAN_KEY.ENTERPRISE });

    expect(await moduleIsEnabled("broken-org", "some-module-not-in-any-real-plan")).toBe(true);
    expect(await requireModuleEnabled("broken-org", "some-module-not-in-any-real-plan")).toBeNull();
  });
});
