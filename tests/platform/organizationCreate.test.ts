import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_orgcreate";

import Organization from "@/models/admin/Organization";
import User from "@/models/auth/User";
import Account from "@/models/finance/Account";
import AdminRole from "@/models/platform/AdminRole";
import OrganizationType from "@/models/platform/OrganizationType";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import SubscriptionEvent from "@/models/admin/SubscriptionEvent";
import Plan from "@/models/platform/Plan";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import {
  ADMIN_CAPABILITY,
  ADMIN_ROLE,
  ORGANIZATION_STATUS,
  ORGANIZATION_TYPE,
  PLAN_KEY,
  SUPPORT_LEVEL,
} from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";

let createOrganization: typeof import("@/lib/platform/organizations/create").createOrganization;
let OrganizationCreateError: typeof import("@/lib/platform/organizations/create").OrganizationCreateError;
let invalidateAdminRoleCache: typeof import("@/lib/platform/auth/adminRbac").invalidateAdminRoleCache;

function makeActor(role: string = ADMIN_ROLE.GLOBAL_SUPER_ADMIN): AdminActor {
  return {
    id: new mongoose.Types.ObjectId().toString(),
    email: "actor@example.com",
    name: "Actor",
    role: role as AdminActor["role"],
    sessionId: "test-session",
  };
}

const VALID_INPUT = {
  name: "Acme Corp",
  subdomain: "acme-corp",
  organizationType: ORGANIZATION_TYPE.SME,
  ownerName: "Jane Owner",
  ownerEmail: "jane@acme-corp.com",
  ownerPhone: "9999999999",
  ownerPassword: "correct-horse-battery",
  country: "India",
};

