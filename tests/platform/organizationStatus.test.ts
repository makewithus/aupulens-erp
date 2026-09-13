import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_orgstatus";

import Organization from "@/models/admin/Organization";
import User from "@/models/auth/User";
import AdminRole from "@/models/platform/AdminRole";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import SubscriptionEvent from "@/models/admin/SubscriptionEvent";
import {
  ADMIN_CAPABILITY,
  ADMIN_ROLE,
  ORGANIZATION_STATUS,
  ORGANIZATION_STATUS_VALUES,
  isValidOrganizationStatusTransition,
  type OrganizationStatus,
} from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";

let changeOrganizationStatus: typeof import("@/lib/platform/organizations/statusTransition").changeOrganizationStatus;
let OrganizationStatusError: typeof import("@/lib/platform/organizations/statusTransition").OrganizationStatusError;
let invalidateAdminRoleCache: typeof import("@/lib/platform/auth/adminRbac").invalidateAdminRoleCache;

function makeActor(): AdminActor {
  return {
    id: new mongoose.Types.ObjectId().toString(),
    email: "actor@example.com",
    name: "Actor",
    role: ADMIN_ROLE.GLOBAL_ADMIN,
    sessionId: "test-session",
  };
}

describe("isValidOrganizationStatusTransition — pure state machine", () => {
  it("allows every documented forward transition", () => {
    expect(isValidOrganizationStatusTransition(ORGANIZATION_STATUS.TRIAL, ORGANIZATION_STATUS.ACTIVE)).toBe(true);
    expect(isValidOrganizationStatusTransition(ORGANIZATION_STATUS.ACTIVE, ORGANIZATION_STATUS.SUSPENDED)).toBe(true);
    expect(isValidOrganizationStatusTransition(ORGANIZATION_STATUS.SUSPENDED, ORGANIZATION_STATUS.ACTIVE)).toBe(true);
  });

  it("rejects a nonsensical jump", () => {
    expect(isValidOrganizationStatusTransition(ORGANIZATION_STATUS.ARCHIVED, ORGANIZATION_STATUS.TRIAL)).toBe(false);
    expect(isValidOrganizationStatusTransition(ORGANIZATION_STATUS.INVITED, ORGANIZATION_STATUS.ACTIVE)).toBe(false);
  });

  it("Phase 11 Part 1.6: ARCHIVED -> ACTIVE is valid — archiving must be reversible to be a safe substitute for deletion (docs/admin/OPEN_QUESTIONS.md)", () => {
    expect(isValidOrganizationStatusTransition(ORGANIZATION_STATUS.ARCHIVED, ORGANIZATION_STATUS.ACTIVE)).toBe(true);
  });

  it("every status has a defined (possibly empty) transition list", () => {
    for (const status of ORGANIZATION_STATUS_VALUES) {
      expect(() => isValidOrganizationStatusTransition(status, status)).not.toThrow();
    }
  });
});

