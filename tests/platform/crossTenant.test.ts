import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_crosstenant";

import Organization from "@/models/admin/Organization";
import AdminRole from "@/models/platform/AdminRole";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import {
  ADMIN_CAPABILITY,
  ADMIN_ROLE,
  PLATFORM_EVENT_TYPE,
} from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";

// Both transitively import lib/db.ts (eager MONGODB_URI read at module-eval
// time) — dynamic import inside beforeAll, same reasoning as
// tests/platform/adminRbac.test.ts.
let countOrganizations: typeof import("@/lib/platform/tenancy/crossTenant").countOrganizations;
let withCrossTenantRead: typeof import("@/lib/platform/tenancy/crossTenant").withCrossTenantRead;
let invalidateAdminRoleCache: typeof import("@/lib/platform/auth/adminRbac").invalidateAdminRoleCache;
let AdminForbiddenError: typeof import("@/lib/platform/auth/adminRbac").AdminForbiddenError;

function makeActor(role: string): AdminActor {
  return {
    id: new mongoose.Types.ObjectId().toString(),
    email: "actor@example.com",
    name: "Actor",
    role: role as AdminActor["role"],
    sessionId: "test-session",
    ip: "127.0.0.1",
    userAgent: "vitest",
  };
}

describe("crossTenant gateway — the one sanctioned cross-tenant read path", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Organization.init();
    await AdminRole.init();
    await PlatformAuditLog.init();
    ({ countOrganizations, withCrossTenantRead } = await import(
      "@/lib/platform/tenancy/crossTenant"
    ));
    ({ invalidateAdminRoleCache, AdminForbiddenError } = await import(
      "@/lib/platform/auth/adminRbac"
    ));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Organization.deleteMany({});
    await AdminRole.deleteMany({});
    await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
    invalidateAdminRoleCache();
  });

  it("denies the read and audits the denial when the actor lacks the capability", async () => {
    await AdminRole.create({ role: ADMIN_ROLE.READ_ONLY_ADMIN, capabilities: [], description: "" });
    const actor = makeActor(ADMIN_ROLE.READ_ONLY_ADMIN);

    await expect(countOrganizations(actor, "test reason")).rejects.toThrow(AdminForbiddenError);

    const logs = await PlatformAuditLog.find({ actorId: actor.id });
    expect(logs).toHaveLength(1);
    expect(logs[0].eventType).toBe(PLATFORM_EVENT_TYPE.CROSS_TENANT_READ_DENIED);
  });

  it("performs the read and audits success (including on a read-only access) when the capability is granted", async () => {
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_ADMIN,
      capabilities: [ADMIN_CAPABILITY.VIEW_ORGANIZATIONS],
      description: "",
    });
    await Organization.create({ name: "Org A", subdomain: "org-a", ownerUserId: new mongoose.Types.ObjectId() });
    await Organization.create({ name: "Org B", subdomain: "org-b", ownerUserId: new mongoose.Types.ObjectId() });

    const actor = makeActor(ADMIN_ROLE.GLOBAL_ADMIN);
    const count = await countOrganizations(actor, "dashboard view");
    expect(count).toBe(2);

    const logs = await PlatformAuditLog.find({ actorId: actor.id });
    expect(logs).toHaveLength(1);
    expect(logs[0].eventType).toBe(PLATFORM_EVENT_TYPE.CROSS_TENANT_READ);
    expect(logs[0].metadata?.reason).toBe("dashboard view");
  });

  it("records the stated reason on every call, not just a generic marker", async () => {
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
      capabilities: [ADMIN_CAPABILITY.VIEW_ORGANIZATIONS],
      description: "",
    });
    const actor = makeActor(ADMIN_ROLE.GLOBAL_SUPER_ADMIN);
    await withCrossTenantRead({
      actor,
      capability: ADMIN_CAPABILITY.VIEW_ORGANIZATIONS,
      reason: "investigating a billing support ticket #4821",
      eventType: PLATFORM_EVENT_TYPE.CROSS_TENANT_READ,
      run: async () => "ok",
    });
    const log = await PlatformAuditLog.findOne({ actorId: actor.id });
    expect(log?.metadata?.reason).toBe("investigating a billing support ticket #4821");
  });

  it("never touches the tenant filter — countOrganizations counts across every tenant, proving no implicit scoping snuck in", async () => {
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
      capabilities: [ADMIN_CAPABILITY.VIEW_ORGANIZATIONS],
      description: "",
    });
    for (let i = 0; i < 5; i++) {
      await Organization.create({
        name: `Org ${i}`,
        subdomain: `org-${i}`,
        ownerUserId: new mongoose.Types.ObjectId(),
      });
    }
    const actor = makeActor(ADMIN_ROLE.GLOBAL_SUPER_ADMIN);
    expect(await countOrganizations(actor, "test")).toBe(5);
  });
});
