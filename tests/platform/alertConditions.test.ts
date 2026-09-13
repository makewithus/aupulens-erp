import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_alertconditions";

import PlatformAlert from "@/models/platform/PlatformAlert";
import PlatformAlertConfig from "@/models/platform/PlatformAlertConfig";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import AiUsageDaily from "@/models/platform/AiUsageDaily";
import SchedulerJobRun from "@/models/platform/SchedulerJobRun";
import { PLAN_KEY } from "@/lib/constants/statuses";

let checkFailedLoginSpike: typeof import("@/lib/platform/alerts/conditions").checkFailedLoginSpike;
let checkPermissionFailureSpike: typeof import("@/lib/platform/alerts/conditions").checkPermissionFailureSpike;
let checkLargeDowngrade: typeof import("@/lib/platform/alerts/conditions").checkLargeDowngrade;
let checkAiCostSpike: typeof import("@/lib/platform/alerts/conditions").checkAiCostSpike;
let recordMassDataExport: typeof import("@/lib/platform/alerts/conditions").recordMassDataExport;
let checkSystemErrorSpike: typeof import("@/lib/platform/alerts/conditions").checkSystemErrorSpike;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  await PlatformAlert.init();
  await PlatformAlertConfig.init();
  await PlatformAuditLog.init();
  await AiUsageDaily.init();
  await SchedulerJobRun.init();
  ({
    checkFailedLoginSpike,
    checkPermissionFailureSpike,
    checkLargeDowngrade,
    checkAiCostSpike,
    recordMassDataExport,
    checkSystemErrorSpike,
  } = await import("@/lib/platform/alerts/conditions"));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

afterEach(async () => {
  await PlatformAlert.deleteMany({});
  await PlatformAlertConfig.deleteMany({});
  await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
  await AiUsageDaily.deleteMany({});
  await SchedulerJobRun.deleteMany({});
});

describe("checkFailedLoginSpike — reuses AdminUser's own failedLoginCount, default threshold 5", () => {
  it("raises exactly once when the threshold is reached, not once per call above it", async () => {
    await checkFailedLoginSpike("admin@example.com", 5);
    await checkFailedLoginSpike("admin@example.com", 6); // a further failure — still one alert
    const alerts = await PlatformAlert.find({ alertType: "failed_login_spike" });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].resolvedAt).toBeUndefined();
  });

  it("does not raise below the threshold", async () => {
    await checkFailedLoginSpike("admin@example.com", 3);
    expect(await PlatformAlert.countDocuments({ alertType: "failed_login_spike" })).toBe(0);
  });

  it("a successful login (count reset to 0) auto-resolves the standing alert", async () => {
    await checkFailedLoginSpike("admin@example.com", 5);
    expect((await PlatformAlert.findOne({ alertType: "failed_login_spike" }))!.resolvedAt).toBeUndefined();

    await checkFailedLoginSpike("admin@example.com", 0);
    expect((await PlatformAlert.findOne({ alertType: "failed_login_spike" }))!.resolvedAt).toBeInstanceOf(Date);
  });

  it("a configured non-default threshold is honoured", async () => {
    await PlatformAlertConfig.create({ singleton: true, failedLoginThreshold: 2 });
    await checkFailedLoginSpike("admin@example.com", 2);
    expect(await PlatformAlert.countDocuments({ alertType: "failed_login_spike" })).toBe(1);
  });
});

describe("checkPermissionFailureSpike — reads the real CAPABILITY_DENIED audit trail", () => {
  const actorId = new mongoose.Types.ObjectId().toString();

  async function seedDenials(count: number) {
    for (let i = 0; i < count; i++) {
      await PlatformAuditLog.create({
        actorId,
        actorType: "admin",
        actorRole: "global_admin",
        eventCategory: "security",
        eventType: "capability_denied",
        severity: "security",
        metadata: { capability: "manage_plans" },
      });
    }
  }

  it("raises once the default threshold (10) is reached within the window", async () => {
    await seedDenials(10);
    await checkPermissionFailureSpike(actorId);
    expect(await PlatformAlert.countDocuments({ alertType: "permission_failure_spike" })).toBe(1);
  });

  it("does not raise below the threshold", async () => {
    await seedDenials(3);
    await checkPermissionFailureSpike(actorId);
    expect(await PlatformAlert.countDocuments({ alertType: "permission_failure_spike" })).toBe(0);
  });

  it("ignores an actor id of 'unknown' (an unattributable denial) entirely", async () => {
    await checkPermissionFailureSpike("unknown");
    expect(await PlatformAlert.countDocuments({ alertType: "permission_failure_spike" })).toBe(0);
  });

  it("a sustained spike (called twice, still over threshold) raises only one alert", async () => {
    await seedDenials(10);
    await checkPermissionFailureSpike(actorId);
    await seedDenials(1);
    await checkPermissionFailureSpike(actorId);
    expect(await PlatformAlert.countDocuments({ alertType: "permission_failure_spike" })).toBe(1);
  });
});

