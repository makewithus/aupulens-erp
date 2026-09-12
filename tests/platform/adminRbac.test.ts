import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_rbac";

import AdminRole from "@/models/platform/AdminRole";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import PlatformAlert from "@/models/platform/PlatformAlert";
import {
  ADMIN_CAPABILITY,
  ADMIN_ROLE,
  ADMIN_ROLE_VALUES,
} from "@/lib/constants/statuses";

// Dynamic import: lib/platform/auth/adminRbac.ts transitively imports
// lib/db.ts, which reads process.env.MONGODB_URI eagerly at module-evaluation
// time. ESM import instantiation runs before this file's own top-level
// `process.env.MONGODB_URI = ...` assignment above, so a static import here
// would throw before the override takes effect — matching why every existing
// route test in this repo imports its route handler dynamically inside
// beforeAll instead of statically at the top of the file.
let hasCapability: typeof import("@/lib/platform/auth/adminRbac").hasCapability;
let invalidateAdminRoleCache: typeof import("@/lib/platform/auth/adminRbac").invalidateAdminRoleCache;
let requireCapability: typeof import("@/lib/platform/auth/adminRbac").requireCapability;
let AdminForbiddenError: typeof import("@/lib/platform/auth/adminRbac").AdminForbiddenError;

describe("adminRbac — §30 permission matrix, read as data", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await AdminRole.init();
    await PlatformAuditLog.init();
    await PlatformAlert.init();
    ({ hasCapability, invalidateAdminRoleCache, requireCapability, AdminForbiddenError } =
      await import("@/lib/platform/auth/adminRbac"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await AdminRole.deleteMany({});
    await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
    await PlatformAlert.deleteMany({});
    invalidateAdminRoleCache();
  });

  it("grants a capability explicitly listed for the role", async () => {
    await AdminRole.create({
      role: ADMIN_ROLE.BILLING_ADMIN,
      capabilities: [ADMIN_CAPABILITY.MANAGE_BILLING, ADMIN_CAPABILITY.VIEW_BILLING],
      description: "test",
    });
    const allowed = await hasCapability(
      { role: ADMIN_ROLE.BILLING_ADMIN },
      ADMIN_CAPABILITY.MANAGE_BILLING,
    );
    expect(allowed).toBe(true);
  });

  it("denies a capability not listed for the role", async () => {
    await AdminRole.create({
      role: ADMIN_ROLE.BILLING_ADMIN,
      capabilities: [ADMIN_CAPABILITY.MANAGE_BILLING],
      description: "test",
    });
    const allowed = await hasCapability(
      { role: ADMIN_ROLE.BILLING_ADMIN },
      ADMIN_CAPABILITY.DELETE_ORGANIZATION,
    );
    expect(allowed).toBe(false);
  });

  it("denies everything for a role with no AdminRole row seeded", async () => {
    const allowed = await hasCapability(
      { role: ADMIN_ROLE.READ_ONLY_ADMIN },
      ADMIN_CAPABILITY.VIEW_DASHBOARD,
    );
    expect(allowed).toBe(false); // fail closed, never fail open
  });

  it("requireCapability throws AdminForbiddenError on denial", async () => {
    await expect(
      requireCapability({ role: ADMIN_ROLE.READ_ONLY_ADMIN }, ADMIN_CAPABILITY.DELETE_ORGANIZATION),
    ).rejects.toThrow(AdminForbiddenError);
  });

  it("requireCapability resolves silently on allow", async () => {
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
      capabilities: [ADMIN_CAPABILITY.DELETE_ORGANIZATION],
      description: "test",
    });
    await expect(
      requireCapability({ role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN }, ADMIN_CAPABILITY.DELETE_ORGANIZATION),
    ).resolves.toBeUndefined();
  });

  // One allow + one deny case per role, matching every §30 matrix row this
  // brief's own seed script (scripts/seed-platform-roles.ts) defines.
  it.each(ADMIN_ROLE_VALUES)("seeded role %s: view_dashboard is granted", async (role) => {
    await AdminRole.create({
      role,
      capabilities: [ADMIN_CAPABILITY.VIEW_DASHBOARD],
      description: "test",
    });
    expect(await hasCapability({ role }, ADMIN_CAPABILITY.VIEW_DASHBOARD)).toBe(true);
    await AdminRole.deleteMany({});
    invalidateAdminRoleCache();
  });

  it.each(ADMIN_ROLE_VALUES)("seeded role %s: an unlisted capability is denied", async (role) => {
    await AdminRole.create({ role, capabilities: [], description: "test" });
    expect(await hasCapability({ role }, ADMIN_CAPABILITY.MANAGE_SECURITY_CONFIG)).toBe(false);
    await AdminRole.deleteMany({});
    invalidateAdminRoleCache();
  });

  it("requireCapability audits every denial as CAPABILITY_DENIED (Phase 9 Addendum C Part 3 — the source for the 'repeated permission failures' §28 alert)", async () => {
    const actorId = new mongoose.Types.ObjectId().toString();
    await expect(
      requireCapability({ role: ADMIN_ROLE.READ_ONLY_ADMIN, id: actorId }, ADMIN_CAPABILITY.DELETE_ORGANIZATION),
    ).rejects.toThrow(AdminForbiddenError);

    const audits = await PlatformAuditLog.find({ actorId, eventType: "capability_denied" });
    expect(audits).toHaveLength(1);
    expect(audits[0].severity).toBe("security");
    expect(audits[0].metadata?.capability).toBe(ADMIN_CAPABILITY.DELETE_ORGANIZATION);
  });

  it("a denial with no actor id at all is still audited, attributed to 'unknown' rather than skipped", async () => {
    await expect(
      requireCapability({ role: ADMIN_ROLE.READ_ONLY_ADMIN }, ADMIN_CAPABILITY.DELETE_ORGANIZATION),
    ).rejects.toThrow(AdminForbiddenError);

    const audits = await PlatformAuditLog.find({ actorId: "unknown", eventType: "capability_denied" });
    expect(audits.length).toBeGreaterThan(0);
  });

  it("enough repeated denials from the same actor raise a permission_failure_spike alert", async () => {
    const actorId = new mongoose.Types.ObjectId().toString();
    for (let i = 0; i < 10; i++) {
      await expect(
        requireCapability({ role: ADMIN_ROLE.READ_ONLY_ADMIN, id: actorId }, ADMIN_CAPABILITY.DELETE_ORGANIZATION),
      ).rejects.toThrow(AdminForbiddenError);
    }
    const alerts = await PlatformAlert.find({ alertType: "permission_failure_spike" });
    expect(alerts.length).toBeGreaterThan(0);
  });

  it("rejects an unknown capability string at the schema level", async () => {
    await expect(
      AdminRole.create({
        role: ADMIN_ROLE.SUPPORT_ADMIN,
        capabilities: ["not_a_real_capability"],
        description: "test",
      }),
    ).rejects.toThrow();
  });
});
