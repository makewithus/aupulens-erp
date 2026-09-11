import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_accessrequest";

import AdminAccessRequest from "@/models/platform/AdminAccessRequest";
import AdminRole from "@/models/platform/AdminRole";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import {
  ADMIN_ACCESS_SCOPE,
  ADMIN_CAPABILITY,
  ADMIN_ROLE,
  PLATFORM_EVENT_TYPE,
} from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";

let invalidateAdminRoleCache: typeof import("@/lib/platform/auth/adminRbac").invalidateAdminRoleCache;
let requestOrgAccess: typeof import("@/lib/platform/access/request").requestOrgAccess;
let approveOrgAccess: typeof import("@/lib/platform/access/request").approveOrgAccess;
let denyOrgAccess: typeof import("@/lib/platform/access/request").denyOrgAccess;
let endOrgAccessSession: typeof import("@/lib/platform/access/request").endOrgAccessSession;
let AccessRequestError: typeof import("@/lib/platform/access/request").AccessRequestError;
let getActiveAccessGrant: typeof import("@/lib/platform/access/status").getActiveAccessGrant;

function makeActor(role: string, id?: string): AdminActor {
  return {
    id: id ?? new mongoose.Types.ObjectId().toString(),
    email: "actor@example.com",
    name: "Actor",
    role: role as AdminActor["role"],
    sessionId: "test-session",
  };
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  await AdminAccessRequest.init();
  await AdminRole.init();
  await PlatformAuditLog.init();
  ({ requestOrgAccess, approveOrgAccess, denyOrgAccess, endOrgAccessSession, AccessRequestError } =
    await import("@/lib/platform/access/request"));
  ({ getActiveAccessGrant } = await import("@/lib/platform/access/status"));
  ({ invalidateAdminRoleCache } = await import("@/lib/platform/auth/adminRbac"));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

afterEach(async () => {
  await AdminAccessRequest.deleteMany({});
  await AdminRole.deleteMany({});
  await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
  invalidateAdminRoleCache();
});

async function seedSupportAdminRole() {
  await AdminRole.create({
    role: ADMIN_ROLE.SUPPORT_ADMIN,
    capabilities: [ADMIN_CAPABILITY.REQUEST_ORG_ACCESS, ADMIN_CAPABILITY.IMPERSONATE_READONLY],
    description: "",
  });
}
async function seedSecurityAdminRole() {
  await AdminRole.create({
    role: ADMIN_ROLE.SECURITY_ADMIN,
    capabilities: [ADMIN_CAPABILITY.APPROVE_ORG_ACCESS],
    description: "",
  });
}

describe("requestOrgAccess — reason required, write scope gated", () => {
  it("creates a pending request and audits it", async () => {
    await seedSupportAdminRole();
    const actor = makeActor(ADMIN_ROLE.SUPPORT_ADMIN);
    const id = await requestOrgAccess(actor, "acme", "investigating a support ticket", ADMIN_ACCESS_SCOPE.READ);
    const request = await AdminAccessRequest.findById(id);
    expect(request!.status).toBe("pending");

    const logs = await PlatformAuditLog.find({ entityId: id });
    expect(logs).toHaveLength(1);
    expect(logs[0].eventType).toBe(PLATFORM_EVENT_TYPE.ORG_ACCESS_REQUESTED);
  });

  it("rejects a request with no reason", async () => {
    await seedSupportAdminRole();
    await expect(
      requestOrgAccess(makeActor(ADMIN_ROLE.SUPPORT_ADMIN), "acme", "", ADMIN_ACCESS_SCOPE.READ),
    ).rejects.toThrow(AccessRequestError);
  });

  it("rejects a write-scope request from a role without IMPERSONATE_WRITE (Part 2.7: never SUPPORT_ADMIN/READ_ONLY_ADMIN)", async () => {
    await seedSupportAdminRole();
    await expect(
      requestOrgAccess(makeActor(ADMIN_ROLE.SUPPORT_ADMIN), "acme", "need to fix something", ADMIN_ACCESS_SCOPE.WRITE),
    ).rejects.toThrow(AccessRequestError);
  });

  it("allows a write-scope request from a role WITH IMPersonate_WRITE", async () => {
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_ADMIN,
      capabilities: [ADMIN_CAPABILITY.REQUEST_ORG_ACCESS, ADMIN_CAPABILITY.IMPERSONATE_WRITE],
      description: "",
    });
    const id = await requestOrgAccess(makeActor(ADMIN_ROLE.GLOBAL_ADMIN), "acme", "emergency fix", ADMIN_ACCESS_SCOPE.WRITE);
    const request = await AdminAccessRequest.findById(id);
    expect(request!.requestedScope).toBe("write");
  });

  it("denies an actor without REQUEST_ORG_ACCESS entirely", async () => {
    await AdminRole.create({ role: ADMIN_ROLE.READ_ONLY_ADMIN, capabilities: [], description: "" });
    await expect(
      requestOrgAccess(makeActor(ADMIN_ROLE.READ_ONLY_ADMIN), "acme", "test", ADMIN_ACCESS_SCOPE.READ),
    ).rejects.toThrow();
  });
});

