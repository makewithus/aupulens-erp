import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_orgaiusage";

import Organization from "@/models/admin/Organization";
import Plan from "@/models/platform/Plan";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import AiUsageMonthly from "@/models/platform/AiUsageMonthly";
import AiUsageRecord from "@/models/platform/AiUsageRecord";
import SchedulerJobRun from "@/models/platform/SchedulerJobRun";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import AdminRole from "@/models/platform/AdminRole";
import { ADMIN_CAPABILITY, ADMIN_ROLE, AI_USAGE_REQUEST_STATUS, PLAN_KEY, SUPPORT_LEVEL } from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";

let getOrganizationAiUsage: typeof import("@/lib/platform/organizations/detail").getOrganizationAiUsage;
let getAiPeriod: typeof import("@/lib/ai/usage").getAiPeriod;

function makeActor(): AdminActor {
  return {
    id: new mongoose.Types.ObjectId().toString(),
    email: "actor@example.com",
    name: "Actor",
    role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
    sessionId: "test-session",
  };
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  await Organization.init();
  await Plan.init();
  await OrganizationEntitlement.init();
  await AiUsageMonthly.init();
  await AiUsageRecord.init();
  await SchedulerJobRun.init();
  await PlatformAuditLog.init();
  await AdminRole.init();
  ({ getOrganizationAiUsage } = await import("@/lib/platform/organizations/detail"));
  ({ getAiPeriod } = await import("@/lib/ai/usage"));
  await AdminRole.create({
    role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
    capabilities: [ADMIN_CAPABILITY.VIEW_AI_USAGE],
    description: "",
  });
  await Plan.create({
    key: PLAN_KEY.STARTER,
    name: "Starter",
    features: {
      modules: ["admin"],
      maxUsers: 5,
      maxCompanies: 1,
      storageGb: 5,
      apiRequestsPerMonth: 1000,
      aiCreditsPerMonth: 100,
      aiRequestsPerMonth: 100,
      automationRunsPerMonth: 20,
      documentLimitPerMonth: 100,
      supportLevel: SUPPORT_LEVEL.EMAIL,
      featureFlags: {},
    },
  });
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

afterEach(async () => {
  await Organization.deleteMany({});
  await OrganizationEntitlement.deleteMany({});
  await AiUsageMonthly.deleteMany({});
  await AiUsageRecord.deleteMany({});
  await SchedulerJobRun.deleteMany({});
  await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
});

async function setupTenant(tenantId: string) {
  await Organization.create({ name: "Org", subdomain: tenantId, ownerUserId: new mongoose.Types.ObjectId() });
  await OrganizationEntitlement.create({ tenantId, planKey: PLAN_KEY.STARTER });
}

describe("getOrganizationAiUsage — Phase 10 Part 0.4: per-org stale-rollup fallback", () => {
  it("reads from the rollup and reports dataSource 'rollup' when the job ran recently", async () => {
    const tenantId = "rollup-fresh-co";
    await setupTenant(tenantId);
    await SchedulerJobRun.create({ jobId: "platform-ai-usage-rollup", lastRunAt: new Date(), lastRunStatus: "success" });
    await AiUsageMonthly.create({ tenantId, period: getAiPeriod(), feature: "ai_assistant", requestCount: 42 });

    const result: any = await getOrganizationAiUsage(makeActor(), "test", tenantId);
    expect(result.dataSource).toBe("rollup");
    expect(result.used).toBe(42);
  });

  it("falls back to a live AiUsageRecord computation and reports dataSource 'live' when the rollup is stale", async () => {
    const tenantId = "rollup-stale-co";
    await setupTenant(tenantId);
    // No SchedulerJobRun row at all — treated as stale.
    await AiUsageMonthly.create({ tenantId, period: getAiPeriod(), feature: "ai_assistant", requestCount: 999 }); // must not be trusted
    await AiUsageRecord.create({
      tenantId,
      feature: "ai_assistant",
      modelName: "gpt-4o",
      inputTokens: 10,
      outputTokens: 5,
      estimatedCostUsd: 0.01,
      latencyMs: 50,
      status: AI_USAGE_REQUEST_STATUS.SUCCESS,
      requestId: "req-1",
    });

    const result: any = await getOrganizationAiUsage(makeActor(), "test", tenantId);
    expect(result.dataSource).toBe("live");
    expect(result.used).toBe(1); // the live record, not the stale 999
  });

  it("a tenant with genuinely zero usage still shows honest zeros, live or rolled up", async () => {
    const tenantId = "zero-usage-co";
    await setupTenant(tenantId);
    const result: any = await getOrganizationAiUsage(makeActor(), "test", tenantId);
    expect(result.used).toBe(0);
    expect(result.featureBreakdown.every((f: any) => f.requestCount === 0)).toBe(true);
  });
});
