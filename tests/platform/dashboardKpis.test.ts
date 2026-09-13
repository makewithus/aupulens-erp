import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_dashboardkpis";

import Organization from "@/models/admin/Organization";
import User from "@/models/auth/User";
import SubscriptionEvent from "@/models/admin/SubscriptionEvent";
import SchedulerJobRun from "@/models/platform/SchedulerJobRun";
import PlatformAlert from "@/models/platform/PlatformAlert";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import AdminRole from "@/models/platform/AdminRole";
import {
  ADMIN_CAPABILITY,
  ADMIN_ROLE,
  ENTITY_STATUS,
  ORGANIZATION_STATUS,
  PLATFORM_SEVERITY,
  SUBSCRIPTION_EVENT_TYPE,
  SUBSCRIPTION_STATUS,
} from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";

let getDashboardKpis: typeof import("@/lib/platform/dashboard").getDashboardKpis;
let getDashboardPanels: typeof import("@/lib/platform/dashboard").getDashboardPanels;
let invalidateAdminRoleCache: typeof import("@/lib/platform/auth/adminRbac").invalidateAdminRoleCache;

function makeActor(): AdminActor {
  return {
    id: new mongoose.Types.ObjectId().toString(),
    email: "actor@example.com",
    name: "Actor",
    role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
    sessionId: "test-session",
  };
}

