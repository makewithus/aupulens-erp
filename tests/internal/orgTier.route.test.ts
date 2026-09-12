import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import { NextRequest } from "next/server";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_org_tier";
delete process.env.MIDDLEWARE_INTERNAL_SECRET;

import Organization from "@/models/admin/Organization";
import Plan from "@/models/platform/Plan";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import { PLAN_KEY, ORGANIZATION_TIER } from "@/lib/constants/statuses";

let GET: typeof import("@/app/api/internal/org-tier/route").GET;
let seedPlans: typeof import("@/lib/platform/entitlements/planCatalog").seedPlans;
let invalidateEntitlementsCache: typeof import("@/lib/platform/entitlements/resolve").invalidateEntitlementsCache;

const URL = "http://localhost/api/internal/org-tier";

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  await Organization.init();
  await Plan.init();
  await OrganizationEntitlement.init();
  ({ GET } = await import("@/app/api/internal/org-tier/route"));
  ({ seedPlans } = await import("@/lib/platform/entitlements/planCatalog"));
  ({ invalidateEntitlementsCache } = await import("@/lib/platform/entitlements/resolve"));
  await seedPlans();
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

afterEach(async () => {
  await Organization.deleteMany({});
  await OrganizationEntitlement.deleteMany({});
  invalidateEntitlementsCache();
  await seedPlans(); // restores any Plan doc a test deliberately deleted
});

/**
 * docs/admin/BRIEF-PHASE-9a-ADDENDUM.md Part 1.2 — the actual integration
 * point middleware.ts calls. resolvedModules must be absent (not merely
 * empty) for any tenant without an OrganizationEntitlement row — moduleGate
 * treats "absent" as "fall back to tiers.ts" and "empty array" as "no
 * modules at all," so the distinction is load-bearing.
 */
describe("GET /api/internal/org-tier — resolvedModules bridge", () => {
  it("a tenant with NO OrganizationEntitlement row: resolvedModules is absent from the JSON entirely", async () => {
    await Organization.create({
      name: "Untouched Co",
      subdomain: "untouched-co",
      ownerUserId: new mongoose.Types.ObjectId(),
      tier: ORGANIZATION_TIER.STARTER,
    });
    const res = await GET(new NextRequest(`${URL}?tenantId=untouched-co`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.tier).toBe("starter");
    expect("resolvedModules" in body).toBe(false);
  });

  it("a tenant WITH an approved OrganizationEntitlement row: resolvedModules is populated from the resolved plan", async () => {
    await Organization.create({
      name: "Entitled Co",
      subdomain: "entitled-co",
      ownerUserId: new mongoose.Types.ObjectId(),
      tier: ORGANIZATION_TIER.STARTER,
    });
    await OrganizationEntitlement.create({ tenantId: "entitled-co", planKey: PLAN_KEY.ENTERPRISE });

    const res = await GET(new NextRequest(`${URL}?tenantId=entitled-co`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(new Set(body.resolvedModules)).toEqual(
      new Set(["admin", "hr", "inventory", "finance", "sales", "crm", "manufacturing"]),
    );
  });

  it("a tenant with an entitlement row but no matching Plan document: resolvedModules falls back to absent, not a false-permissive value", async () => {
    await Organization.create({
      name: "Broken Co",
      subdomain: "broken-co",
      ownerUserId: new mongoose.Types.ObjectId(),
      tier: ORGANIZATION_TIER.STARTER,
    });
    // A valid planKey whose Plan document has gone missing from the catalog
    // (e.g. removed after the entitlement row was created) — forces
    // resolveEntitlements() into its own permissive_default path without
    // needing an invalid enum value the schema would reject outright.
    await Plan.deleteOne({ key: PLAN_KEY.CUSTOM });
    await OrganizationEntitlement.create({ tenantId: "broken-co", planKey: PLAN_KEY.CUSTOM });

    const res = await GET(new NextRequest(`${URL}?tenantId=broken-co`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect("resolvedModules" in body).toBe(false);
  });
});