describe("approveOrgAccess / denyOrgAccess / endOrgAccessSession — full lifecycle, time-boxed, fully audited", () => {
  it("approving creates a time-boxed grant (never open-ended) and starts an active session", async () => {
    await seedSupportAdminRole();
    await seedSecurityAdminRole();
    const requester = makeActor(ADMIN_ROLE.SUPPORT_ADMIN);
    const approver = makeActor(ADMIN_ROLE.SECURITY_ADMIN);

    const id = await requestOrgAccess(requester, "acme", "support ticket #42", ADMIN_ACCESS_SCOPE.READ);
    await approveOrgAccess(approver, id);

    const request = await AdminAccessRequest.findById(id);
    expect(request!.status).toBe("approved");
    expect(request!.expiresAt).toBeInstanceOf(Date);
    expect(request!.grantedAt).toBeInstanceOf(Date);

    const grant = await getActiveAccessGrant(requester.id, "acme");
    expect(grant).not.toBeNull();
    expect(grant!.reason).toBe("support ticket #42");

    const startedLogs = await PlatformAuditLog.find({ eventType: PLATFORM_EVENT_TYPE.ORG_ACCESS_SESSION_STARTED });
    expect(startedLogs).toHaveLength(1);
    const approvedLogs = await PlatformAuditLog.find({ eventType: PLATFORM_EVENT_TYPE.ORG_ACCESS_APPROVED });
    expect(approvedLogs).toHaveLength(1);
  });

  it("a grant with an expiresAt in the past is NOT active — proven with a real past timestamp, not a short sleep", async () => {
    await seedSupportAdminRole();
    await seedSecurityAdminRole();
    const requester = makeActor(ADMIN_ROLE.SUPPORT_ADMIN);
    const id = await requestOrgAccess(requester, "acme", "test", ADMIN_ACCESS_SCOPE.READ);
    await approveOrgAccess(makeActor(ADMIN_ROLE.SECURITY_ADMIN), id);

    // Force the expiry into the past directly (bypassing the 4h default) —
    // simulates time having passed without an artificial test sleep.
    await AdminAccessRequest.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: { expiresAt: new Date(Date.now() - 60 * 1000) } },
    );

    const grant = await getActiveAccessGrant(requester.id, "acme");
    expect(grant).toBeNull(); // expired, even though status field still says "approved"
  });

  it("denying leaves no active grant", async () => {
    await seedSupportAdminRole();
    await seedSecurityAdminRole();
    const requester = makeActor(ADMIN_ROLE.SUPPORT_ADMIN);
    const id = await requestOrgAccess(requester, "acme", "test", ADMIN_ACCESS_SCOPE.READ);
    await denyOrgAccess(makeActor(ADMIN_ROLE.SECURITY_ADMIN), id, "not justified");

    const request = await AdminAccessRequest.findById(id);
    expect(request!.status).toBe("denied");
    expect(await getActiveAccessGrant(requester.id, "acme")).toBeNull();

    const logs = await PlatformAuditLog.find({ eventType: PLATFORM_EVENT_TYPE.ORG_ACCESS_DENIED });
    expect(logs).toHaveLength(1);
  });

  it("ending a session early makes it immediately inactive", async () => {
    await seedSupportAdminRole();
    await seedSecurityAdminRole();
    const requester = makeActor(ADMIN_ROLE.SUPPORT_ADMIN);
    const id = await requestOrgAccess(requester, "acme", "test", ADMIN_ACCESS_SCOPE.READ);
    await approveOrgAccess(makeActor(ADMIN_ROLE.SECURITY_ADMIN), id);
    expect(await getActiveAccessGrant(requester.id, "acme")).not.toBeNull();

    await endOrgAccessSession(requester, id); // the admin ends their own session

    expect(await getActiveAccessGrant(requester.id, "acme")).toBeNull();
    const request = await AdminAccessRequest.findById(id);
    expect(request!.status).toBe("ended");
    expect(request!.endedAt).toBeInstanceOf(Date);
  });

  it("cannot approve an already-approved request", async () => {
    await seedSupportAdminRole();
    await seedSecurityAdminRole();
    const id = await requestOrgAccess(makeActor(ADMIN_ROLE.SUPPORT_ADMIN), "acme", "test", ADMIN_ACCESS_SCOPE.READ);
    const approver = makeActor(ADMIN_ROLE.SECURITY_ADMIN);
    await approveOrgAccess(approver, id);
    await expect(approveOrgAccess(approver, id)).rejects.toThrow(AccessRequestError);
  });

  it("denies approval from an actor without APPROVE_ORG_ACCESS", async () => {
    await seedSupportAdminRole();
    await AdminRole.create({ role: ADMIN_ROLE.READ_ONLY_ADMIN, capabilities: [], description: "" });
    const id = await requestOrgAccess(makeActor(ADMIN_ROLE.SUPPORT_ADMIN), "acme", "test", ADMIN_ACCESS_SCOPE.READ);
    await expect(approveOrgAccess(makeActor(ADMIN_ROLE.READ_ONLY_ADMIN), id)).rejects.toThrow();
  });

  it("a different tenant's grant does not leak into this tenant's active-grant check", async () => {
    await seedSupportAdminRole();
    await seedSecurityAdminRole();
    const requester = makeActor(ADMIN_ROLE.SUPPORT_ADMIN);
    const id = await requestOrgAccess(requester, "acme", "test", ADMIN_ACCESS_SCOPE.READ);
    await approveOrgAccess(makeActor(ADMIN_ROLE.SECURITY_ADMIN), id);

    expect(await getActiveAccessGrant(requester.id, "acme")).not.toBeNull();
    expect(await getActiveAccessGrant(requester.id, "globex")).toBeNull();
  });
});
