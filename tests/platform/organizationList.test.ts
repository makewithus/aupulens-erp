import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_orglist";

import Organization from "@/models/admin/Organization";
import User from "@/models/auth/User";
import ActivityLog from "@/models/admin/ActivityLog";
import AiUsage from "@/models/admin/AiUsage";
import AdminRole from "@/models/platform/AdminRole";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import Plan from "@/models/platform/Plan";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import { ADMIN_CAPABILITY, ADMIN_ROLE, ENTITY_STATUS, ORGANIZATION_TIER, PLAN_KEY, SUPPORT_LEVEL } from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";

let listOrganizations: typeof import("@/lib/platform/organizations/list").listOrganizations;
let invalidateAdminRoleCache: typeof import("@/lib/platform/auth/adminRbac").invalidateAdminRoleCache;
let invalidateEntitlementsCache: typeof import("@/lib/platform/entitlements/resolve").invalidateEntitlementsCache;

const PLAN_FEATURES = {
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

function makeActor(): AdminActor {
  return {
    id: new mongoose.Types.ObjectId().toString(),
    email: "actor@example.com",
    name: "Actor",
    role: ADMIN_ROLE.GLOBAL_ADMIN,
    sessionId: "test-session",
  };
}

describe("listOrganizations — server-side pagination, filtering, and derived fields", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Organization.init();
    await User.init();
    await ActivityLog.init();
    await AiUsage.init();
    await AdminRole.init();
    await PlatformAuditLog.init();
    await Plan.init();
    await OrganizationEntitlement.init();
    ({ listOrganizations } = await import("@/lib/platform/organizations/list"));
    ({ invalidateAdminRoleCache } = await import("@/lib/platform/auth/adminRbac"));
    ({ invalidateEntitlementsCache } = await import("@/lib/platform/entitlements/resolve"));
    await Plan.create({ key: PLAN_KEY.STARTER, name: "Starter", features: PLAN_FEATURES });
    await Plan.create({ key: PLAN_KEY.ENTERPRISE, name: "Enterprise", features: PLAN_FEATURES });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Organization.deleteMany({});
    await User.deleteMany({});
    await ActivityLog.deleteMany({});
    await AiUsage.deleteMany({});
    await AdminRole.deleteMany({});
    await OrganizationEntitlement.deleteMany({});
    await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
    invalidateAdminRoleCache();
    invalidateEntitlementsCache();
  });

  async function seedGrantedRole() {
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_ADMIN,
      capabilities: [ADMIN_CAPABILITY.VIEW_ORGANIZATIONS],
      description: "",
    });
  }

  it("paginates using .skip()/.limit() at the query layer, never loading the full collection", async () => {
    await seedGrantedRole();
    for (let i = 0; i < 30; i++) {
      await Organization.create({
        name: `Org ${i}`,
        subdomain: `org-${i}`,
        ownerUserId: new mongoose.Types.ObjectId(),
      });
    }
    const findSpy = vi.spyOn(Organization, "find");

    const page1 = await listOrganizations(makeActor(), "test", { page: 1, pageSize: 10 });
    expect(page1.rows).toHaveLength(10);
    expect(page1.total).toBe(30);

    const page2 = await listOrganizations(makeActor(), "test", { page: 2, pageSize: 10 });
    expect(page2.rows).toHaveLength(10);
    expect(page2.rows[0].id).not.toBe(page1.rows[0].id);

    findSpy.mockRestore();
  });

  it("filters by search term across name and subdomain", async () => {
    await seedGrantedRole();
    await Organization.create({ name: "Acme Corp", subdomain: "acme", ownerUserId: new mongoose.Types.ObjectId() });
    await Organization.create({ name: "Other Co", subdomain: "othco", ownerUserId: new mongoose.Types.ObjectId() });

    const result = await listOrganizations(makeActor(), "test", { search: "acme" });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Acme Corp");
  });

  it("computes activeUserCount from real User documents, not a stored/stale field", async () => {
    await seedGrantedRole();
    await Organization.create({ name: "Acme", subdomain: "acme", ownerUserId: new mongoose.Types.ObjectId() });
    await User.create({
      tenantId: "acme",
      name: "A",
      email: "a@acme.com",
      phone: "1",
      password: "hashedpw",
      role: "admin",
      status: ENTITY_STATUS.ACTIVE,
    });
    await User.create({
      tenantId: "acme",
      name: "B",
      email: "b@acme.com",
      phone: "1",
      password: "hashedpw",
      role: "finance",
      status: ENTITY_STATUS.INACTIVE, // must not be counted
    });

    const result = await listOrganizations(makeActor(), "test", {});
    expect(result.rows[0].activeUserCount).toBe(1);
  });

  it("falls back to Organization.updatedAt for lastMeaningfulActivityAt when no ActivityLog entry exists", async () => {
    await seedGrantedRole();
    const org = await Organization.create({
      name: "Quiet Org",
      subdomain: "quiet",
      ownerUserId: new mongoose.Types.ObjectId(),
    });

    const result = await listOrganizations(makeActor(), "test", {});
    expect(result.rows[0].lastMeaningfulActivityAt).toBe(org.updatedAt.toISOString());
  });

  it("uses the most recent ActivityLog entry when one exists", async () => {
    await seedGrantedRole();
    await Organization.create({ name: "Active Org", subdomain: "active-org", ownerUserId: new mongoose.Types.ObjectId() });
    const recentTimestamp = new Date("2026-06-01T00:00:00Z");
    await ActivityLog.create({
      tenantId: "active-org",
      userId: new mongoose.Types.ObjectId(),
      userName: "A",
      userEmail: "a@x.com",
      userRole: "admin",
      activity: "did something",
      timestamp: recentTimestamp,
    });

    const result = await listOrganizations(makeActor(), "test", {});
    expect(result.rows[0].lastMeaningfulActivityAt).toBe(recentTimestamp.toISOString());
  });

  it("computes aiUsagePercent from real AiUsage rows against the org's own cap", async () => {
    await seedGrantedRole();
    await Organization.create({
      name: "AI Org",
      subdomain: "ai-org",
      ownerUserId: new mongoose.Types.ObjectId(),
      aiCallsPerMonth: 100,
    });
    const { getAiPeriod } = await import("@/lib/ai/usage");
    await AiUsage.create({ tenantId: "ai-org", period: getAiPeriod(), count: 40 });

    const result = await listOrganizations(makeActor(), "test", {});
    expect(result.rows[0].currentPeriodAiUsage).toBe(40);
    expect(result.rows[0].aiUsagePercent).toBe(40);
  });

  it("Phase 11 Part 1.1: aiUsagePercent is null (never NaN/Infinity/a fabricated 0%) when the org has no AI call cap configured", async () => {
    await seedGrantedRole();
    await Organization.create({
      name: "No Cap Org",
      subdomain: "no-cap-org",
      ownerUserId: new mongoose.Types.ObjectId(),
      aiCallsPerMonth: 0,
    });
    const { getAiPeriod } = await import("@/lib/ai/usage");
    await AiUsage.create({ tenantId: "no-cap-org", period: getAiPeriod(), count: 5 });

    const result = await listOrganizations(makeActor(), "test", {});
    expect(result.rows[0].aiUsagePercent).toBeNull();
    expect(result.rows[0].currentPeriodAiUsage).toBe(5); // the raw count is still shown
  });

  it("Phase 11 Part 1.1: planKey resolves through resolveEntitlements() — an assigned plan overrides the raw legacy tier, matching the Subscription tab (Hard Rule: the two surfaces must never disagree)", async () => {
    await seedGrantedRole();
    await Organization.create({
      name: "Resolved Plan Org",
      subdomain: "resolved-plan-org",
      ownerUserId: new mongoose.Types.ObjectId(),
      tier: ORGANIZATION_TIER.STARTER, // the raw legacy field — deliberately the WRONG answer here
    });
    await OrganizationEntitlement.create({ tenantId: "resolved-plan-org", planKey: PLAN_KEY.ENTERPRISE });

    const result = await listOrganizations(makeActor(), "test", {});
    expect(result.rows[0].planKey).toBe(PLAN_KEY.ENTERPRISE); // not "starter" — the list must not show the raw tier once a plan is assigned
  });

  it("Phase 11 Part 1.1: planKey falls back to the tier-bridged plan when no OrganizationEntitlement row exists — same fallback the Subscription tab uses", async () => {
    await seedGrantedRole();
    await Organization.create({
      name: "Unassigned Org",
      subdomain: "unassigned-org",
      ownerUserId: new mongoose.Types.ObjectId(),
      tier: ORGANIZATION_TIER.STARTER,
    });

    const result = await listOrganizations(makeActor(), "test", {});
    expect(result.rows[0].planKey).toBe(PLAN_KEY.STARTER);
  });

  it("Phase 11 Part 1.1: region and timezone pass through for per-organisation display (Hard Rule 12)", async () => {
    await seedGrantedRole();
    await Organization.create({
      name: "Regional Org",
      subdomain: "regional-org",
      ownerUserId: new mongoose.Types.ObjectId(),
      region: "APAC",
      settings: { timezone: "Asia/Kolkata" },
    });

    const result = await listOrganizations(makeActor(), "test", {});
    expect(result.rows[0].region).toBe("APAC");
    expect(result.rows[0].timezone).toBe("Asia/Kolkata");
  });

  it("denies without VIEW_ORGANIZATIONS and never touches the database", async () => {
    await AdminRole.create({ role: ADMIN_ROLE.READ_ONLY_ADMIN, capabilities: [], description: "" });
    const actor: AdminActor = { ...makeActor(), role: ADMIN_ROLE.READ_ONLY_ADMIN };
    await expect(listOrganizations(actor, "test", {})).rejects.toThrow();
  });
});
