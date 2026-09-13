import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_adminsessions";

import AdminUser from "@/models/platform/AdminUser";
import AdminSession from "@/models/platform/AdminSession";
import AdminRole from "@/models/platform/AdminRole";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import { ADMIN_CAPABILITY, ADMIN_ROLE, ADMIN_USER_STATUS } from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";

let listAdminSessions: typeof import("@/lib/platform/auth/adminSessions").listAdminSessions;
let revokeAdminSessionAsAdmin: typeof import("@/lib/platform/auth/adminSessions").revokeAdminSessionAsAdmin;
let AdminSessionActionError: typeof import("@/lib/platform/auth/adminSessions").AdminSessionActionError;
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

describe("Phase 11 Part 1.6 — Admin Sessions view (source doc §25)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await AdminUser.init();
    await AdminSession.init();
    await AdminRole.init();
    await PlatformAuditLog.init();
    ({ listAdminSessions, revokeAdminSessionAsAdmin, AdminSessionActionError } = await import(
      "@/lib/platform/auth/adminSessions"
    ));
    ({ invalidateAdminRoleCache } = await import("@/lib/platform/auth/adminRbac"));
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
      capabilities: [ADMIN_CAPABILITY.VIEW_ADMIN_USERS, ADMIN_CAPABILITY.MANAGE_ADMIN_USERS],
      description: "",
    });
    await AdminRole.create({ role: ADMIN_ROLE.READ_ONLY_ADMIN, capabilities: [], description: "" });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await AdminUser.deleteMany({});
    await AdminSession.deleteMany({});
    await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
    invalidateAdminRoleCache();
  });

  async function seedAdmin() {
    return AdminUser.create({
      name: "Test Admin",
      email: `admin-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: "x",
      role: ADMIN_ROLE.GLOBAL_ADMIN,
      status: ADMIN_USER_STATUS.ACTIVE,
    });
  }

  it("lists sessions with the admin's own name/email/role joined in", async () => {
    const admin = await seedAdmin();
    await AdminSession.create({ adminUserId: admin._id, jti: "jti-1", ip: "1.1.1.1", expiresAt: new Date(Date.now() + 3600_000) });

    const result = await listAdminSessions(makeActor(), "test");
    expect(result).toHaveLength(1);
    expect(result[0].adminName).toBe("Test Admin");
    expect(result[0].isActive).toBe(true);
  });

  it("marks a session inactive once expired", async () => {
    const admin = await seedAdmin();
    await AdminSession.create({ adminUserId: admin._id, jti: "jti-1", expiresAt: new Date(Date.now() - 1000) });
    const result = await listAdminSessions(makeActor(), "test");
    expect(result[0].isActive).toBe(false);
  });

  it("marks a session inactive once revoked, even if not yet expired", async () => {
    const admin = await seedAdmin();
    await AdminSession.create({ adminUserId: admin._id, jti: "jti-1", expiresAt: new Date(Date.now() + 3600_000), revokedAt: new Date() });
    const result = await listAdminSessions(makeActor(), "test");
    expect(result[0].isActive).toBe(false);
  });

  it("does NOT flag the very first session an admin ever creates, even though it has no prior IP to compare against", async () => {
    const admin = await seedAdmin();
    await AdminSession.create({ adminUserId: admin._id, jti: "jti-1", ip: "1.1.1.1", expiresAt: new Date(Date.now() + 3600_000) });
    const result = await listAdminSessions(makeActor(), "test");
    expect(result[0].isNewIp).toBe(false);
  });

  it("flags a session from an IP this admin has never used in any earlier session", async () => {
    const admin = await seedAdmin();
    await AdminSession.create({ adminUserId: admin._id, jti: "jti-1", ip: "1.1.1.1", createdAt: new Date("2026-01-01"), expiresAt: new Date(Date.now() + 3600_000) });
    await AdminSession.create({ adminUserId: admin._id, jti: "jti-2", ip: "2.2.2.2", createdAt: new Date("2026-01-02"), expiresAt: new Date(Date.now() + 3600_000) });

    const result = await listAdminSessions(makeActor(), "test");
    const first = result.find((s) => s.ip === "1.1.1.1")!;
    const second = result.find((s) => s.ip === "2.2.2.2")!;
    expect(first.isNewIp).toBe(false);
    expect(second.isNewIp).toBe(true);
  });

  it("does not flag a session reusing an IP from an earlier session", async () => {
    const admin = await seedAdmin();
    await AdminSession.create({ adminUserId: admin._id, jti: "jti-1", ip: "1.1.1.1", createdAt: new Date("2026-01-01"), expiresAt: new Date(Date.now() + 3600_000) });
    await AdminSession.create({ adminUserId: admin._id, jti: "jti-2", ip: "1.1.1.1", createdAt: new Date("2026-01-02"), expiresAt: new Date(Date.now() + 3600_000) });

    const result = await listAdminSessions(makeActor(), "test");
    expect(result.every((s) => !s.isNewIp)).toBe(true);
  });

  it("denies an actor without VIEW_ADMIN_USERS", async () => {
    await expect(listAdminSessions(makeActor(ADMIN_ROLE.READ_ONLY_ADMIN), "test")).rejects.toThrow();
  });

  it("viewing sessions is itself audited", async () => {
    await listAdminSessions(makeActor(), "test");
    const audits = await PlatformAuditLog.find({ entityType: "AdminSession" });
    expect(audits.length).toBeGreaterThan(0);
  });

  describe("revokeAdminSessionAsAdmin", () => {
    it("revokes the session and audits it", async () => {
      const admin = await seedAdmin();
      const session = await AdminSession.create({ adminUserId: admin._id, jti: "jti-1", expiresAt: new Date(Date.now() + 3600_000) });

      await revokeAdminSessionAsAdmin(makeActor(), String(session._id), "compromised device");

      const updated = await AdminSession.findById(session._id);
      expect(updated!.revokedAt).toBeDefined();
      expect(updated!.revokedReason).toBe("compromised device");

      const audits = await PlatformAuditLog.find({ eventType: "session_revoked" });
      expect(audits).toHaveLength(1);
    });

    it("requires a reason", async () => {
      const admin = await seedAdmin();
      const session = await AdminSession.create({ adminUserId: admin._id, jti: "jti-1", expiresAt: new Date(Date.now() + 3600_000) });
      await expect(revokeAdminSessionAsAdmin(makeActor(), String(session._id), "")).rejects.toThrow(AdminSessionActionError);
    });

    it("denies an actor without MANAGE_ADMIN_USERS", async () => {
      const admin = await seedAdmin();
      const session = await AdminSession.create({ adminUserId: admin._id, jti: "jti-1", expiresAt: new Date(Date.now() + 3600_000) });
      await expect(revokeAdminSessionAsAdmin(makeActor(ADMIN_ROLE.READ_ONLY_ADMIN), String(session._id), "test")).rejects.toThrow();
    });

    it("errors on a nonexistent session", async () => {
      await expect(
        revokeAdminSessionAsAdmin(makeActor(), String(new mongoose.Types.ObjectId()), "test"),
      ).rejects.toThrow(AdminSessionActionError);
    });
  });
});