describe("changeOrganizationStatus — suspension actually blocks something (Hard Rule / source doc §33 rule 8)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Organization.init();
    await User.init();
    await AdminRole.init();
    await PlatformAuditLog.init();
    await SubscriptionEvent.init();
    ({ changeOrganizationStatus, OrganizationStatusError } = await import(
      "@/lib/platform/organizations/statusTransition"
    ));
    ({ invalidateAdminRoleCache } = await import("@/lib/platform/auth/adminRbac"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Organization.deleteMany({});
    await AdminRole.deleteMany({});
    await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
    await SubscriptionEvent.deleteMany({});
    invalidateAdminRoleCache();
  });

  async function seedOrg(status: OrganizationStatus = ORGANIZATION_STATUS.ACTIVE) {
    return Organization.create({
      name: "Test Org",
      subdomain: "test-org",
      ownerUserId: new mongoose.Types.ObjectId(),
      status,
      isActive: true,
    });
  }

  it("suspending an organisation sets isActive=false — the field real login logic already reads", async () => {
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_ADMIN,
      capabilities: [ADMIN_CAPABILITY.SUSPEND_ORGANIZATION],
      description: "",
    });
    await seedOrg();
    const actor = makeActor();

    await changeOrganizationStatus(actor, "test-org", ORGANIZATION_STATUS.SUSPENDED, "non-payment");

    const org = await Organization.findOne({ subdomain: "test-org" });
    expect(org!.status).toBe(ORGANIZATION_STATUS.SUSPENDED);
    expect(org!.isActive).toBe(false); // the actual login gate in auth.ts reads this

    const events = await SubscriptionEvent.find({ tenantId: "test-org" });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("status_changed");
    expect(events[0].meta?.reason).toBe("non-payment");

    const audits = await PlatformAuditLog.find({ tenantId: "test-org" });
    expect(audits).toHaveLength(1);
    expect(audits[0].severity).toBe("warning");
  });

  it("Phase 11 Part 0.3: moving to PAYMENT_HOLD blocks login too — it must not be a status that changes nothing", async () => {
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_ADMIN,
      capabilities: [ADMIN_CAPABILITY.SUSPEND_ORGANIZATION],
      description: "",
    });
    await seedOrg();
    const actor = makeActor();

    await changeOrganizationStatus(actor, "test-org", ORGANIZATION_STATUS.PAYMENT_HOLD, "invoice overdue");

    const org = await Organization.findOne({ subdomain: "test-org" });
    expect(org!.status).toBe(ORGANIZATION_STATUS.PAYMENT_HOLD);
    expect(org!.isActive).toBe(false); // same real login gate SUSPENDED uses — not a label that lies

    const audits = await PlatformAuditLog.find({ tenantId: "test-org" });
    expect(audits).toHaveLength(1);
    expect(audits[0].severity).toBe("warning");
  });

  it("reactivating from PAYMENT_HOLD restores isActive=true", async () => {
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_ADMIN,
      capabilities: [ADMIN_CAPABILITY.SUSPEND_ORGANIZATION],
      description: "",
    });
    await seedOrg(ORGANIZATION_STATUS.PAYMENT_HOLD);
    await Organization.updateOne({ subdomain: "test-org" }, { isActive: false });
    const actor = makeActor();

    await changeOrganizationStatus(actor, "test-org", ORGANIZATION_STATUS.ACTIVE, "payment received");

    const org = await Organization.findOne({ subdomain: "test-org" });
    expect(org!.isActive).toBe(true);
  });

  it("Phase 11 Part 1.6: archiving blocks login too — an organisation supposedly 'retired' whose users can still log in is the same label-that-lies shape as the original PAYMENT_HOLD bug", async () => {
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_ADMIN,
      capabilities: [ADMIN_CAPABILITY.SUSPEND_ORGANIZATION],
      description: "",
    });
    await seedOrg(ORGANIZATION_STATUS.CANCELLED);
    const actor = makeActor();

    await changeOrganizationStatus(actor, "test-org", ORGANIZATION_STATUS.ARCHIVED, "retiring this organisation");

    const org = await Organization.findOne({ subdomain: "test-org" });
    expect(org!.status).toBe(ORGANIZATION_STATUS.ARCHIVED);
    expect(org!.isActive).toBe(false);
  });

  it("Phase 11 Part 1.6: restoring from ARCHIVED to ACTIVE re-enables login — archival is genuinely reversible, not a one-way trip that only changes a label", async () => {
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_ADMIN,
      capabilities: [ADMIN_CAPABILITY.SUSPEND_ORGANIZATION],
      description: "",
    });
    await seedOrg(ORGANIZATION_STATUS.ARCHIVED);
    await Organization.updateOne({ subdomain: "test-org" }, { isActive: false });
    const actor = makeActor();

    await changeOrganizationStatus(actor, "test-org", ORGANIZATION_STATUS.ACTIVE, "restored after archival");

    const org = await Organization.findOne({ subdomain: "test-org" });
    expect(org!.isActive).toBe(true);
  });

  it("reactivating restores isActive=true", async () => {
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_ADMIN,
      capabilities: [ADMIN_CAPABILITY.SUSPEND_ORGANIZATION],
      description: "",
    });
    await seedOrg(ORGANIZATION_STATUS.SUSPENDED);
    await Organization.updateOne({ subdomain: "test-org" }, { isActive: false });
    const actor = makeActor();

    await changeOrganizationStatus(actor, "test-org", ORGANIZATION_STATUS.ACTIVE, "payment received");

    const org = await Organization.findOne({ subdomain: "test-org" });
    expect(org!.isActive).toBe(true);
  });

  it("rejects an invalid transition and makes no changes", async () => {
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_ADMIN,
      capabilities: [ADMIN_CAPABILITY.SUSPEND_ORGANIZATION],
      description: "",
    });
    await seedOrg(ORGANIZATION_STATUS.CANCELLED);
    const actor = makeActor();

    await expect(
      changeOrganizationStatus(actor, "test-org", ORGANIZATION_STATUS.ACTIVE, "oops"),
    ).rejects.toThrow(OrganizationStatusError);

    const events = await SubscriptionEvent.find({ tenantId: "test-org" });
    expect(events).toHaveLength(0);
  });

  it("Phase 11 Part 1.6: restoring an archived organisation to ACTIVE succeeds — archival is reversible, not a dead end", async () => {
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_ADMIN,
      capabilities: [ADMIN_CAPABILITY.SUSPEND_ORGANIZATION],
      description: "",
    });
    await seedOrg(ORGANIZATION_STATUS.ARCHIVED);
    const actor = makeActor();

    await changeOrganizationStatus(actor, "test-org", ORGANIZATION_STATUS.ACTIVE, "restoring after archival — needed again");

    const org = await Organization.findOne({ subdomain: "test-org" });
    expect(org!.status).toBe(ORGANIZATION_STATUS.ACTIVE);
  });

  it("requires a reason", async () => {
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_ADMIN,
      capabilities: [ADMIN_CAPABILITY.SUSPEND_ORGANIZATION],
      description: "",
    });
    await seedOrg();
    const actor = makeActor();
    await expect(
      changeOrganizationStatus(actor, "test-org", ORGANIZATION_STATUS.SUSPENDED, ""),
    ).rejects.toThrow(OrganizationStatusError);
  });

  it("denies an actor without SUSPEND_ORGANIZATION capability", async () => {
    await AdminRole.create({ role: ADMIN_ROLE.READ_ONLY_ADMIN, capabilities: [], description: "" });
    await seedOrg();
    const actor: AdminActor = { ...makeActor(), role: ADMIN_ROLE.READ_ONLY_ADMIN };
    await expect(
      changeOrganizationStatus(actor, "test-org", ORGANIZATION_STATUS.SUSPENDED, "test"),
    ).rejects.toThrow();

    const org = await Organization.findOne({ subdomain: "test-org" });
    expect(org!.status).toBe(ORGANIZATION_STATUS.ACTIVE); // unchanged
  });
});