describe("checkLargeDowngrade — plan-rank drop of 2+ tiers by default", () => {
  it("raises for a 2-tier drop (business -> starter)", async () => {
    await checkLargeDowngrade("acme", PLAN_KEY.BUSINESS, PLAN_KEY.STARTER);
    const alert = await PlatformAlert.findOne({ alertType: "large_subscription_downgrade" });
    expect(alert).not.toBeNull();
    expect(alert!.tenantId).toBe("acme");
  });

  it("does not raise for a 1-tier drop", async () => {
    await checkLargeDowngrade("acme", PLAN_KEY.PRO, PLAN_KEY.GROWTH);
    expect(await PlatformAlert.countDocuments({ alertType: "large_subscription_downgrade" })).toBe(0);
  });

  it("does not raise for an upgrade", async () => {
    await checkLargeDowngrade("acme", PLAN_KEY.STARTER, PLAN_KEY.ENTERPRISE);
    expect(await PlatformAlert.countDocuments({ alertType: "large_subscription_downgrade" })).toBe(0);
  });

  it("never treats a transition to/from CUSTOM as rank-comparable", async () => {
    await checkLargeDowngrade("acme", PLAN_KEY.ENTERPRISE, PLAN_KEY.CUSTOM);
    expect(await PlatformAlert.countDocuments({ alertType: "large_subscription_downgrade" })).toBe(0);
  });

  it("does nothing for a brand-new assignment (fromPlanKey null)", async () => {
    await checkLargeDowngrade("acme", null, PLAN_KEY.STARTER);
    expect(await PlatformAlert.countDocuments({ alertType: "large_subscription_downgrade" })).toBe(0);
  });
});

describe("checkAiCostSpike — today's cost vs. trailing average", () => {
  function daysAgo(n: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }

  it("raises when today's cost is >= the configured multiplier times the trailing average", async () => {
    for (let i = 1; i <= 5; i++) {
      await AiUsageDaily.create({ tenantId: "t1", period: daysAgo(i), feature: "ai_assistant", estimatedCostUsd: 10 });
    }
    await AiUsageDaily.create({ tenantId: "t1", period: daysAgo(0), feature: "ai_assistant", estimatedCostUsd: 100 });

    await checkAiCostSpike();
    const alert = await PlatformAlert.findOne({ alertType: "ai_cost_spike" });
    expect(alert).not.toBeNull();
  });

  it("does not raise when there is no prior history to compare against", async () => {
    await AiUsageDaily.create({ tenantId: "t1", period: daysAgo(0), feature: "ai_assistant", estimatedCostUsd: 500 });
    await checkAiCostSpike();
    expect(await PlatformAlert.countDocuments({ alertType: "ai_cost_spike" })).toBe(0);
  });

  it("does not raise for ordinary day-to-day variation under the multiplier", async () => {
    for (let i = 1; i <= 5; i++) {
      await AiUsageDaily.create({ tenantId: "t1", period: daysAgo(i), feature: "ai_assistant", estimatedCostUsd: 10 });
    }
    await AiUsageDaily.create({ tenantId: "t1", period: daysAgo(0), feature: "ai_assistant", estimatedCostUsd: 15 });
    await checkAiCostSpike();
    expect(await PlatformAlert.countDocuments({ alertType: "ai_cost_spike" })).toBe(0);
  });

  it("calling it twice on the same spiking day raises only one alert (dedupe)", async () => {
    for (let i = 1; i <= 5; i++) {
      await AiUsageDaily.create({ tenantId: "t1", period: daysAgo(i), feature: "ai_assistant", estimatedCostUsd: 10 });
    }
    await AiUsageDaily.create({ tenantId: "t1", period: daysAgo(0), feature: "ai_assistant", estimatedCostUsd: 100 });
    await checkAiCostSpike();
    await checkAiCostSpike();
    expect(await PlatformAlert.countDocuments({ alertType: "ai_cost_spike" })).toBe(1);
  });
});

