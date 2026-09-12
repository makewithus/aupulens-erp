import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_aidashboard";

import Organization from "@/models/admin/Organization";
import AiUsageMonthly from "@/models/platform/AiUsageMonthly";
import AiUsageDaily from "@/models/platform/AiUsageDaily";
import AiUsageRecord from "@/models/platform/AiUsageRecord";
import AdminRole from "@/models/platform/AdminRole";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import SchedulerJobRun from "@/models/platform/SchedulerJobRun";
import { ADMIN_CAPABILITY, ADMIN_ROLE, AI_USAGE_REQUEST_STATUS } from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";

let getPlatformAiUsageSummary: typeof import("@/lib/platform/ai/dashboard").getPlatformAiUsageSummary;
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
  await AiUsageMonthly.init();
  await AiUsageDaily.init();
  await AiUsageRecord.init();
  await AdminRole.init();
  await PlatformAuditLog.init();
  await SchedulerJobRun.init();
  ({ getPlatformAiUsageSummary } = await import("@/lib/platform/ai/dashboard"));
  ({ getAiPeriod } = await import("@/lib/ai/usage"));
  await AdminRole.create({
    role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
    capabilities: [ADMIN_CAPABILITY.VIEW_AI_USAGE],
    description: "",
  });
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

async function markRollupFresh() {
  // Phase 10 Part 0.4: getPlatformAiUsageSummary() falls back to a live
  // AiUsageRecord computation when the rollup job hasn't run recently. This
  // file's own tests seed AiUsageMonthly/AiUsageDaily directly (testing the
  // rollup-read path itself, not the fallback — that path has its own test
  // below), so a fresh SchedulerJobRun row keeps the rollup "not stale" for
  // every test in this file except the ones that explicitly test staleness.
  await SchedulerJobRun.create({ jobId: "platform-ai-usage-rollup", lastRunAt: new Date(), lastRunStatus: "success" });
}

afterEach(async () => {
  await Organization.deleteMany({});
  await AiUsageMonthly.deleteMany({});
  await AiUsageDaily.deleteMany({});
  await AiUsageRecord.deleteMany({});
  await SchedulerJobRun.deleteMany({});
  await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
});

