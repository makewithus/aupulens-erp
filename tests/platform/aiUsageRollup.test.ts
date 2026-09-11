import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_ai_rollup";

import AiUsageRecord from "@/models/platform/AiUsageRecord";
import AiUsageDaily from "@/models/platform/AiUsageDaily";
import AiUsageMonthly from "@/models/platform/AiUsageMonthly";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import { AI_USAGE_FEATURE_BUCKET, AI_USAGE_REQUEST_STATUS } from "@/lib/constants/statuses";

let rollupAiUsageForDay: typeof import("@/lib/platform/ai/rollup").rollupAiUsageForDay;

const DAY = new Date("2026-06-15T12:00:00Z");

describe("rollupAiUsageForDay — idempotent aggregation", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await AiUsageRecord.init();
    await AiUsageDaily.init();
    await AiUsageMonthly.init();
    await AiWorkflowRun.init();
    ({ rollupAiUsageForDay } = await import("@/lib/platform/ai/rollup"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await AiUsageRecord.deleteMany({});
    await AiUsageDaily.deleteMany({});
    await AiUsageMonthly.deleteMany({});
    await AiWorkflowRun.deleteMany({});
  });

  async function seedRecords() {
    await AiUsageRecord.create({
      tenantId: "acme",
      feature: AI_USAGE_FEATURE_BUCKET.AI_ASSISTANT,
      modelName: "gpt-4o",
      inputTokens: 100,
      outputTokens: 50,
      estimatedCostUsd: 1.5,
      latencyMs: 500,
      status: AI_USAGE_REQUEST_STATUS.SUCCESS,
      requestId: "r1",
      createdAt: DAY,
    });
    await AiUsageRecord.create({
      tenantId: "acme",
      feature: AI_USAGE_FEATURE_BUCKET.AI_ASSISTANT,
      modelName: "gpt-4o",
      inputTokens: 200,
      outputTokens: 100,
      estimatedCostUsd: 3,
      latencyMs: 400,
      status: AI_USAGE_REQUEST_STATUS.ERROR,
      requestId: "r2",
      createdAt: DAY,
    });
  }

  it("aggregates AiUsageRecord into a daily rollup with correct sums", async () => {
    await seedRecords();
    await rollupAiUsageForDay(DAY);

    const daily = await AiUsageDaily.findOne({ tenantId: "acme", feature: AI_USAGE_FEATURE_BUCKET.AI_ASSISTANT });
    expect(daily!.requestCount).toBe(2);
    expect(daily!.inputTokens).toBe(300);
    expect(daily!.outputTokens).toBe(150);
    expect(daily!.estimatedCostUsd).toBe(4.5);
    expect(daily!.errorCount).toBe(1);
  });

  it("is idempotent — re-running for the same day does not double the totals", async () => {
    await seedRecords();
    await rollupAiUsageForDay(DAY);
    await rollupAiUsageForDay(DAY); // re-run

    const daily = await AiUsageDaily.findOne({ tenantId: "acme", feature: AI_USAGE_FEATURE_BUCKET.AI_ASSISTANT });
    expect(daily!.requestCount).toBe(2); // NOT 4
  });

  it("folds AiWorkflowRun documents into the ai_automation bucket, request-count only", async () => {
    await AiWorkflowRun.create({
      tenantId: "acme",
      workflowId: "ai-01-something",
      workflowVersion: "1",
      entityId: "entity-1",
      status: "completed",
      autonomyApplied: "recommend",
      summary: "test run",
      findings: [],
      metrics: { scanned: 10, matched: 5, exceptions: 0, autoActioned: 0, policy_overrides: 0 },
      startedAt: DAY,
      createdAt: DAY,
    });

    await rollupAiUsageForDay(DAY);

    const automation = await AiUsageDaily.findOne({ tenantId: "acme", feature: AI_USAGE_FEATURE_BUCKET.AI_AUTOMATION });
    expect(automation!.requestCount).toBe(1);
    expect(automation!.inputTokens).toBe(0); // honest zero — not tracked per-workflow-run
    expect(automation!.estimatedCostUsd).toBe(0);
  });

  it("computes the monthly rollup from the sum of that month's daily rows", async () => {
    await seedRecords();
    await rollupAiUsageForDay(DAY);

    const monthly = await AiUsageMonthly.findOne({ tenantId: "acme", period: "202606", feature: AI_USAGE_FEATURE_BUCKET.AI_ASSISTANT });
    expect(monthly!.requestCount).toBe(2);
    expect(monthly!.estimatedCostUsd).toBe(4.5);
  });

  it("keeps different tenants' rollups independent", async () => {
    await seedRecords();
    await AiUsageRecord.create({
      tenantId: "globex",
      feature: AI_USAGE_FEATURE_BUCKET.AI_REPORTS,
      modelName: "gpt-4o",
      inputTokens: 10,
      outputTokens: 5,
      estimatedCostUsd: 0.1,
      latencyMs: 100,
      status: AI_USAGE_REQUEST_STATUS.SUCCESS,
      requestId: "r3",
      createdAt: DAY,
    });

    await rollupAiUsageForDay(DAY);

    const acmeDaily = await AiUsageDaily.find({ tenantId: "acme" });
    const globexDaily = await AiUsageDaily.find({ tenantId: "globex" });
    expect(acmeDaily.every((d) => d.tenantId === "acme")).toBe(true);
    expect(globexDaily).toHaveLength(1);
    expect(globexDaily[0].feature).toBe(AI_USAGE_FEATURE_BUCKET.AI_REPORTS);
  });
});