describe("createOrganization — the fourth, admin-actor-aware creation path", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Organization.init();
    await User.init();
    await Account.init();
    await AdminRole.init();
    await OrganizationType.init();
    await PlatformAuditLog.init();
    await SubscriptionEvent.init();
    await Plan.init();
    await OrganizationEntitlement.init();
    ({ createOrganization, OrganizationCreateError } = await import(
      "@/lib/platform/organizations/create"
    ));
    ({ invalidateAdminRoleCache } = await import("@/lib/platform/auth/adminRbac"));
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
      capabilities: [ADMIN_CAPABILITY.MANAGE_ORGANIZATIONS, ADMIN_CAPABILITY.ASSIGN_PLAN],
      description: "",
    });
    await OrganizationType.create({
      type: ORGANIZATION_TYPE.SME,
      label: "SME",
      defaultConfig: { enabledModules: ["finance", "sales"], maxUsers: 10, aiCallsPerMonth: 200 },
    });
    await Plan.create({
      key: PLAN_KEY.STARTER,
      name: "Starter",
      features: {
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
      },
    });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Organization.deleteMany({});
    await User.deleteMany({});
    await Account.deleteMany({});
    await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
    await SubscriptionEvent.deleteMany({});
    await OrganizationEntitlement.deleteMany({});
  });

  it("creates a real, usable tenant: Organization + owner User + seeded Chart of Accounts", async () => {
    const actor = makeActor();
    const result = await createOrganization(actor, VALID_INPUT);

    expect(result.subdomain).toBe("acme-corp");

    const org = await Organization.findOne({ subdomain: "acme-corp" });
    expect(org).not.toBeNull();
    expect(org!.status).toBe(ORGANIZATION_STATUS.ONBOARDING);
    expect(org!.organizationType).toBe(ORGANIZATION_TYPE.SME);
    expect(org!.maxUsers).toBe(10); // from OrganizationType default config
    expect(org!.settings.enabledModules).toEqual(["finance", "sales"]);

    const owner = await User.findOne({ tenantId: "acme-corp", email: "jane@acme-corp.com" });
    expect(owner).not.toBeNull();
    expect(owner!.role).toBe("admin");
    expect(String(org!.ownerUserId)).toBe(String(owner!._id));
    expect(owner!.password).not.toBe(VALID_INPUT.ownerPassword); // hashed

    const accounts = await Account.countDocuments({ tenantId: "acme-corp" });
    expect(accounts).toBeGreaterThan(0);

    const events = await SubscriptionEvent.find({ tenantId: "acme-corp" });
    expect(events.some((e) => e.type === "created")).toBe(true);

    const audits = await PlatformAuditLog.find({ tenantId: "acme-corp" });
    expect(audits).toHaveLength(1);
    expect(audits[0].eventType).toBe("organization_created");
  });

  it("rejects a duplicate subdomain", async () => {
    await createOrganization(makeActor(), VALID_INPUT);
    await expect(
      createOrganization(makeActor(), { ...VALID_INPUT, ownerEmail: "other@acme-corp.com" }),
    ).rejects.toThrow(OrganizationCreateError);
  });

  it("Hard Rule 1: the database's own unique index on subdomain rejects a duplicate even below the application-level check — the real backstop for a race between two concurrent creates", async () => {
    await Organization.create({
      name: "Acme Corp",
      subdomain: "acme-corp",
      ownerUserId: new mongoose.Types.ObjectId(),
      status: ORGANIZATION_STATUS.ACTIVE,
    });
    await expect(
      Organization.create({
        name: "Acme Corp Duplicate",
        subdomain: "acme-corp",
        ownerUserId: new mongoose.Types.ObjectId(),
        status: ORGANIZATION_STATUS.ACTIVE,
      }),
    ).rejects.toThrow(/duplicate key|E11000/i);
  });

  it("rejects an invalid subdomain slug", async () => {
    await expect(
      createOrganization(makeActor(), { ...VALID_INPUT, subdomain: "Not Valid!" }),
    ).rejects.toThrow(OrganizationCreateError);
  });

  it("rejects a short owner password", async () => {
    await expect(
      createOrganization(makeActor(), { ...VALID_INPUT, ownerPassword: "short" }),
    ).rejects.toThrow(OrganizationCreateError);
  });

  it("denies an actor without MANAGE_ORGANIZATIONS and creates nothing", async () => {
    await AdminRole.create({ role: ADMIN_ROLE.READ_ONLY_ADMIN, capabilities: [], description: "" });
    invalidateAdminRoleCache();
    await expect(
      createOrganization(makeActor(ADMIN_ROLE.READ_ONLY_ADMIN), VALID_INPUT),
    ).rejects.toThrow();
    expect(await Organization.findOne({ subdomain: "acme-corp" })).toBeNull();
  });

  it("defaults taxJurisdiction from country when not given explicitly", async () => {
    await createOrganization(makeActor(), VALID_INPUT);
    const org = await Organization.findOne({ subdomain: "acme-corp" });
    expect(org!.settings.taxJurisdiction).toBe("India - GST");
  });

  it("an explicit taxJurisdiction overrides the country default", async () => {
    await createOrganization(makeActor(), { ...VALID_INPUT, taxJurisdiction: "India - Composition Scheme" });
    const org = await Organization.findOne({ subdomain: "acme-corp" });
    expect(org!.settings.taxJurisdiction).toBe("India - Composition Scheme");
  });

  it("§5: an explicit planKey is assigned within the same creation flow, through the real assignPlan() path", async () => {
    await createOrganization(makeActor(), { ...VALID_INPUT, planKey: PLAN_KEY.STARTER });

    const entitlement = await OrganizationEntitlement.findOne({ tenantId: "acme-corp" });
    expect(entitlement!.planKey).toBe(PLAN_KEY.STARTER);

    const events = await SubscriptionEvent.find({ tenantId: "acme-corp" });
    expect(events.some((e) => e.type === "plan_assigned")).toBe(true);

    const audits = await PlatformAuditLog.find({ tenantId: "acme-corp", eventType: "plan_assigned" });
    expect(audits).toHaveLength(1);

    const org = await Organization.findOne({ subdomain: "acme-corp" });
    expect(org!.planAssignmentPending).toBe(false);
  });

  it("falls back to the organisation type's own defaultPlanKey when none is given explicitly", async () => {
    await OrganizationType.updateOne(
      { type: ORGANIZATION_TYPE.SME },
      { $set: { "defaultConfig.defaultPlanKey": PLAN_KEY.STARTER } },
    );
    await createOrganization(makeActor(), VALID_INPUT);

    const entitlement = await OrganizationEntitlement.findOne({ tenantId: "acme-corp" });
    expect(entitlement!.planKey).toBe(PLAN_KEY.STARTER);

    await OrganizationType.updateOne(
      { type: ORGANIZATION_TYPE.SME },
      { $unset: { "defaultConfig.defaultPlanKey": "" } },
    );
  });

  it("no plan opinion at all (no explicit planKey, no org-type default) skips assignment entirely — not an error, exactly today's pre-§5 behaviour", async () => {
    const result = await createOrganization(makeActor(), VALID_INPUT);
    expect(result.subdomain).toBe("acme-corp");
    expect(await OrganizationEntitlement.findOne({ tenantId: "acme-corp" })).toBeNull();

    const org = await Organization.findOne({ subdomain: "acme-corp" });
    expect(org!.planAssignmentPending).toBe(false);
  });

  it("a failed plan assignment does not fail organisation creation, and flags planAssignmentPending rather than failing silently", async () => {
    // Reference a real enum value with no matching Plan document — the same
    // failure shape assignPlan.ts itself already throws AssignPlanError for.
    const result = await createOrganization(makeActor(), { ...VALID_INPUT, planKey: PLAN_KEY.ENTERPRISE });

    expect(result.subdomain).toBe("acme-corp"); // the organisation itself still exists
    const org = await Organization.findOne({ subdomain: "acme-corp" });
    expect(org).not.toBeNull();
    expect(org!.planAssignmentPending).toBe(true);
    expect(await OrganizationEntitlement.findOne({ tenantId: "acme-corp" })).toBeNull();

    const audits = await PlatformAuditLog.find({ tenantId: "acme-corp", eventType: "organization_created" });
    expect(audits[0].metadata?.planAssigned).toBe(false);
  });

  it("a later successful assignPlan() clears planAssignmentPending set at creation time", async () => {
    await createOrganization(makeActor(), { ...VALID_INPUT, planKey: PLAN_KEY.ENTERPRISE });
    expect((await Organization.findOne({ subdomain: "acme-corp" }))!.planAssignmentPending).toBe(true);

    const { assignPlan } = await import("@/lib/platform/entitlements/assignPlan");
    await assignPlan(makeActor(), "acme-corp", PLAN_KEY.STARTER, "immediately", "manual recovery");

    expect((await Organization.findOne({ subdomain: "acme-corp" }))!.planAssignmentPending).toBe(false);
  });
});
