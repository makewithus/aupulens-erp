import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/lib/db", () => ({ default: async () => {} }));
import mongoose from "mongoose";
import { randomUUID } from "crypto";
import Organization from "@/models/admin/Organization";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import { seedPlans } from "@/lib/platform/entitlements/planCatalog";
import { invalidateEntitlementsCache } from "@/lib/platform/entitlements/resolve";
import { tryErpAssistant, safeErpError } from "@/lib/ai/erpAssistant";

const adminTenant = `plan-qa-admin-${randomUUID().slice(0, 8)}`;
const starterTenant = `plan-qa-starter-${randomUUID().slice(0, 8)}`;
const missingPlanTenant = `plan-qa-missing-${randomUUID().slice(0, 8)}`;
const adminUser = new mongoose.Types.ObjectId().toString();
const salesUser = new mongoose.Types.ObjectId().toString();

beforeAll(async () => {
  await mongoose.connect(`mongodb://127.0.0.1:27017/aupulens_test_plan_${randomUUID().replaceAll("-", "")}`, {
    serverSelectionTimeoutMS: 3000,
  });
  await Organization.init();
  await OrganizationEntitlement.init();
  await seedPlans();

  // Admin tenant on enterprise
  await Organization.create({
    name: "Enterprise Org",
    subdomain: adminTenant,
    ownerUserId: adminUser,
    tier: "enterprise",
    subscriptionStatus: "active",
  });
  await OrganizationEntitlement.create({
    tenantId: adminTenant,
    planKey: "enterprise",
    assignedBy: adminUser,
  });
  invalidateEntitlementsCache(adminTenant);

  // Starter tenant with limited modules
  await Organization.create({
    name: "Starter Org",
    subdomain: starterTenant,
    ownerUserId: adminUser,
    tier: "starter",
    subscriptionStatus: "active",
  });
  await OrganizationEntitlement.create({
    tenantId: starterTenant,
    planKey: "starter",
    assignedBy: adminUser,
    overrides: {
      modules: ["admin", "sales", "finance"],
    },
  });
  invalidateEntitlementsCache(starterTenant);

  // Tenant with organization record but non-existent plan key
  await Organization.create({
    name: "Unconfigured Org",
    subdomain: missingPlanTenant,
    ownerUserId: adminUser,
    tier: "starter",
    subscriptionStatus: "active",
  });
  await mongoose.connection.collection("organizationentitlements").insertOne({
    tenantId: missingPlanTenant,
    planKey: "non_existent_plan",
    assignedBy: adminUser,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  invalidateEntitlementsCache(missingPlanTenant);
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
});

describe("Task 2 — Plan and Entitlement Queries (8 QA Scenarios)", () => {
  // Scenario 1: Authorized administrator asks which plan their organization uses
  it("1 authorized administrator asks which plan their organization uses", async () => {
    const res = await tryErpAssistant({
      tenantId: adminTenant,
      userId: adminUser,
      role: "admin",
      module: "admin",
      conversationId: randomUUID(),
      text: "Which plan does our organization use?",
      requestId: randomUUID(),
    });
    expect(res?.message).toContain("Account plan: enterprise");
    expect(res?.message).toContain("Subscription status: active");
  });

  // Scenario 2: Authorized administrator asks which features or entitlements are available
  it("2 authorized administrator asks which features or entitlements are available", async () => {
    const res = await tryErpAssistant({
      tenantId: adminTenant,
      userId: adminUser,
      role: "admin",
      module: "admin",
      conversationId: randomUUID(),
      text: "Which features or entitlements are available in our plan?",
      requestId: randomUUID(),
    });
    expect(res?.message).toContain("Account plan: enterprise");
    expect(res?.message).toContain("Available modules:");
    expect(res?.message).toContain("sales");
    expect(res?.message).toContain("finance");
  });

  // Scenario 3: Standard sales user asks for account subscription details
  it("3 standard sales user asks for account subscription details and is denied", async () => {
    await expect(
      tryErpAssistant({
        tenantId: adminTenant,
        userId: salesUser,
        role: "sales",
        module: "sales",
        conversationId: randomUUID(),
        text: "What subscription plan are we on?",
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      status: 403,
    });
  });

  // Scenario 4: User asks about a feature that is not included in their plan
  it("4 asks about a feature that is not included in their plan vs included", async () => {
    // Manufacturing is not in starter
    const excludedRes = await tryErpAssistant({
      tenantId: starterTenant,
      userId: adminUser,
      role: "admin",
      module: "admin",
      conversationId: randomUUID(),
      text: "Is manufacturing included in our plan?",
      requestId: randomUUID(),
    });
    expect(excludedRes?.message).toContain("manufacturing is not included in your current starter plan");
    expect(excludedRes?.message).toContain("Available modules: admin, sales, finance");

    // Sales is in starter
    const includedRes = await tryErpAssistant({
      tenantId: starterTenant,
      userId: adminUser,
      role: "admin",
      module: "admin",
      conversationId: randomUUID(),
      text: "Is sales included in our plan?",
      requestId: randomUUID(),
    });
    expect(includedRes?.message).toContain("sales is included in your starter plan");
  });

  // Scenario 5: Plan data is missing
  it("5 plan data is missing returns clean not found error", async () => {
    await expect(
      tryErpAssistant({
        tenantId: missingPlanTenant,
        userId: adminUser,
        role: "admin",
        module: "admin",
        conversationId: randomUUID(),
        text: "Which plan do we have?",
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });

  // Scenario 6: Subscription data is unavailable because of a database failure
  it("6 subscription data unavailable on db error returns safe error", () => {
    const dbErr = new mongoose.Error("MongoNetworkError: connection timed out with mongodb://user:pass@127.0.0.1:27017/db");
    const safe = safeErpError(dbErr, "qa-req-123");
    expect(safe.status).toBe(503);
    expect(safe.body.code).toBe("DATABASE_UNAVAILABLE");
    expect(safe.body.message).toBe("I couldn't retrieve the records right now. Please try again shortly.");
    expect(JSON.stringify(safe)).not.toContain("user:pass");
  });

  // Scenario 7: A user attempts to query another tenant's subscription
  it("7 user attempts to query another tenant's subscription is scoped strictly to caller's tenant", async () => {
    // The assistant ignores foreign tenant mentions in the text and only returns the caller's tenant info
    const res = await tryErpAssistant({
      tenantId: starterTenant,
      userId: adminUser,
      role: "admin",
      module: "admin",
      conversationId: randomUUID(),
      text: `What is the plan for ${adminTenant}?`,
      requestId: randomUUID(),
    });
    // Caller is in starterTenant, so it must return starter, NOT adminTenant's enterprise!
    expect(res?.message).toContain("Account plan: starter");
    expect(res?.message).not.toContain("Account plan: enterprise");
  });

  // Scenario 8: User asks a plan question in natural language or with a minor typo
  it("8 recognizes plan questions with minor typos", async () => {
    const typo1 = await tryErpAssistant({
      tenantId: adminTenant,
      userId: adminUser,
      role: "admin",
      module: "admin",
      conversationId: randomUUID(),
      text: "which plan this acount uses?",
      requestId: randomUUID(),
    });
    expect(typo1?.message).toContain("Account plan: enterprise");

    const typo2 = await tryErpAssistant({
      tenantId: adminTenant,
      userId: adminUser,
      role: "admin",
      module: "admin",
      conversationId: randomUUID(),
      text: "what is our subcription plan?",
      requestId: randomUUID(),
    });
    expect(typo2?.message).toContain("Account plan: enterprise");

    const typo3 = await tryErpAssistant({
      tenantId: adminTenant,
      userId: adminUser,
      role: "admin",
      module: "admin",
      conversationId: randomUUID(),
      text: "what feautres are in our plan?",
      requestId: randomUUID(),
    });
    expect(typo3?.message).toContain("Available modules:");
  });
});
