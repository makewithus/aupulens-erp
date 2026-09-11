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
import { ADMIN_CAPABILITY, ADMIN_ROLE, ORGANIZATION_STATUS, ORGANIZATION_TYPE } from "@/lib/constants/statuses";
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
    ({ createOrganization, OrganizationCreateError } = await import(
      "@/lib/platform/organizations/create"
    ));
    ({ invalidateAdminRoleCache } = await import("@/lib/platform/auth/adminRbac"));
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
      capabilities: [ADMIN_CAPABILITY.MANAGE_ORGANIZATIONS],
      description: "",
    });
    await OrganizationType.create({
      type: ORGANIZATION_TYPE.SME,
      label: "SME",
      defaultConfig: { enabledModules: ["finance", "sales"], maxUsers: 10, aiCallsPerMonth: 200 },
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
});