describe("recordMassDataExport — Phase 11 Part 1.7 (source doc §28)", () => {
  it("always writes an audit row, even below the alert threshold", async () => {
    await recordMassDataExport({ tenantId: "acme", actorUserId: "user-1", entityType: "Lead", recordCount: 10, format: "csv" });
    const audits = await PlatformAuditLog.find({ tenantId: "acme", eventType: "mass_data_export" });
    expect(audits).toHaveLength(1);
    expect(audits[0].actorType).toBe("tenant_user");
    expect(audits[0].actorId).toBe("user-1");
    expect(audits[0].entityType).toBe("Lead");
    expect((audits[0].metadata as any).recordCount).toBe(10);
    expect((audits[0].metadata as any).format).toBe("csv");
    expect(audits[0].severity).toBe("info"); // below threshold
  });

  it("raises an alert only when the record count reaches the configured threshold (default 1000)", async () => {
    await recordMassDataExport({ tenantId: "acme", actorUserId: "user-1", entityType: "Lead", recordCount: 50, format: "csv" });
    expect(await PlatformAlert.countDocuments({ alertType: "mass_data_export" })).toBe(0);

    await recordMassDataExport({ tenantId: "acme", actorUserId: "user-1", entityType: "Lead", recordCount: 1000, format: "csv" });
    expect(await PlatformAlert.countDocuments({ alertType: "mass_data_export" })).toBe(1);

    const audits = await PlatformAuditLog.find({ tenantId: "acme", eventType: "mass_data_export", "metadata.recordCount": 1000 });
    expect(audits[0].severity).toBe("warning"); // at/above threshold
  });

  it("respects a configured threshold, not a hardcoded one", async () => {
    await PlatformAlertConfig.create({ singleton: true, massExportRecordThreshold: 5 });
    await recordMassDataExport({ tenantId: "acme", actorUserId: "user-1", entityType: "Contact", recordCount: 6, format: "xlsx" });
    expect(await PlatformAlert.countDocuments({ alertType: "mass_data_export" })).toBe(1);
  });

  it("never throws — a logging failure must not turn a successful export into a failed one", async () => {
    await expect(
      recordMassDataExport({ tenantId: "acme", actorUserId: "user-1", entityType: "Lead", recordCount: NaN as unknown as number, format: "csv" }),
    ).resolves.not.toThrow();
  });
});

describe("checkSystemErrorSpike — Phase 12 Part 0.2 (source doc §28, re-triaged from DECLARED_NOT_POSSIBLE)", () => {
  it("does not raise below the default threshold of 3 simultaneously-failing jobs", async () => {
    await SchedulerJobRun.create({ jobId: "job-a", lastRunStatus: "error" });
    await SchedulerJobRun.create({ jobId: "job-b", lastRunStatus: "error" });
    await SchedulerJobRun.create({ jobId: "job-c", lastRunStatus: "success" });

    await checkSystemErrorSpike();
    expect(await PlatformAlert.countDocuments({ alertType: "system_error_spike" })).toBe(0);
  });

  it("raises once the count of currently-failing jobs reaches the threshold", async () => {
    await SchedulerJobRun.create({ jobId: "job-a", lastRunStatus: "error" });
    await SchedulerJobRun.create({ jobId: "job-b", lastRunStatus: "error" });
    await SchedulerJobRun.create({ jobId: "job-c", lastRunStatus: "error" });

    await checkSystemErrorSpike();
    const alerts = await PlatformAlert.find({ alertType: "system_error_spike" });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("error");
  });

  it("respects a configured threshold, not a hardcoded one", async () => {
    await PlatformAlertConfig.create({ singleton: true, systemErrorSpikeThreshold: 1 });
    await SchedulerJobRun.create({ jobId: "job-a", lastRunStatus: "error" });

    await checkSystemErrorSpike();
    expect(await PlatformAlert.countDocuments({ alertType: "system_error_spike" })).toBe(1);
  });

  it("calling it twice while still spiking raises only one alert (dedupe)", async () => {
    for (let i = 0; i < 3; i++) {
      await SchedulerJobRun.create({ jobId: `job-${i}`, lastRunStatus: "error" });
    }
    await checkSystemErrorSpike();
    await checkSystemErrorSpike();
    expect(await PlatformAlert.countDocuments({ alertType: "system_error_spike" })).toBe(1);
  });

  it("auto-resolves once the failing count drops back below the threshold", async () => {
    const jobs = await Promise.all([
      SchedulerJobRun.create({ jobId: "job-a", lastRunStatus: "error" }),
      SchedulerJobRun.create({ jobId: "job-b", lastRunStatus: "error" }),
      SchedulerJobRun.create({ jobId: "job-c", lastRunStatus: "error" }),
    ]);
    await checkSystemErrorSpike();
    expect(await PlatformAlert.countDocuments({ alertType: "system_error_spike", resolvedAt: { $exists: false } })).toBe(1);

    await SchedulerJobRun.updateOne({ _id: jobs[0]._id }, { lastRunStatus: "success" });
    await checkSystemErrorSpike();
    expect(await PlatformAlert.countDocuments({ alertType: "system_error_spike", resolvedAt: { $exists: false } })).toBe(0);
  });
});
