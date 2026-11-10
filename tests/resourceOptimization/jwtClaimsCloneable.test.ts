import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import Organization from "@/models/admin/Organization";
import { buildOrgModuleData } from "@/lib/auth/orgModuleData";

/**
 * Regression found by running the production build: credential login crashed with
 * `DataCloneError: [object Array] could not be cloned` because the entitlement claims put into the JWT
 * contained a Mongoose array. Unit tests with plain-object mocks could not see it; this uses a real Organization document.
 */
describe("JWT entitlement claims are structured-cloneable", () => {
  const org = new Organization({
    name: "Clone Co", subdomain: "clone-co", ownerUserId: new mongoose.Types.ObjectId(),
    tier: "professional", subscriptionStatus: "trial", trialEndDate: new Date("2027-01-01T00:00:00Z"),
    settings: { enabledModules: ["finance", "hr"] },
  });

  it("the raw Mongoose value is NOT cloneable (documents the failure mode)", () => {
    expect(() => structuredClone(org.settings?.enabledModules)).toThrow();
  });

  it("buildOrgModuleData yields plain, cloneable values with the right content", () => {
    const claims = buildOrgModuleData(org, "professional", new Set(["finance"]));
    const cloned = structuredClone(claims);
    expect(cloned).toEqual({
      tier: "professional", enabledModules: ["finance", "hr"], subscriptionStatus: "trial",
      trialEndDate: "2027-01-01T00:00:00.000Z", resolvedModules: ["finance"], isActive: true,
    });
    expect(Array.isArray(claims.enabledModules) && claims.enabledModules.constructor === Array).toBe(true);
  });

  it("defaults: no settings, no trial end, no resolved modules, deactivated org", () => {
    const c = structuredClone(buildOrgModuleData({ isActive: false }, "starter"));
    expect(c).toEqual({ tier: "starter", enabledModules: [], subscriptionStatus: "trial", trialEndDate: null, resolvedModules: undefined, isActive: false });
  });
});
