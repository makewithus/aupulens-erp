import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_orgtabs";

import Organization from "@/models/admin/Organization";
import User from "@/models/auth/User";
import Plan from "@/models/platform/Plan";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import OrganizationType from "@/models/platform/OrganizationType";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import AdminRole from "@/models/platform/AdminRole";
import { ADMIN_CAPABILITY, ADMIN_ROLE, ENTITY_STATUS, ORGANIZATION_TYPE, PLAN_KEY, SUPPORT_LEVEL } from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";

let getOrganizationModules: typeof import("@/lib/platform/organizations/detail").getOrganizationModules;
let getOrganizationConfiguration: typeof import("@/lib/platform/organizations/detail").getOrganizationConfiguration;
let getOrganizationSecurity: typeof import("@/lib/platform/organizations/detail").getOrganizationSecurity;
let getOrganizationUsageLimits: typeof import("@/lib/platform/organizations/detail").getOrganizationUsageLimits;
let updateOrganizationConfiguration: typeof import("@/lib/platform/organizations/configuration").updateOrganizationConfiguration;
let OrganizationConfigurationError: typeof import("@/lib/platform/organizations/configuration").OrganizationConfigurationError;
let invalidateAdminRoleCache: typeof import("@/lib/platform/auth/adminRbac").invalidateAdminRoleCache;
let invalidateEntitlementsCache: typeof import("@/lib/platform/entitlements/resolve").invalidateEntitlementsCache;

const PLAN_FEATURES = {
  modules: ["admin", "finance"],
  maxUsers: 10,
  maxCompanies: 1,
  storageGb: 5,
  apiRequestsPerMonth: 1000,
  aiCreditsPerMonth: 100,
  aiRequestsPerMonth: 100,
  automationRunsPerMonth: 20,
  documentLimitPerMonth: 100,
  supportLevel: SUPPORT_LEVEL.EMAIL,
  featureFlags: {},
};

function makeActor(role: string = ADMIN_ROLE.GLOBAL_SUPER_ADMIN): AdminActor {
  return {
    id: new mongoose.Types.ObjectId().toString(),
    email: "actor@example.com",
    name: "Actor",
    role: role as AdminActor["role"],
    sessionId: "test-session",
  };
}

