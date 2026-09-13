import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_securitylog";

import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import AdminRole from "@/models/platform/AdminRole";
import { ADMIN_CAPABILITY, ADMIN_ROLE, PLATFORM_EVENT_CATEGORY, PLATFORM_EVENT_TYPE, PLATFORM_SEVERITY } from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";

let searchSecurityEvents: typeof import("@/lib/platform/audit/search").searchSecurityEvents;
let searchPlatformAuditLogs: typeof import("@/lib/platform/audit/search").searchPlatformAuditLogs;
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

describe("Phase 11 Part 1.4 — searchSecurityEvents (docs/admin/DECISIONS.md #1)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await PlatformAuditLog.init();
    await AdminRole.init();
    ({ searchSecurityEvents, searchPlatformAuditLogs } = await import("@/lib/platform/audit/search"));
    ({ invalidateAdminRoleCache } = await import("@/lib/platform/auth/adminRbac"));
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
      capabilities: [ADMIN_CAPABILITY.VIEW_SECURITY_LOGS, ADMIN_CAPABILITY.VIEW_AUDIT_LOGS],
      description: "",
    });
    await AdminRole.create({ role: ADMIN_ROLE.READ_ONLY_ADMIN, capabilities: [ADMIN_CAPABILITY.VIEW_AUDIT_LOGS], description: "" });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
    invalidateAdminRoleCache();
  });

  async function seedRow(overrides: Partial<{ eventCategory: string; severity: string; tenantId: string }> = {}) {
    await PlatformAuditLog.create({
      tenantId: overrides.tenantId ?? "acme",
      actorId: "actor-1",
      actorType: "admin",
      actorRole: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
      eventCategory: overrides.eventCategory ?? PLATFORM_EVENT_CATEGORY.ORGANISATION,
      eventType: PLATFORM_EVENT_TYPE.ORGANIZATION_VIEWED,
      severity: overrides.severity ?? PLATFORM_SEVERITY.INFO,
      entityType: "Organization",
      entityId: "acme",
    });
  }

  it("includes a row whose eventCategory is SECURITY, even if its severity is not", async () => {
    await seedRow({ eventCategory: PLATFORM_EVENT_CATEGORY.SECURITY, severity: PLATFORM_SEVERITY.WARNING });
    const result = await searchSecurityEvents(makeActor(), "test", {});
    expect(result.total).toBe(1);
  });

  it("includes a row whose severity is SECURITY, even if its eventCategory is something else entirely — the exact resolveEntitlements() error-fallback shape", async () => {
    await seedRow({ eventCategory: PLATFORM_EVENT_CATEGORY.SUBSCRIPTION, severity: PLATFORM_SEVERITY.SECURITY });
    const result = await searchSecurityEvents(makeActor(), "test", {});
    expect(result.total).toBe(1);
  });

  it("excludes an ordinary row that is neither", async () => {
    await seedRow({ eventCategory: PLATFORM_EVENT_CATEGORY.ORGANISATION, severity: PLATFORM_SEVERITY.INFO });
    const result = await searchSecurityEvents(makeActor(), "test", {});
    expect(result.total).toBe(0);
  });

  it("filters by tenantId", async () => {
    await seedRow({ eventCategory: PLATFORM_EVENT_CATEGORY.SECURITY, tenantId: "acme" });
    await seedRow({ eventCategory: PLATFORM_EVENT_CATEGORY.SECURITY, tenantId: "other" });
    const result = await searchSecurityEvents(makeActor(), "test", { tenantId: "acme" });
    expect(result.total).toBe(1);
    expect(result.rows[0].tenantId).toBe("acme");
  });

  it("is gated on VIEW_SECURITY_LOGS specifically, not VIEW_AUDIT_LOGS — denies a role that has only the latter", async () => {
    await seedRow({ eventCategory: PLATFORM_EVENT_CATEGORY.SECURITY });
    await expect(searchSecurityEvents(makeActor(ADMIN_ROLE.READ_ONLY_ADMIN), "test", {})).rejects.toThrow();
    // Sanity: the same actor CAN reach the ordinary audit log search, proving the two are genuinely distinct gates.
    await expect(searchPlatformAuditLogs(makeActor(ADMIN_ROLE.READ_ONLY_ADMIN), "test", {})).resolves.toBeDefined();
  });

  it("viewing the security log is itself audited (source doc §6) — a second row appears after the read", async () => {
    await seedRow({ eventCategory: PLATFORM_EVENT_CATEGORY.SECURITY });
    const before = await PlatformAuditLog.countDocuments({});
    await searchSecurityEvents(makeActor(), "test", {});
    const after = await PlatformAuditLog.countDocuments({});
    expect(after).toBe(before + 1);
  });
});
