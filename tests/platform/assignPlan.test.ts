import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_assignplan";

import Organization from "@/models/admin/Organization";
import Plan from "@/models/platform/Plan";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import AdminRole from "@/models/platform/AdminRole";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import SubscriptionEvent from "@/models/admin/SubscriptionEvent";
import User from "@/models/auth/User";
import Account from "@/models/finance/Account";
import { ADMIN_CAPABILITY, ADMIN_ROLE, ENTITY_STATUS, PLAN_KEY, SUPPORT_LEVEL } from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";

let assignPlan: typeof import("@/lib/platform/entitlements/assignPlan").assignPlan;
let AssignPlanError: typeof import("@/lib/platform/entitlements/assignPlan").AssignPlanError;
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

describe("assignPlan — full history, zero data deletion on downgrade (Hard Rule 7)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Organization.init();
    await Plan.init();
    await OrganizationEntitlement.init();
    await AdminRole.init();
    await PlatformAuditLog.init();
    await SubscriptionEvent.init();
    await User.init();
    await Account.init();
    ({ assignPlan, AssignPlanError } = await import("@/lib/platform/entitlements/assignPlan"));
    ({ invalidateAdminRoleCache } = await import("@/lib/platform/auth/adminRbac"));
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_ADMIN,
      capabilities: [ADMIN_CAPABILITY.ASSIGN_PLAN],
      description: "",
    });
    await Plan.create({ key: PLAN_KEY.PRO, name: "Pro", features: FEATURES });
    await Plan.create({ key: PLAN_KEY.STARTER, name: "Starter", features: FEATURES });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Organization.deleteMany({});
    await OrganizationEntitlement.deleteMany({});
    await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
    await SubscriptionEvent.deleteMany({});
    await User.deleteMany({});
    await Account.deleteMany({});
  });

  it("records a full history entry with previous/new plan, reason, and actor", async () => {
    await Organization.create({ name: "Org", subdomain: "org-a", ownerUserId: new mongoose.Types.ObjectId() });
    const actor = makeActor();

    await assignPlan(actor, "org-a", PLAN_KEY.PRO, "immediately", "upsell");

    const events = await SubscriptionEvent.find({ tenantId: "org-a", type: "plan_assigned" });
    expect(events).toHaveLength(1);
    expect(events[0].meta?.fromPlanKey).toBeNull();
    expect(events[0].meta?.toPlanKey).toBe(PLAN_KEY.PRO);
    expect(events[0].meta?.reason).toBe("upsell");
    expect(events[0].meta?.actorId).toBe(actor.id);

    const entitlement = await OrganizationEntitlement.findOne({ tenantId: "org-a" });
    expect(entitlement!.planKey).toBe(PLAN_KEY.PRO);

    const audits = await PlatformAuditLog.find({ tenantId: "org-a" });
    expect(audits).toHaveLength(1);
    expect(audits[0].eventType).toBe("plan_assigned");
  });

  it("a downgrade deletes ZERO tenant documents — real document-count assertion, not a mock", async () => {
    await Organization.create({ name: "Org", subdomain: "org-b", ownerUserId: new mongoose.Types.ObjectId() });
    const owner = await User.create({
      tenantId: "org-b",
      name: "Owner",
      email: "owner@org-b.com",
      phone: "1",
      password: "hashedpw",
      role: "admin",
      status: ENTITY_STATUS.ACTIVE,
    });
    for (let i = 0; i < 5; i++) {
      await Account.create({
        tenantId: "org-b",
        code: `100${i}`,
        name: `Account ${i}`,
        account_type: "asset_current",
        internal_group: "asset",
      });
    }
    const actor = makeActor();
    await assignPlan(actor, "org-b", PLAN_KEY.PRO, "immediately", "initial");

    const userCountBefore = await User.countDocuments({ tenantId: "org-b" });
    const accountCountBefore = await Account.countDocuments({ tenantId: "org-b" });

    await assignPlan(actor, "org-b", PLAN_KEY.STARTER, "immediately", "downgrade — non-payment");

    const userCountAfter = await User.countDocuments({ tenantId: "org-b" });
    const accountCountAfter = await Account.countDocuments({ tenantId: "org-b" });

    expect(userCountAfter).toBe(userCountBefore);
    expect(accountCountAfter).toBe(accountCountBefore);
    expect(accountCountAfter).toBe(5);

    const entitlement = await OrganizationEntitlement.findOne({ tenantId: "org-b" });
    expect(entitlement!.planKey).toBe(PLAN_KEY.STARTER); // only the resolved entitlement changed
  });

  it("rejects assignment to an inactive/nonexistent plan key", async () => {
    await Organization.create({ name: "Org", subdomain: "org-c", ownerUserId: new mongoose.Types.ObjectId() });
    await expect(
      assignPlan(makeActor(), "org-c", "not_a_real_plan" as any, "immediately", "test"),
    ).rejects.toThrow(AssignPlanError);
  });

  it("requires a reason", async () => {
    await Organization.create({ name: "Org", subdomain: "org-d", ownerUserId: new mongoose.Types.ObjectId() });
    await expect(assignPlan(makeActor(), "org-d", PLAN_KEY.PRO, "immediately", "")).rejects.toThrow(
      AssignPlanError,
    );
  });

  it("denies an actor without ASSIGN_PLAN and changes nothing", async () => {
    await AdminRole.create({ role: ADMIN_ROLE.READ_ONLY_ADMIN, capabilities: [], description: "" });
    invalidateAdminRoleCache();
    await Organization.create({ name: "Org", subdomain: "org-e", ownerUserId: new mongoose.Types.ObjectId() });

    await expect(
      assignPlan(makeActor(ADMIN_ROLE.READ_ONLY_ADMIN), "org-e", PLAN_KEY.PRO, "immediately", "test"),
    ).rejects.toThrow();

    expect(await OrganizationEntitlement.findOne({ tenantId: "org-e" })).toBeNull();
  });
});