describe("getPlatformAiUsageSummary — §13's 13 named metrics", () => {
  it("totalRequestsAllTime sums across every period, distinct from totalRequestsThisMonth", async () => {
    await markRollupFresh();
    const thisMonth = getAiPeriod();
    const oldPeriod = "202001"; // long past — proves "all time" isn't silently just "this month" again
    await AiUsageMonthly.create({ tenantId: "org-a", period: thisMonth, feature: "ai_assistant", requestCount: 10 });
    await AiUsageMonthly.create({ tenantId: "org-a", period: oldPeriod, feature: "ai_assistant", requestCount: 90 });

    const summary = await getPlatformAiUsageSummary(makeActor(), "test");
    expect((summary as any).totalRequestsThisMonth).toBe(10);
    expect((summary as any).totalRequestsAllTime).toBe(100);
  });

  it("totalTokens is the sum of input and output tokens", async () => {
    await markRollupFresh();
    const thisMonth = getAiPeriod();
    await AiUsageMonthly.create({
      tenantId: "org-b",
      period: thisMonth,
      feature: "ai_assistant",
      requestCount: 1,
      inputTokens: 300,
      outputTokens: 200,
    });
    const summary = await getPlatformAiUsageSummary(makeActor(), "test");
    expect((summary as any).totalInputTokens).toBe(300);
    expect((summary as any).totalOutputTokens).toBe(200);
    expect((summary as any).totalTokens).toBe(500);
  });

  it("topModels groups by modelName (distinct from topFeatures, which groups by feature bucket) — this month only", async () => {
    const now = new Date();
    await AiUsageRecord.create({
      tenantId: "org-c",
      feature: "ai_assistant",
      modelName: "gpt-4o",
      inputTokens: 10,
      outputTokens: 5,
      estimatedCostUsd: 0.01,
      latencyMs: 100,
      status: AI_USAGE_REQUEST_STATUS.SUCCESS,
      requestId: "req-1",
    });
    await AiUsageRecord.create({
      tenantId: "org-c",
      feature: "ai_reports",
      modelName: "gpt-4o-mini",
      inputTokens: 10,
      outputTokens: 5,
      estimatedCostUsd: 0.001,
      latencyMs: 50,
      status: AI_USAGE_REQUEST_STATUS.SUCCESS,
      requestId: "req-2",
    });
    // Outside this month — must not appear in the "this month" topModels window.
    await AiUsageRecord.create({
      tenantId: "org-c",
      feature: "ai_assistant",
      modelName: "old-model",
      inputTokens: 1,
      outputTokens: 1,
      estimatedCostUsd: 0,
      latencyMs: 10,
      status: AI_USAGE_REQUEST_STATUS.SUCCESS,
      requestId: "req-3",
      createdAt: new Date(now.getFullYear() - 1, 0, 1),
    });

    const summary = await getPlatformAiUsageSummary(makeActor(), "test");
    const modelNames = (summary as any).topModels.map((m: any) => m.modelName);
    expect(modelNames).toContain("gpt-4o");
    expect(modelNames).toContain("gpt-4o-mini");
    expect(modelNames).not.toContain("old-model");
  });

  it("failedRequests and averageRequestCostUsd are already correct (not a regression from this change)", async () => {
    await markRollupFresh();
    const thisMonth = getAiPeriod();
    await AiUsageMonthly.create({
      tenantId: "org-d",
      period: thisMonth,
      feature: "ai_assistant",
      requestCount: 4,
      estimatedCostUsd: 2,
      errorCount: 1,
    });
    const summary = await getPlatformAiUsageSummary(makeActor(), "test");
    expect((summary as any).failedRequests).toBe(1);
    expect((summary as any).averageRequestCostUsd).toBe(0.5);
  });

  it("a fresh platform with no rollup rows at all shows real zeros, not an error", async () => {
    await markRollupFresh();
    const summary = await getPlatformAiUsageSummary(makeActor(), "test");
    expect((summary as any).totalRequestsAllTime).toBe(0);
    expect((summary as any).totalTokens).toBe(0);
    expect((summary as any).topModels).toEqual([]);
  });
});

describe("getPlatformAiUsageSummary — Phase 10 Part 0.4: stale-rollup fallback", () => {
  it("marks thisMonthDataSource 'rollup' when the rollup job has run recently", async () => {
    await markRollupFresh();
    const summary = await getPlatformAiUsageSummary(makeActor(), "test");
    expect((summary as any).thisMonthDataSource).toBe("rollup");
  });

  it("marks thisMonthDataSource 'live' and computes from AiUsageRecord when the rollup job has never run", async () => {
    // No SchedulerJobRun row at all — isAiUsageRollupStale() treats "never run" as stale.
    await AiUsageMonthly.create({
      tenantId: "org-e",
      period: getAiPeriod(),
      feature: "ai_assistant",
      requestCount: 999, // a stale number that must NOT be trusted
    });
    await AiUsageRecord.create({
      tenantId: "org-e",
      feature: "ai_assistant",
      modelName: "gpt-4o",
      inputTokens: 5,
      outputTokens: 5,
      estimatedCostUsd: 0.02,
      latencyMs: 10,
      status: AI_USAGE_REQUEST_STATUS.SUCCESS,
      requestId: "req-live-1",
    });

    const summary = await getPlatformAiUsageSummary(makeActor(), "test");
    expect((summary as any).thisMonthDataSource).toBe("live");
    expect((summary as any).totalRequestsThisMonth).toBe(1); // the live record, not the stale 999
  });

  it("marks thisMonthDataSource 'live' when the rollup job ran too long ago", async () => {
    await SchedulerJobRun.create({
      jobId: "platform-ai-usage-rollup",
      lastRunAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      lastRunStatus: "success",
    });
    const summary = await getPlatformAiUsageSummary(makeActor(), "test");
    expect((summary as any).thisMonthDataSource).toBe("live");
  });
});
