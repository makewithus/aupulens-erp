import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_adminusers";

import AdminUser from "@/models/platform/AdminUser";
import AdminRole from "@/models/platform/AdminRole";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import { ADMIN_CAPABILITY, ADMIN_ROLE, ADMIN_USER_STATUS } from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";

let listAdminUsers: typeof import("@/lib/platform/auth/adminUsers").listAdminUsers;
let createAdminUser: typeof import("@/lib/platform/auth/adminUsers").createAdminUser;
let updateAdminUserRole: typeof import("@/lib/platform/auth/adminUsers").updateAdminUserRole;
let suspendAdminUser: typeof import("@/lib/platform/auth/adminUsers").suspendAdminUser;
let reactivateAdminUser: typeof import("@/lib/platform/auth/adminUsers").reactivateAdminUser;
let resetAdminUserMfa: typeof import("@/lib/platform/auth/adminUsers").resetAdminUserMfa;
let AdminUserActionError: typeof import("@/lib/platform/auth/adminUsers").AdminUserActionError;
let invalidateAdminRoleCache: typeof import("@/lib/platform/auth/adminRbac").invalidateAdminRoleCache;

function makeActor(id: string, role: string = ADMIN_ROLE.GLOBAL_SUPER_ADMIN): AdminActor {
  return { id, email: "actor@example.com", name: "Actor", role: role as AdminActor["role"], sessionId: "test-session" };
}

