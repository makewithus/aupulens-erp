import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_ai_instrumentation";

import AiUsageRecord from "@/models/platform/AiUsageRecord";
import AiCostRate from "@/models/platform/AiCostRate";

let recordAiUsage: typeof import("@/lib/platform/ai/instrumentation").recordAiUsage;

describe("recordAiUsage — server-side cost computation, no sensitive data stored", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await AiUsageRecord.init();
    await AiCostRate.init();
    ({ recordAiUsage } = await import("@/lib/platform/ai/instrumentation"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await AiUsageRecord.deleteMany({});
    await AiCostRate.deleteMany({});
  });

  it("computes cost server-side from a stored AiCostRate — never a client value", async () => {
    await AiCostRate.create({ modelName: "gpt-4o", inputCostPerMillionTokens: 2.5, outputCostPerMillionTokens: 10 });

    await recordAiUsage({
      tenantId: "acme",
      feature: "chat",
      model: "gpt-4o",
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      latencyMs: 1200,
      status: "success",
    });

    const record = await AiUsageRecord.findOne({ tenantId: "acme" });
    expect(record).not.toBeNull();
    // 1M input tokens * $2.5/M + 0.5M output tokens * $10/M = 2.5 + 5 = 7.5
    expect(record!.estimatedCostUsd).toBeCloseTo(7.5, 5);
  });

  it("reports cost as 0 when no rate exists for the model — never guessed from another model's rate", async () => {
    await recordAiUsage({
      tenantId: "acme",
      feature: "chat",
      model: "unknown-deployment",
      inputTokens: 1000,
      outputTokens: 500,
      latencyMs: 100,
      status: "success",
    });
    const record = await AiUsageRecord.findOne({ tenantId: "acme" });
    expect(record!.estimatedCostUsd).toBe(0);
  });

  it("records a failed request at 0 cost, never computing cost for a failure", async () => {
    await AiCostRate.create({ modelName: "gpt-4o", inputCostPerMillionTokens: 2.5, outputCostPerMillionTokens: 10 });
    await recordAiUsage({
      tenantId: "acme",
      feature: "chat",
      model: "gpt-4o",
      inputTokens: 500,
      outputTokens: 0,
      latencyMs: 50,
      status: "error",
    });
    const record = await AiUsageRecord.findOne({ tenantId: "acme" });
    expect(record!.status).toBe("error");
    expect(record!.estimatedCostUsd).toBe(0);
  });

  it("maps a known AiFeature key to its documented bucket (see docs/admin/AI_FEATURE_MAP.md)", async () => {
    await recordAiUsage({
      tenantId: "acme",
      feature: "suggestion",
      model: "gpt-4o",
      inputTokens: 100,
      outputTokens: 50,
      latencyMs: 10,
      status: "success",
    });
    const record = await AiUsageRecord.findOne({ tenantId: "acme" });
    expect(record!.feature).toBe("ai_reports");
  });

  it("never persists prompt or response text — the schema has no such field, and the input shape carries none (Hard Rule 9)", async () => {
    await recordAiUsage({
      tenantId: "acme",
      feature: "chat",
      model: "gpt-4o",
      inputTokens: 10,
      outputTokens: 5,
      latencyMs: 10,
      status: "success",
    });
    const record = await AiUsageRecord.findOne({ tenantId: "acme" }).lean();
    const keys = Object.keys(record!);
    expect(keys.some((k) => /prompt|response|message|text/i.test(k))).toBe(false);
  });

  it("never throws back to the caller even if the DB write fails", async () => {
    const createSpy = vi.spyOn(AiUsageRecord, "create").mockRejectedValueOnce(new Error("simulated DB failure"));
    await expect(
      recordAiUsage({
        tenantId: "acme",
        feature: "chat",
        model: "gpt-4o",
        inputTokens: 10,
        outputTokens: 5,
        latencyMs: 10,
        status: "success",
      }),
    ).resolves.toBeUndefined();
    createSpy.mockRestore();
  });
});
