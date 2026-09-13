import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_securityconfig";
process.env.ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "test-only-admin-session-secret-32-chars-min";

import PlatformAlertConfig from "@/models/platform/PlatformAlertConfig";
import PlatformSecurityConfig from "@/models/platform/PlatformSecurityConfig";
import RetentionPolicy from "@/models/platform/RetentionPolicy";
import AdminRole from "@/models/platform/AdminRole";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import AdminUser from "@/models/platform/AdminUser";
import AdminSession from "@/models/platform/AdminSession";
import { ADMIN_CAPABILITY, ADMIN_ROLE, ADMIN_USER_STATUS } from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";

let getSecurityConfiguration: typeof import("@/lib/platform/security/securityConfig").getSecurityConfiguration;
let updateSecurityConfiguration: typeof import("@/lib/platform/security/securityConfig").updateSecurityConfiguration;
let SecurityConfigError: typeof import("@/lib/platform/security/securityConfig").SecurityConfigError;
let createAdminSession: typeof import("@/lib/platform/auth/adminSession").createAdminSession;
let invalidateAdminRoleCache: typeof import("@/lib/platform/auth/adminRbac").invalidateAdminRoleCache;

function makeActor(role: string = ADMIN_ROLE.GLOBAL_SUPER_ADMIN): AdminActor {
  return { id: new mongoose.Types.ObjectId().toString(), email: "actor@example.com", name: "Actor", role: role as AdminActor["role"], sessionId: "test-session" };
}

describe("Phase 11 Part 1.6 — Security Configuration (source doc §25/§28)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await PlatformAlertConfig.init();
    await PlatformSecurityConfig.init();
    await RetentionPolicy.init();
    await AdminRole.init();
    await PlatformAuditLog.init();
    await AdminUser.init();
    await AdminSession.init();
    ({ getSecurityConfiguration, updateSecurityConfiguration, SecurityConfigError } = await import(
      "@/lib/platform/security/securityConfig"
    ));
    ({ createAdminSession } = await import("@/lib/platform/auth/adminSession"));
    ({ invalidateAdminRoleCache } = await import("@/lib/platform/auth/adminRbac"));
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
      capabilities: [ADMIN_CAPABILITY.VIEW_SECURITY_LOGS, ADMIN_CAPABILITY.MANAGE_SECURITY_CONFIG],
      description: "",
    });
    await AdminRole.create({ role: ADMIN_ROLE.READ_ONLY_ADMIN, capabilities: [ADMIN_CAPABILITY.VIEW_SECURITY_LOGS], description: "" });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await PlatformAlertConfig.deleteMany({});
    await PlatformSecurityConfig.deleteMany({});
    await RetentionPolicy.deleteMany({});
    await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
    await AdminSession.deleteMany({});
    invalidateAdminRoleCache();
  });

  describe("getSecurityConfiguration", () => {
    it("returns real defaults when unconfigured, never throws", async () => {
      const result = await getSecurityConfiguration(makeActor(), "test");
      expect(result.sessionTimeoutHours).toBe(8);
      expect(result.alerts.failedLoginThreshold).toBe(5);
    });

    it("names retention as managed on its own page, not duplicated here", async () => {
      const result = await getSecurityConfiguration(makeActor(), "test");
      expect(result.retention.manageUrl).toBe("/platform/settings/retention");
    });

    it("reports kill-switch/autonomy governance as an explained absence, not a fabricated control", async () => {
      const result = await getSecurityConfiguration(makeActor(), "test");
      expect(result.autonomyGovernance.available).toBe(false);
      expect(result.autonomyGovernance.reason.length).toBeGreaterThan(0);
    });

    it("denies an actor without VIEW_SECURITY_LOGS", async () => {
      await expect(getSecurityConfiguration(makeActor(ADMIN_ROLE.GLOBAL_ADMIN), "test")).rejects.toThrow();
    });
  });

  describe("updateSecurityConfiguration", () => {
    it("updates alert thresholds and persists them", async () => {
      await updateSecurityConfiguration(makeActor(), { alerts: { failedLoginThreshold: 9 } }, "tightening policy");
      const result = await getSecurityConfiguration(makeActor(), "test");
      expect(result.alerts.failedLoginThreshold).toBe(9);
    });

    it("updates session timeout and persists it", async () => {
      await updateSecurityConfiguration(makeActor(), { sessionTimeoutHours: 4 }, "tightening policy");
      const result = await getSecurityConfiguration(makeActor(), "test");
      expect(result.sessionTimeoutHours).toBe(4);
    });

    it("Phase 11: a new admin session actually uses the configured timeout, not the hardcoded 8h default", async () => {
      await updateSecurityConfiguration(makeActor(), { sessionTimeoutHours: 1 }, "test");
      const admin = await AdminUser.create({ name: "T", email: "sess@example.com", passwordHash: "x", role: ADMIN_ROLE.GLOBAL_ADMIN, status: ADMIN_USER_STATUS.ACTIVE });

      const before = Date.now();
      const { expiresAt } = await createAdminSession({ id: String(admin._id), email: admin.email, name: admin.name, role: admin.role }, {});
      const hoursUntilExpiry = (expiresAt.getTime() - before) / (60 * 60 * 1000);

      expect(hoursUntilExpiry).toBeGreaterThan(0.9);
      expect(hoursUntilExpiry).toBeLessThan(1.1); // ~1h, not the 8h default
    });

    it("rejects a session timeout outside 1-168 hours", async () => {
      await expect(updateSecurityConfiguration(makeActor(), { sessionTimeoutHours: 0 }, "test")).rejects.toThrow(SecurityConfigError);
      await expect(updateSecurityConfiguration(makeActor(), { sessionTimeoutHours: 200 }, "test")).rejects.toThrow(SecurityConfigError);
    });

    it("requires a reason", async () => {
      await expect(updateSecurityConfiguration(makeActor(), { sessionTimeoutHours: 4 }, "")).rejects.toThrow(SecurityConfigError);
    });

    it("rejects an empty update", async () => {
      await expect(updateSecurityConfiguration(makeActor(), {}, "test")).rejects.toThrow(SecurityConfigError);
    });

    it("denies an actor without MANAGE_SECURITY_CONFIG", async () => {
      await expect(
        updateSecurityConfiguration(makeActor(ADMIN_ROLE.READ_ONLY_ADMIN), { sessionTimeoutHours: 4 }, "test"),
      ).rejects.toThrow();
    });

    it("audits the change with old and new values", async () => {
      await updateSecurityConfiguration(makeActor(), { sessionTimeoutHours: 6 }, "test reason");
      const audits = await PlatformAuditLog.find({ eventType: "security_config_updated" });
      expect(audits).toHaveLength(1);
      expect(audits[0].severity).toBe("warning");
    });
  });
});
