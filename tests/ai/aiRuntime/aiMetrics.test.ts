import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_aimetrics";

import AiLearningRecord from "@/models/ai/AiLearningRecord";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiAttentionItem from "@/models/ai/AiAttentionItem";
import AiDetectorHealth from "@/models/ai/AiDetectorHealth";
import AiMetricSnapshot from "@/models/ai/AiMetricSnapshot";

let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let computeWorkflowMetrics: typeof import("@/lib/aiRuntime/metrics/computeMetrics").computeWorkflowMetrics;
let computeAndPersistTenantMetrics: typeof import("@/lib/aiRuntime/metrics/computeMetrics").computeAndPersistTenantMetrics;
let checkDrift: typeof import("@/lib/aiRuntime/metrics/drift").checkDrift;

const TENANT = "aimetrics-tenant";

async function makeRun(workflowId: string, opts: { scanned: number; autoActioned: number; policyOverrides?: number; autonomyApplied?: string; createdAt: Date }) {
  return AiWorkflowRun.create({
    tenantId: TENANT,
    workflowId,
    workflowVersion: "1.0.0",
    entityId: TENANT,
    status: "completed",
    autonomyApplied: opts.autonomyApplied ?? "recommend",
    metrics: { scanned: opts.scanned, matched: 0, exceptions: 0, autoActioned: opts.autoActioned, policy_overrides: opts.policyOverrides ?? 0 },
    startedAt: opts.createdAt,
    finishedAt: opts.createdAt,
    createdAt: opts.createdAt,
  });
}