describe("Phase 11 Part 1.2 — the four new organisation detail tabs", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Organization.init();
    await User.init();
    await Plan.init();
    await OrganizationEntitlement.init();
    await OrganizationType.init();
    await PlatformAuditLog.init();
    await AdminRole.init();
    ({ getOrganizationModules, getOrganizationConfiguration, getOrganizationSecurity, getOrganizationUsageLimits } =
      await import("@/lib/platform/organizations/detail"));
    ({ updateOrganizationConfiguration, OrganizationConfigurationError } = await import(
      "@/lib/platform/organizations/configuration"
    ));
    ({ invalidateAdminRoleCache } = await import("@/lib/platform/auth/adminRbac"));
    ({ invalidateEntitlementsCache } = await import("@/lib/platform/entitlements/resolve"));

    await Plan.create({ key: PLAN_KEY.STARTER, name: "Starter", features: PLAN_FEATURES });
    await Plan.create({ key: PLAN_KEY.ENTERPRISE, name: "Enterprise", features: { ...PLAN_FEATURES, modules: ["admin", "finance", "sales", "hr"] } });
    await AdminRole.create({
      role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
      capabilities: [ADMIN_CAPABILITY.VIEW_ORGANIZATIONS, ADMIN_CAPABILITY.MANAGE_ORGANIZATIONS],
      description: "",
    });
    await AdminRole.create({ role: ADMIN_ROLE.READ_ONLY_ADMIN, capabilities: [ADMIN_CAPABILITY.VIEW_ORGANIZATIONS], description: "" });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Organization.deleteMany({});
    await User.deleteMany({});
    await OrganizationEntitlement.deleteMany({});
    await OrganizationType.deleteMany({});
    await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
    invalidateAdminRoleCache();
    invalidateEntitlementsCache();
  });

  describe("getOrganizationModules", () => {
    it("shows the plan's own modules with no override", async () => {
      await Organization.create({ name: "Acme", subdomain: "acme", ownerUserId: new mongoose.Types.ObjectId() });
      await OrganizationEntitlement.create({ tenantId: "acme", planKey: PLAN_KEY.STARTER });

      const result = await getOrganizationModules(makeActor(), "test", "acme");
      expect(result.planModules).toEqual(["admin", "finance"]);
      expect(result.overrideModules).toBeNull();
      expect(result.effectiveModules).toEqual(["admin", "finance"]);
      expect(result.allModules).toContain("crm"); // fixed catalogue includes modules beyond this plan's own
    });

    it("shows an override's module set as distinct from the plan's own — never conflated", async () => {
      await Organization.create({ name: "Acme", subdomain: "acme", ownerUserId: new mongoose.Types.ObjectId() });
      await OrganizationEntitlement.create({
        tenantId: "acme",
        planKey: PLAN_KEY.STARTER,
        overrides: { modules: ["admin", "crm"] },
      });

      const result = await getOrganizationModules(makeActor(), "test", "acme");
      expect(result.planModules).toEqual(["admin", "finance"]); // the plan's own set, unaffected by the override
      expect(result.overrideModules).toEqual(["admin", "crm"]);
      expect(result.effectiveModules).toEqual(["admin", "crm"]); // the override is what actually governs
    });

    it("reports hasBasePlan: false when no OrganizationEntitlement row exists yet (tier-fallback territory)", async () => {
      await Organization.create({ name: "Legacy Org", subdomain: "legacy-org", ownerUserId: new mongoose.Types.ObjectId() });
      const result = await getOrganizationModules(makeActor(), "test", "legacy-org");
      expect(result.hasBasePlan).toBe(false);
    });
  });

  describe("getOrganizationConfiguration / updateOrganizationConfiguration", () => {
    it("reads country/currency/timezone/taxJurisdiction from Organization.settings", async () => {
      await Organization.create({
        name: "Acme",
        subdomain: "acme",
        ownerUserId: new mongoose.Types.ObjectId(),
        organizationType: ORGANIZATION_TYPE.SME,
        settings: { country: "India", currency: "INR", timezone: "Asia/Kolkata", taxJurisdiction: "India - GST" },
      });

      const result = await getOrganizationConfiguration(makeActor(), "test", "acme");
      expect(result).toMatchObject({ country: "India", currency: "INR", timezone: "Asia/Kolkata", taxJurisdiction: "India - GST" });
    });

    it("includes the organisation type's own defaults for context, separately from the org's actual settings", async () => {
      await OrganizationType.create({
        type: ORGANIZATION_TYPE.SME,
        label: "SME",
        description: "",
        defaultConfig: { enabledModules: ["admin"], maxUsers: 5, aiCallsPerMonth: 100 },
      });
      await Organization.create({
        name: "Acme",
        subdomain: "acme",
        ownerUserId: new mongoose.Types.ObjectId(),
        organizationType: ORGANIZATION_TYPE.SME,
      });

      const result = await getOrganizationConfiguration(makeActor(), "test", "acme");
      expect(result!.organizationTypeDefaults).toMatchObject({ maxUsers: 5, aiCallsPerMonth: 100 });
    });

    it("Phase 11 Part 1.2: changing country does NOT silently re-derive currency/timezone — only the fields actually supplied are changed", async () => {
      await Organization.create({
        name: "Acme",
        subdomain: "acme",
        ownerUserId: new mongoose.Types.ObjectId(),
        settings: { country: "India", currency: "INR", timezone: "Asia/Kolkata" },
      });

      // Only country is supplied — currency/timezone must survive untouched,
      // even though they would have auto-derived to USD/America-New_York
      // for "United States" at ORGANISATION-CREATION time.
      await updateOrganizationConfiguration(makeActor(), "acme", { country: "United States" }, "customer relocated HQ");

      const result = await getOrganizationConfiguration(makeActor(), "test", "acme");
      expect(result!.country).toBe("United States");
      expect(result!.currency).toBe("INR"); // unchanged — no silent re-derivation
      expect(result!.timezone).toBe("Asia/Kolkata"); // unchanged — no silent re-derivation
    });

    it("preserves every other settings field untouched (e.g. enabledModules, branding) — a partial update is truly partial", async () => {
      await Organization.create({
        name: "Acme",
        subdomain: "acme",
        ownerUserId: new mongoose.Types.ObjectId(),
        settings: { country: "India", enabledModules: ["admin", "finance"], themeColor: "#abcdef" },
      });

      await updateOrganizationConfiguration(makeActor(), "acme", { currency: "EUR" }, "test");

      const org = await Organization.findOne({ subdomain: "acme" }).lean();
      expect(org!.settings.enabledModules).toEqual(["admin", "finance"]);
      expect(org!.settings.themeColor).toBe("#abcdef");
      expect(org!.settings.currency).toBe("EUR");
    });

    it("writes an audit event recording old and new values", async () => {
      await Organization.create({ name: "Acme", subdomain: "acme", ownerUserId: new mongoose.Types.ObjectId(), settings: { country: "India" } });
      await updateOrganizationConfiguration(makeActor(), "acme", { country: "Singapore" }, "expansion");

      const audits = await PlatformAuditLog.find({ tenantId: "acme" });
      expect(audits).toHaveLength(1);
      expect(audits[0].eventType).toBe("organization_updated");
      expect((audits[0].oldValue as any).country).toBe("India");
      expect((audits[0].newValue as any).country).toBe("Singapore");
    });

    it("requires a reason", async () => {
      await Organization.create({ name: "Acme", subdomain: "acme", ownerUserId: new mongoose.Types.ObjectId() });
      await expect(updateOrganizationConfiguration(makeActor(), "acme", { country: "India" }, "")).rejects.toThrow(
        OrganizationConfigurationError,
      );
    });

    it("rejects an empty update object", async () => {
      await Organization.create({ name: "Acme", subdomain: "acme", ownerUserId: new mongoose.Types.ObjectId() });
      await expect(updateOrganizationConfiguration(makeActor(), "acme", {}, "test")).rejects.toThrow(OrganizationConfigurationError);
    });

    it("denies an actor without MANAGE_ORGANIZATIONS", async () => {
      await Organization.create({ name: "Acme", subdomain: "acme", ownerUserId: new mongoose.Types.ObjectId(), settings: { country: "India" } });
      await expect(
        updateOrganizationConfiguration(makeActor(ADMIN_ROLE.READ_ONLY_ADMIN), "acme", { country: "Singapore" }, "test"),
      ).rejects.toThrow();
      const org = await Organization.findOne({ subdomain: "acme" }).lean();
      expect(org!.settings.country).toBe("India"); // unchanged
    });
  });

  describe("getOrganizationSecurity", () => {
    it("returns real users with role/active status, and names exactly what's unavailable and why", async () => {
      await Organization.create({ name: "Acme", subdomain: "acme", ownerUserId: new mongoose.Types.ObjectId() });
      await User.create({ tenantId: "acme", name: "A", email: "a@acme.com", phone: "1", password: "hashedpassword", role: "admin", status: ENTITY_STATUS.ACTIVE });
      await User.create({ tenantId: "acme", name: "B", email: "b@acme.com", phone: "1", password: "hashedpassword", role: "finance", status: ENTITY_STATUS.INACTIVE });

      const result = await getOrganizationSecurity(makeActor(), "test", "acme");
      expect(result.users).toHaveLength(2);
      expect(result.users.find((u) => u.email === "a@acme.com")?.active).toBe(true);
      expect(result.users.find((u) => u.email === "b@acme.com")?.active).toBe(false);

      const fields = result.unavailable.map((u) => u.field);
      expect(fields).toEqual(["MFA status", "Recent logins", "Failed-login counts", "Active sessions"]);
      expect(result.unavailable.every((u) => u.reason.length > 0)).toBe(true); // never a bare label with no explanation
    });
  });

  describe("getOrganizationUsageLimits", () => {
    it("computes real user usage against the plan limit", async () => {
      await Organization.create({ name: "Acme", subdomain: "acme", ownerUserId: new mongoose.Types.ObjectId() });
      await OrganizationEntitlement.create({ tenantId: "acme", planKey: PLAN_KEY.STARTER }); // maxUsers: 10
      await User.create({ tenantId: "acme", name: "A", email: "a@acme.com", phone: "1", password: "hashedpassword", role: "admin", status: ENTITY_STATUS.ACTIVE });

      const result = await getOrganizationUsageLimits(makeActor(), "test", "acme");
      expect(result.users).toEqual({ used: 1, limit: 10, percent: 10 });
    });

    it("never returns NaN/Infinity when the resolved limit is somehow zero", async () => {
      await Organization.create({ name: "Acme", subdomain: "acme", ownerUserId: new mongoose.Types.ObjectId() });
      await OrganizationEntitlement.create({ tenantId: "acme", planKey: PLAN_KEY.STARTER, overrides: { maxUsers: 0 } });

      const result = await getOrganizationUsageLimits(makeActor(), "test", "acme");
      expect(result.users.percent).toBeNull();
      expect(Number.isFinite(result.users.percent ?? 0)).toBe(true);
    });

    it("names storage/API/document counts as unavailable, each with its own reason", async () => {
      await Organization.create({ name: "Acme", subdomain: "acme", ownerUserId: new mongoose.Types.ObjectId() });
      const result = await getOrganizationUsageLimits(makeActor(), "test", "acme");
      const fields = result.unavailable.map((u) => u.field);
      expect(fields).toEqual(["Storage used", "API requests", "Document counts"]);
      expect(result.unavailable.every((u) => u.reason.length > 0)).toBe(true);
    });
  });
});