describe("Phase 11 Part 1.5 — dashboard KPIs and panels (source doc §24)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Organization.init();
    await User.init();
    await SubscriptionEvent.init();
    await SchedulerJobRun.init();
    await PlatformAlert.init();
    await PlatformAuditLog.init();
    await AdminRole.init();
    ({ getDashboardKpis, getDashboardPanels } = await import("@/lib/platform/dashboard"));
    ({ invalidateAdminRoleCache } = await import("@/lib/platform/auth/adminRbac"));
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
      capabilities: [ADMIN_CAPABILITY.VIEW_DASHBOARD],
      description: "",
    });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Organization.deleteMany({});
    await User.deleteMany({});
    await SubscriptionEvent.deleteMany({});
    await SchedulerJobRun.deleteMany({});
    await PlatformAlert.deleteMany({});
    await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
    invalidateAdminRoleCache();
  });

  describe("getDashboardKpis", () => {
    it("counts organisations by status correctly", async () => {
      await Organization.create({ name: "A", subdomain: "a", ownerUserId: new mongoose.Types.ObjectId(), status: ORGANIZATION_STATUS.ACTIVE });
      await Organization.create({ name: "B", subdomain: "b", ownerUserId: new mongoose.Types.ObjectId(), status: ORGANIZATION_STATUS.TRIAL });
      await Organization.create({ name: "C", subdomain: "c", ownerUserId: new mongoose.Types.ObjectId(), status: ORGANIZATION_STATUS.SUSPENDED });

      const result = await getDashboardKpis(makeActor(), "test");
      expect(result.totalOrganisations).toBe(3);
      expect(result.activeOrganisations).toBe(1);
      expect(result.trialOrganisations).toBe(1);
      expect(result.suspendedOrganisations).toBe(1);
    });

    it("Phase 11 Part 1.5: treats a MISSING status field as Active — found against real production-shaped data where status was never backfilled on pre-existing organisations", async () => {
      // Organization.status is optional (added after many real orgs already existed) — every
      // other reader in this codebase (list.ts, detail.ts) falls back to ACTIVE when absent.
      // A raw {status: ACTIVE} count would silently exclude every such org, undercounting
      // Active Organisations while Total Organisations still includes them.
      await Organization.create({ name: "Legacy", subdomain: "legacy", ownerUserId: new mongoose.Types.ObjectId() }); // no status field at all
      await Organization.create({ name: "Explicit", subdomain: "explicit", ownerUserId: new mongoose.Types.ObjectId(), status: ORGANIZATION_STATUS.ACTIVE });

      const result = await getDashboardKpis(makeActor(), "test");
      expect(result.totalOrganisations).toBe(2);
      expect(result.activeOrganisations).toBe(2);
    });

    it("counts users by active status across all tenants", async () => {
      await User.create({ tenantId: "a", name: "X", email: "x@a.com", phone: "1", password: "hashedpassword", role: "admin", status: ENTITY_STATUS.ACTIVE });
      await User.create({ tenantId: "b", name: "Y", email: "y@b.com", phone: "1", password: "hashedpassword", role: "admin", status: ENTITY_STATUS.INACTIVE });

      const result = await getDashboardKpis(makeActor(), "test");
      expect(result.totalUsers).toBe(2);
      expect(result.activeUsers).toBe(1);
    });

    it("counts active subscriptions from Organization.subscriptionStatus", async () => {
      await Organization.create({ name: "A", subdomain: "a", ownerUserId: new mongoose.Types.ObjectId(), subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE });
      await Organization.create({ name: "B", subdomain: "b", ownerUserId: new mongoose.Types.ObjectId(), subscriptionStatus: SUBSCRIPTION_STATUS.TRIAL });

      const result = await getDashboardKpis(makeActor(), "test");
      expect(result.activeSubscriptions).toBe(1);
    });

    it("counts an UPGRADED/DOWNGRADED event from the legacy master-admin path directly", async () => {
      await SubscriptionEvent.create({ tenantId: "a", type: SUBSCRIPTION_EVENT_TYPE.UPGRADED, tier: "enterprise", occurredAt: new Date() });
      await SubscriptionEvent.create({ tenantId: "b", type: SUBSCRIPTION_EVENT_TYPE.DOWNGRADED, tier: "starter", occurredAt: new Date() });

      const result = await getDashboardKpis(makeActor(), "test");
      expect(result.upgrades).toBe(1);
      expect(result.downgrades).toBe(1);
    });

    it("classifies a PLAN_ASSIGNED event (the newer assignPlan() path) as an upgrade or downgrade by plan rank — does not silently exclude this real code path", async () => {
      await SubscriptionEvent.create({
        tenantId: "a",
        type: SUBSCRIPTION_EVENT_TYPE.PLAN_ASSIGNED,
        tier: "starter",
        occurredAt: new Date(),
        meta: { fromPlanKey: "starter", toPlanKey: "enterprise" },
      });
      await SubscriptionEvent.create({
        tenantId: "b",
        type: SUBSCRIPTION_EVENT_TYPE.PLAN_ASSIGNED,
        tier: "starter",
        occurredAt: new Date(),
        meta: { fromPlanKey: "enterprise", toPlanKey: "starter" },
      });

      const result = await getDashboardKpis(makeActor(), "test");
      expect(result.upgrades).toBe(1);
      expect(result.downgrades).toBe(1);
    });

    it("does not count an initial plan assignment (fromPlanKey null) as an upgrade or downgrade", async () => {
      await SubscriptionEvent.create({
        tenantId: "a",
        type: SUBSCRIPTION_EVENT_TYPE.PLAN_ASSIGNED,
        tier: "starter",
        occurredAt: new Date(),
        meta: { fromPlanKey: null, toPlanKey: "starter" },
      });

      const result = await getDashboardKpis(makeActor(), "test");
      expect(result.upgrades).toBe(0);
      expect(result.downgrades).toBe(0);
    });

    it("excludes a plan-change event from a prior month", async () => {
      await SubscriptionEvent.create({
        tenantId: "a",
        type: SUBSCRIPTION_EVENT_TYPE.UPGRADED,
        tier: "enterprise",
        occurredAt: new Date("2020-01-01T00:00:00Z"),
      });
      const result = await getDashboardKpis(makeActor(), "test");
      expect(result.upgrades).toBe(0);
    });

    it("counts scheduled jobs currently in a failed state as System Errors", async () => {
      await SchedulerJobRun.create({ jobId: "job-a", lastRunStatus: "error", lastError: "boom" });
      await SchedulerJobRun.create({ jobId: "job-b", lastRunStatus: "success" });

      const result = await getDashboardKpis(makeActor(), "test");
      expect(result.systemErrorsCurrentlyFailing).toBe(1);
    });

    it("counts unresolved SECURITY-severity alerts", async () => {
      await PlatformAlert.create({ alertType: "failed_login_spike", severity: PLATFORM_SEVERITY.SECURITY, message: "x", deliveryChannels: ["in_app"] });
      await PlatformAlert.create({ alertType: "ai_usage_threshold", severity: PLATFORM_SEVERITY.WARNING, message: "y", deliveryChannels: ["in_app"] });
      await PlatformAlert.create({
        alertType: "failed_login_spike",
        severity: PLATFORM_SEVERITY.SECURITY,
        message: "z",
        deliveryChannels: ["in_app"],
        resolvedAt: new Date(),
      });

      const result = await getDashboardKpis(makeActor(), "test");
      expect(result.securityAlertsUnresolved).toBe(1);
    });

    it("names MRR, ARR, Storage Used, and API Usage as unavailable, each with a reason", async () => {
      const result = await getDashboardKpis(makeActor(), "test");
      const fields = result.unavailable.map((u) => u.field);
      expect(fields).toEqual(["MRR", "ARR", "Storage Used", "API Usage"]);
      expect(result.unavailable.every((u) => u.reason.length > 0)).toBe(true);
    });

    it("AI Credits Used mirrors AI Cost — this codebase has no separate credit unit", async () => {
      const result = await getDashboardKpis(makeActor(), "test");
      expect(result.aiCreditsUsedThisMonth).toBe(result.aiCostThisMonth);
    });
  });

  describe("getDashboardPanels", () => {
    it("returns recent organisations, most recent first", async () => {
      await Organization.create({ name: "Older", subdomain: "older", ownerUserId: new mongoose.Types.ObjectId(), createdAt: new Date("2020-01-01") });
      await Organization.create({ name: "Newer", subdomain: "newer", ownerUserId: new mongoose.Types.ObjectId(), createdAt: new Date("2026-01-01") });

      const result = await getDashboardPanels(makeActor(), "test");
      expect(result.recentOrganisations[0].name).toBe("Newer");
    });

    it("returns recent subscription changes", async () => {
      await SubscriptionEvent.create({ tenantId: "a", type: SUBSCRIPTION_EVENT_TYPE.UPGRADED, tier: "enterprise" });
      const result = await getDashboardPanels(makeActor(), "test");
      expect(result.recentSubscriptionChanges).toHaveLength(1);
      expect(result.recentSubscriptionChanges[0].tenantId).toBe("a");
    });

    it("returns recent admin actions, excluding high-volume read-only event types", async () => {
      await PlatformAuditLog.create({
        actorId: "admin-1",
        actorType: "admin",
        actorRole: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
        eventCategory: "organisation",
        eventType: "organization_status_changed",
        severity: PLATFORM_SEVERITY.WARNING,
        tenantId: "a",
      });
      await PlatformAuditLog.create({
        actorId: "admin-1",
        actorType: "admin",
        actorRole: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
        eventCategory: "organisation",
        eventType: "organization_viewed", // read-only — must not appear
        severity: PLATFORM_SEVERITY.INFO,
        tenantId: "a",
      });

      const result = await getDashboardPanels(makeActor(), "test");
      expect(result.recentAdminActions).toHaveLength(1);
      expect(result.recentAdminActions[0].eventType).toBe("organization_status_changed");
    });

    it("excludes a tenant_user-actor audit row (e.g. a mass export) from the admin-actions panel", async () => {
      await PlatformAuditLog.create({
        actorId: "user-1",
        actorType: "tenant_user",
        actorRole: "admin",
        eventCategory: "security",
        eventType: "mass_data_export",
        severity: PLATFORM_SEVERITY.INFO,
        tenantId: "a",
      });

      const result = await getDashboardPanels(makeActor(), "test");
      expect(result.recentAdminActions).toHaveLength(0);
    });
  });
});