describe("AI metrics — computation and drift", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([AiLearningRecord.init(), AiWorkflowRun.init(), AiAttentionItem.init(), AiDetectorHealth.init(), AiMetricSnapshot.init()]);
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ computeWorkflowMetrics, computeAndPersistTenantMetrics } = await import("@/lib/aiRuntime/metrics/computeMetrics"));
    ({ checkDrift } = await import("@/lib/aiRuntime/metrics/drift"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([AiLearningRecord.deleteMany({}), AiWorkflowRun.deleteMany({}), AiAttentionItem.deleteMany({}), AiDetectorHealth.deleteMany({}), AiMetricSnapshot.deleteMany({})]);
  });

  it("override_rate is computed from real AiLearningRecord outcomes, never invented", async () => {
    const now = new Date();
    await AiLearningRecord.create({ tenantId: TENANT, workflowId: "AI-07", runId: new mongoose.Types.ObjectId(), proposal: {}, outcome: "accepted" });
    await AiLearningRecord.create({ tenantId: TENANT, workflowId: "AI-07", runId: new mongoose.Types.ObjectId(), proposal: {}, outcome: "accepted" });
    await AiLearningRecord.create({ tenantId: TENANT, workflowId: "AI-07", runId: new mongoose.Types.ObjectId(), proposal: {}, outcome: "edited", editedValue: { amount: 100 } });
    await AiLearningRecord.create({ tenantId: TENANT, workflowId: "AI-07", runId: new mongoose.Types.ObjectId(), proposal: {}, outcome: "pending" }); // excluded

    const result = await computeWorkflowMetrics(TENANT, "AI-07", now);
    expect(result.metrics.overrideSampleSize).toBe(3); // pending excluded
    expect(result.metrics.overrideRate).toBeCloseTo(1 / 3, 3);
  });

  it("a workflow with zero AiLearningRecord activity reports override_rate as not computable, not zero", async () => {
    const result = await computeWorkflowMetrics(TENANT, "AI-13", new Date());
    expect(result.metrics.overrideRate).toBeNull();
    expect(result.notComputable.some((n) => n.what.includes("override_rate"))).toBe(true);
  });

  it("automation_coverage is computed from real AiWorkflowRun.metrics, and policy_overrides is folded in unchanged", async () => {
    const now = new Date();
    await makeRun("AI-03", { scanned: 10, autoActioned: 6, policyOverrides: 2, createdAt: now });
    await makeRun("AI-03", { scanned: 10, autoActioned: 4, policyOverrides: 1, createdAt: now });

    const result = await computeWorkflowMetrics(TENANT, "AI-03", now);
    expect(result.metrics.automationCoverage).toBeCloseTo(10 / 20, 3);
    expect(result.metrics.policyOverrideCount).toBe(3);
    expect(result.metrics.runCount).toBe(2);
  });

  it("exception_resolution_time is computed from real AiAttentionItem timestamps", async () => {
    const created = new Date("2026-01-01T00:00:00Z");
    const resolved = new Date("2026-01-01T05:00:00Z"); // 5 hours
    await AiAttentionItem.create({
      tenantId: TENANT, workflowId: "AI-15", runId: new mongoose.Types.ObjectId(), priority: "medium",
      what: "test", why: "test", dedupeKey: `test-${Date.now()}`, status: "resolved", resolvedAt: resolved, createdAt: created,
    });

    const result = await computeWorkflowMetrics(TENANT, "AI-15", new Date("2026-01-02T00:00:00Z"));
    expect(result.metrics.exceptionResolutionSampleSize).toBe(1);
    expect(result.metrics.exceptionResolutionHoursAvg).toBe(5);
  });

  it("false_match_rate folds in AI-15's real detector_health precision, never recomputed a second way", async () => {
    await AiDetectorHealth.create({ tenantId: TENANT, detectorId: "amount_outlier", raised: 20, confirmed: 16, dismissed: 4, precision: 0.8, sampleSize: 20 });
    const result = await computeWorkflowMetrics(TENANT, "AI-15", new Date());
    expect(result.metrics.falseMatchRate).toBeCloseTo(0.2, 3);
    expect(result.metrics.detectorSampleSize).toBe(20);
  });

  it("computeAndPersistTenantMetrics writes one AiMetricSnapshot per registered workflow", async () => {
    const results = await computeAndPersistTenantMetrics(TENANT);
    expect(results.length).toBeGreaterThanOrEqual(30);
    const stored = await AiMetricSnapshot.countDocuments({ tenantId: TENANT });
    expect(stored).toBe(results.length);
  });

  it("drift: an override-rate regression past the threshold raises a named attention item", async () => {
    const now = new Date("2026-02-10T00:00:00Z");
    const baselineDate = new Date(Date.UTC(2026, 1, 3));
    const todayDate = new Date(Date.UTC(2026, 1, 10));
    await AiWorkflowRun.create({ tenantId: TENANT, workflowId: "AI-07", workflowVersion: "1.0.0", entityId: TENANT, status: "completed", autonomyApplied: "draft", metrics: { scanned: 1, matched: 0, exceptions: 0, autoActioned: 1, policy_overrides: 0 }, startedAt: now, createdAt: now });
    await AiMetricSnapshot.create({ tenantId: TENANT, workflowId: "AI-07", snapshotDate: baselineDate, metrics: { overrideRate: 0.05, overrideSampleSize: 20, automationCoverage: 0.8, exceptionResolutionHoursAvg: null, exceptionResolutionSampleSize: 0, policyOverrideCount: 0, falseMatchRate: null, detectorSampleSize: 0, runCount: 20, autonomyApplied: "draft" } });
    await AiMetricSnapshot.create({ tenantId: TENANT, workflowId: "AI-07", snapshotDate: todayDate, metrics: { overrideRate: 0.4, overrideSampleSize: 20, automationCoverage: 0.8, exceptionResolutionHoursAvg: null, exceptionResolutionSampleSize: 0, policyOverrideCount: 0, falseMatchRate: null, detectorSampleSize: 0, runCount: 20, autonomyApplied: "draft" } });

    const findings = await checkDrift(TENANT, "AI-07", todayDate);
    expect(findings.length).toBe(1);
    expect(findings[0].metric).toBe("override_rate");

    const item = await AiAttentionItem.findOne({ tenantId: TENANT, workflowId: "AI-07" }).lean();
    expect(item).toBeDefined();
    expect(item!.what).toContain("AI-07");
  });

  it("drift: a small, below-threshold sample never raises (avoids noisy false alarms on thin data)", async () => {
    const baselineDate = new Date(Date.UTC(2026, 1, 3));
    const todayDate = new Date(Date.UTC(2026, 1, 10));
    await AiMetricSnapshot.create({ tenantId: TENANT, workflowId: "AI-05", snapshotDate: baselineDate, metrics: { overrideRate: 0.0, overrideSampleSize: 2, automationCoverage: null, exceptionResolutionHoursAvg: null, exceptionResolutionSampleSize: 0, policyOverrideCount: 0, falseMatchRate: null, detectorSampleSize: 0, runCount: 2, autonomyApplied: "draft" } });
    await AiMetricSnapshot.create({ tenantId: TENANT, workflowId: "AI-05", snapshotDate: todayDate, metrics: { overrideRate: 0.5, overrideSampleSize: 2, automationCoverage: null, exceptionResolutionHoursAvg: null, exceptionResolutionSampleSize: 0, policyOverrideCount: 0, falseMatchRate: null, detectorSampleSize: 0, runCount: 2, autonomyApplied: "draft" } });

    const findings = await checkDrift(TENANT, "AI-05", todayDate);
    expect(findings).toEqual([]);
  });
});