describe("Phase 11 Part 1.6 — Manage Global Admins (source doc §25, user-scoped decision)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await AdminUser.init();
    await AdminRole.init();
    await PlatformAuditLog.init();
    ({
      listAdminUsers,
      createAdminUser,
      updateAdminUserRole,
      suspendAdminUser,
      reactivateAdminUser,
      resetAdminUserMfa,
      AdminUserActionError,
    } = await import("@/lib/platform/auth/adminUsers"));
    ({ invalidateAdminRoleCache } = await import("@/lib/platform/auth/adminRbac"));
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
      capabilities: [ADMIN_CAPABILITY.VIEW_ADMIN_USERS, ADMIN_CAPABILITY.MANAGE_ADMIN_USERS],
      description: "",
    });
    await AdminRole.create({ role: ADMIN_ROLE.GLOBAL_ADMIN, capabilities: [ADMIN_CAPABILITY.VIEW_ADMIN_USERS], description: "" });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await AdminUser.deleteMany({});
    await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
    invalidateAdminRoleCache();
  });

  async function seedSuperAdmin() {
    return AdminUser.create({
      name: "Existing Super",
      email: `super-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: "x",
      role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
      status: ADMIN_USER_STATUS.ACTIVE,
    });
  }

  describe("createAdminUser", () => {
    it("creates a real AdminUser with mfaEnabled: false and audits it", async () => {
      const actorDoc = await seedSuperAdmin();
      const actor = makeActor(String(actorDoc._id));

      const result = await createAdminUser(actor, { name: "New Admin", email: "new@example.com", password: "twelvecharspw", role: ADMIN_ROLE.GLOBAL_ADMIN }, "onboarding a colleague");

      const created = await AdminUser.findById(result.id);
      expect(created!.email).toBe("new@example.com");
      expect(created!.mfaEnabled).toBe(false);
      expect(created!.status).toBe(ADMIN_USER_STATUS.ACTIVE);

      const audits = await PlatformAuditLog.find({ eventType: "admin_user_created" });
      expect(audits).toHaveLength(1);
    });

    it("rejects a password under 12 characters", async () => {
      const actorDoc = await seedSuperAdmin();
      const actor = makeActor(String(actorDoc._id));
      await expect(
        createAdminUser(actor, { name: "N", email: "short@example.com", password: "short", role: ADMIN_ROLE.GLOBAL_ADMIN }, "test"),
      ).rejects.toThrow(AdminUserActionError);
    });

    it("rejects a duplicate email", async () => {
      const actorDoc = await seedSuperAdmin();
      const actor = makeActor(String(actorDoc._id));
      await createAdminUser(actor, { name: "First", email: "dup@example.com", password: "twelvecharspw", role: ADMIN_ROLE.GLOBAL_ADMIN }, "test");
      await expect(
        createAdminUser(actor, { name: "Second", email: "dup@example.com", password: "twelvecharspw", role: ADMIN_ROLE.GLOBAL_ADMIN }, "test"),
      ).rejects.toThrow(AdminUserActionError);
    });

    it("denies an actor without MANAGE_ADMIN_USERS (e.g. GLOBAL_ADMIN, per the user's 'GLOBAL_SUPER_ADMIN only' scoping)", async () => {
      const actor = makeActor(new mongoose.Types.ObjectId().toString(), ADMIN_ROLE.GLOBAL_ADMIN);
      await expect(
        createAdminUser(actor, { name: "N", email: "x@example.com", password: "twelvecharspw", role: ADMIN_ROLE.GLOBAL_ADMIN }, "test"),
      ).rejects.toThrow();
    });
  });

  describe("updateAdminUserRole", () => {
    it("changes the role and audits old/new", async () => {
      const actorDoc = await seedSuperAdmin();
      const target = await AdminUser.create({ name: "T", email: "t@example.com", passwordHash: "x", role: ADMIN_ROLE.READ_ONLY_ADMIN, status: ADMIN_USER_STATUS.ACTIVE });
      const actor = makeActor(String(actorDoc._id));

      await updateAdminUserRole(actor, String(target._id), ADMIN_ROLE.BILLING_ADMIN, "promoted");

      const updated = await AdminUser.findById(target._id);
      expect(updated!.role).toBe(ADMIN_ROLE.BILLING_ADMIN);
      const audits = await PlatformAuditLog.find({ eventType: "admin_user_role_changed" });
      expect(audits).toHaveLength(1);
      expect((audits[0].oldValue as any).role).toBe(ADMIN_ROLE.READ_ONLY_ADMIN);
      expect((audits[0].newValue as any).role).toBe(ADMIN_ROLE.BILLING_ADMIN);
    });

    it("Phase 11 Part 1.6 safety guard: refuses to demote the last active GLOBAL_SUPER_ADMIN", async () => {
      const onlySuper = await seedSuperAdmin();
      const actor = makeActor(String(onlySuper._id));

      await expect(updateAdminUserRole(actor, String(onlySuper._id), ADMIN_ROLE.GLOBAL_ADMIN, "test")).rejects.toThrow(AdminUserActionError);

      const stillSuper = await AdminUser.findById(onlySuper._id);
      expect(stillSuper!.role).toBe(ADMIN_ROLE.GLOBAL_SUPER_ADMIN);
    });

    it("allows demoting a GLOBAL_SUPER_ADMIN when another active one still exists", async () => {
      const superA = await seedSuperAdmin();
      const superB = await seedSuperAdmin();
      const actor = makeActor(String(superA._id));

      await updateAdminUserRole(actor, String(superB._id), ADMIN_ROLE.GLOBAL_ADMIN, "test");

      const updated = await AdminUser.findById(superB._id);
      expect(updated!.role).toBe(ADMIN_ROLE.GLOBAL_ADMIN);
    });
  });

  describe("suspendAdminUser / reactivateAdminUser", () => {
    it("suspends a target admin and audits it with WARNING severity", async () => {
      const actorDoc = await seedSuperAdmin();
      const target = await AdminUser.create({ name: "T", email: "t2@example.com", passwordHash: "x", role: ADMIN_ROLE.READ_ONLY_ADMIN, status: ADMIN_USER_STATUS.ACTIVE });
      const actor = makeActor(String(actorDoc._id));

      await suspendAdminUser(actor, String(target._id), "leaver");

      const updated = await AdminUser.findById(target._id);
      expect(updated!.status).toBe(ADMIN_USER_STATUS.SUSPENDED);
      const audits = await PlatformAuditLog.find({ eventType: "admin_user_suspended" });
      expect(audits[0].severity).toBe("warning");
    });

    it("reactivates a suspended admin", async () => {
      const actorDoc = await seedSuperAdmin();
      const target = await AdminUser.create({ name: "T", email: "t3@example.com", passwordHash: "x", role: ADMIN_ROLE.READ_ONLY_ADMIN, status: ADMIN_USER_STATUS.SUSPENDED });
      const actor = makeActor(String(actorDoc._id));

      await reactivateAdminUser(actor, String(target._id), "returning");

      const updated = await AdminUser.findById(target._id);
      expect(updated!.status).toBe(ADMIN_USER_STATUS.ACTIVE);
    });

    it("Phase 11 Part 1.6 safety guard: an admin cannot suspend their own account", async () => {
      const self = await seedSuperAdmin();
      const actor = makeActor(String(self._id));
      await expect(suspendAdminUser(actor, String(self._id), "test")).rejects.toThrow(AdminUserActionError);
    });

    it("Phase 11 Part 1.6 safety guard: refuses to suspend the last active GLOBAL_SUPER_ADMIN, even when a different actor is doing it", async () => {
      const onlySuper = await seedSuperAdmin();
      // A distinct actor id (not onlySuper's own) so this exercises the LAST-ACTIVE guard
      // specifically, not the separate "cannot suspend your own account" guard.
      const actingActor = makeActor(new mongoose.Types.ObjectId().toString());

      await expect(suspendAdminUser(actingActor, String(onlySuper._id), "test")).rejects.toThrow(AdminUserActionError);

      const stillActive = await AdminUser.findById(onlySuper._id);
      expect(stillActive!.status).toBe(ADMIN_USER_STATUS.ACTIVE);
    });

    it("allows suspending a GLOBAL_SUPER_ADMIN when another active one still exists", async () => {
      const superA = await seedSuperAdmin();
      const superB = await seedSuperAdmin();
      const actorA = makeActor(String(superA._id));

      await suspendAdminUser(actorA, String(superB._id), "test");

      const superBAfter = await AdminUser.findById(superB._id);
      expect(superBAfter!.status).toBe(ADMIN_USER_STATUS.SUSPENDED);
    });
  });

  describe("resetAdminUserMfa", () => {
    it("clears MFA enrollment and audits it", async () => {
      const actorDoc = await seedSuperAdmin();
      const target = await AdminUser.create({
        name: "T",
        email: "t4@example.com",
        passwordHash: "x",
        role: ADMIN_ROLE.READ_ONLY_ADMIN,
        status: ADMIN_USER_STATUS.ACTIVE,
        mfaEnabled: true,
        mfaSecretEncrypted: "encrypted-secret",
        mfaBackupCodeHashes: ["hash1", "hash2"],
      });
      const actor = makeActor(String(actorDoc._id));

      await resetAdminUserMfa(actor, String(target._id), "lost device");

      const updated = await AdminUser.findById(target._id);
      expect(updated!.mfaEnabled).toBe(false);
      expect(updated!.mfaSecretEncrypted).toBeUndefined();
      expect(updated!.mfaBackupCodeHashes).toEqual([]);

      const audits = await PlatformAuditLog.find({ eventType: "mfa_reset" });
      expect(audits).toHaveLength(1);
    });
  });

  describe("listAdminUsers", () => {
    it("never returns passwordHash or the raw MFA secret", async () => {
      const actorDoc = await seedSuperAdmin();
      const actor = makeActor(String(actorDoc._id));
      const result = await listAdminUsers(actor, "test");
      expect(result.every((a) => !("passwordHash" in a))).toBe(true);
      expect(result.every((a) => !("mfaSecretEncrypted" in a))).toBe(true);
    });
  });
});
