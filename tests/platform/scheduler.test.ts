import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_scheduler";

import SchedulerJobRun from "@/models/platform/SchedulerJobRun";
import SchedulerJobLock from "@/models/platform/SchedulerJobLock";
import PlatformAlert from "@/models/platform/PlatformAlert";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import AdminRole from "@/models/platform/AdminRole";
import { ADMIN_CAPABILITY, ADMIN_ROLE } from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";

let getJobStatuses: typeof import("@/lib/platform/scheduler/runner").getJobStatuses;
let runDueJobs: typeof import("@/lib/platform/scheduler/runner").runDueJobs;
let runJobNow: typeof import("@/lib/platform/scheduler/runner").runJobNow;
let getJobDefinition: typeof import("@/lib/platform/scheduler/registry").getJobDefinition;
let JOB_REGISTRY: typeof import("@/lib/platform/scheduler/registry").JOB_REGISTRY;

function makeActor(role: string = ADMIN_ROLE.GLOBAL_SUPER_ADMIN): AdminActor {
  return {
    id: new mongoose.Types.ObjectId().toString(),
    email: "actor@example.com",
    name: "Actor",
    role: role as AdminActor["role"],
    sessionId: "test-session",
  };
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  await SchedulerJobRun.init();
  await SchedulerJobLock.init();
  await PlatformAlert.init();
  await PlatformAuditLog.init();
  await AdminRole.init();
  ({ getJobStatuses, runDueJobs, runJobNow } = await import("@/lib/platform/scheduler/runner"));
  ({ getJobDefinition, JOB_REGISTRY } = await import("@/lib/platform/scheduler/registry"));
  await AdminRole.create({
    role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
    capabilities: [ADMIN_CAPABILITY.MANAGE_SCHEDULED_JOBS],
    description: "",
  });
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

afterEach(async () => {
  await SchedulerJobRun.deleteMany({});
  await SchedulerJobLock.deleteMany({});
  await PlatformAlert.deleteMany({});
  await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
  vi.restoreAllMocks();
});

describe("the job registry — every job from docs/admin/CRON_INCIDENT.md is present", () => {
  it("registers all 12 jobs that used to be scheduled via vercel.json", () => {
    expect(JOB_REGISTRY).toHaveLength(12);
    const ids = JOB_REGISTRY.map((j) => j.jobId);
    expect(ids).toContain("crm-automations");
    expect(ids).toContain("ai-runtime-sweep");
    expect(ids).toContain("platform-ai-usage-rollup");
    expect(ids).toContain("platform-access-session-expiry");
  });

  it("every job has a real handler and a positive interval", () => {
    for (const job of JOB_REGISTRY) {
      expect(typeof job.handler).toBe("function");
      expect(job.intervalMinutes).toBeGreaterThan(0);
    }
  });
});

describe("getJobStatuses — due/stale computation", () => {
  it("a never-run job is immediately due", async () => {
    const statuses = await getJobStatuses();
    for (const status of statuses) {
      expect(status.isDue).toBe(true);
      expect(status.lastRunAt).toBeNull();
    }
  });

  it("a job run just now is not due again until its interval elapses", async () => {
    await SchedulerJobRun.create({
      jobId: "platform-ai-usage-rollup", // 1440-minute interval
      lastRunAt: new Date(),
      lastRunStatus: "success",
    });
    const statuses = await getJobStatuses();
    const status = statuses.find((s) => s.jobId === "platform-ai-usage-rollup")!;
    expect(status.isDue).toBe(false);
    expect(status.isStale).toBe(false);
  });

  it("a job overdue past 3x its interval is flagged stale", async () => {
    const veryOld = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    await SchedulerJobRun.create({
      jobId: "platform-ai-usage-rollup",
      lastRunAt: veryOld,
      lastRunStatus: "success",
    });
    const statuses = await getJobStatuses();
    const status = statuses.find((s) => s.jobId === "platform-ai-usage-rollup")!;
    expect(status.isDue).toBe(true);
    expect(status.isStale).toBe(true);
  });
});

describe("runDueJobs — the distributed lock prevents a double-run", () => {
  it("a job whose lock is already held is skipped, not run twice", async () => {
    const job = getJobDefinition("platform-retention-sweep")!;
    // Simulate a concurrent runner already holding the lock.
    await SchedulerJobLock.create({
      jobId: job.jobId,
      acquiredAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const handlerSpy = vi.spyOn(job, "handler");
    const result = await runDueJobs("run-due");

    expect(result.skipped).toContain(job.jobId);
    expect(result.ran).not.toContain(job.jobId);
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it("releases the lock after a successful run, so the next call can run it again", async () => {
    const job = getJobDefinition("platform-retention-sweep")!;
    vi.spyOn(job, "handler").mockResolvedValue({ ok: true });

    await runDueJobs("run-due");
    expect(await SchedulerJobLock.findOne({ jobId: job.jobId })).toBeNull();

    const run = await SchedulerJobRun.findOne({ jobId: job.jobId });
    expect(run!.lastRunStatus).toBe("success");
  });

  it("releases the lock even when the handler throws, and records the error", async () => {
    const job = getJobDefinition("platform-retention-sweep")!;
    vi.spyOn(job, "handler").mockRejectedValue(new Error("boom"));

    const result = await runDueJobs("run-due");
    expect(result.failed).toContain(job.jobId);
    expect(await SchedulerJobLock.findOne({ jobId: job.jobId })).toBeNull();

    const run = await SchedulerJobRun.findOne({ jobId: job.jobId });
    expect(run!.lastRunStatus).toBe("error");
    expect(run!.lastError).toBe("boom");
  });

  it("a failing job raises a scheduler_job_failed alert, deduped on repeat failures", async () => {
    const job = getJobDefinition("platform-retention-sweep")!;
    vi.spyOn(job, "handler").mockRejectedValue(new Error("boom"));

    await runDueJobs("run-due");
    // Force it due again immediately for a second failure in the same test.
    await SchedulerJobRun.updateOne({ jobId: job.jobId }, { $set: { lastRunAt: new Date(0) } });
    await runDueJobs("run-due");

    const alerts = await PlatformAlert.find({ alertType: "scheduler_job_failed" });
    expect(alerts).toHaveLength(1); // deduped, not one per failure
  });
});

describe("runJobNow — manual trigger, capability-gated and audited", () => {
  it("runs immediately even if not yet due, and audits the action", async () => {
    const job = getJobDefinition("platform-retention-sweep")!;
    vi.spyOn(job, "handler").mockResolvedValue({ ok: true });
    await SchedulerJobRun.create({ jobId: job.jobId, lastRunAt: new Date(), lastRunStatus: "success" });

    const actor = makeActor();
    const outcome = await runJobNow(job.jobId, actor);
    expect(outcome.status).toBe("success");

    const audits = await PlatformAuditLog.find({ entityId: job.jobId, eventType: "scheduler_job_run_manual" });
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(actor.id);
  });

  it("throws for an unknown job id", async () => {
    await expect(runJobNow("not-a-real-job", makeActor())).rejects.toThrow(/Unknown job/);
  });
});
