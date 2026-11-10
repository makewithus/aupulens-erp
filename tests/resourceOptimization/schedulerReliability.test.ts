import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ro_scheduler";

import SchedulerJobRun from "@/models/platform/SchedulerJobRun";
import SchedulerJobLock from "@/models/platform/SchedulerJobLock";
import SchedulerTriggerHeartbeat from "@/models/platform/SchedulerTriggerHeartbeat";
import PlatformAlert from "@/models/platform/PlatformAlert";
import Organization from "@/models/admin/Organization";
import AiEvent from "@/models/ai/AiEvent";

type Runner = typeof import("@/lib/platform/scheduler/runner");
type Registry = typeof import("@/lib/platform/scheduler/registry");
type HB = typeof import("@/lib/platform/scheduler/heartbeat");
let runner: Runner, registry: Registry, hb: HB;
const MIN = 60_000;
const JOB = "platform-ai-cost-spike-check"; // daily-ish job used as the subject
const alerts = (alertType: string) => PlatformAlert.countDocuments({ alertType, resolvedAt: { $exists: false } });

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  await Promise.all([SchedulerJobRun.init(), SchedulerJobLock.init(), SchedulerTriggerHeartbeat.init(), PlatformAlert.init(), Organization.init(), AiEvent.init()]);
  runner = await import("@/lib/platform/scheduler/runner");
  registry = await import("@/lib/platform/scheduler/registry");
  hb = await import("@/lib/platform/scheduler/heartbeat");
});
afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.connection.close(); });
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([SchedulerJobRun.deleteMany({}), SchedulerJobLock.deleteMany({}), SchedulerTriggerHeartbeat.deleteMany({}), PlatformAlert.deleteMany({}), Organization.deleteMany({}), AiEvent.deleteMany({})]);
});

/** Mark every job as having succeeded recently so only the job under test is due. */
async function seedAllFresh(exceptJob?: string) {
  for (const j of registry.JOB_REGISTRY) {
    if (j.jobId === exceptJob) continue;
    await SchedulerJobRun.create({ jobId: j.jobId, lastRunAt: new Date(), lastSuccessAt: new Date(), lastRunStatus: "success", consecutiveFailures: 0 });
  }
}
const stubAll = () => registry.JOB_REGISTRY.forEach((j) => vi.spyOn(j, "handler").mockResolvedValue({ stub: true }));
const job = () => registry.getJobDefinition(JOB)!;
const ago = (ms: number) => new Date(Date.now() - ms);

describe("G7a — stale alerts reflect POST-run state", () => {
  it("a stale job that runs successfully this tick clears its stale alert (regression: pre-run statuses kept it open)", async () => {
    await seedAllFresh(JOB);
    const staleAt = ago(job().intervalMinutes * MIN * 5);
    await SchedulerJobRun.create({ jobId: JOB, lastRunAt: staleAt, lastSuccessAt: staleAt, lastRunStatus: "success" });
    stubAll();
    await PlatformAlert.create({ alertType: "scheduler_job_stale", severity: "warning", message: "old", deliveryChannels: ["in_app"], metadata: { dedupeKey: `scheduler-stale:${JOB}` } });

    const out = await runner.runDueJobs("run-due");
    expect(out.ran).toContain(JOB);
    expect(await alerts("scheduler_job_stale")).toBe(0);
  });

  it("a stale job that is NOT due-and-run still raises exactly one stale alert (deduped)", async () => {
    await seedAllFresh(JOB);
    const staleAt = ago(job().intervalMinutes * MIN * 5);
    await SchedulerJobRun.create({ jobId: JOB, lastRunAt: new Date(), lastSuccessAt: staleAt, lastRunStatus: "error", consecutiveFailures: 9 }); // failing, last success long ago, not due (fell back to normal cadence)
    stubAll();
    await runner.runDueJobs("run-due");
    await runner.runDueJobs("run-due");
    expect(await alerts("scheduler_job_stale")).toBe(1);
  });

  it("a failing stale job raises BOTH failed and stale alerts; a later success clears both", async () => {
    await seedAllFresh(JOB);
    const staleAt = ago(job().intervalMinutes * MIN * 5);
    await SchedulerJobRun.create({ jobId: JOB, lastRunAt: staleAt, lastSuccessAt: staleAt, lastRunStatus: "success" });
    stubAll();
    vi.spyOn(job(), "handler").mockRejectedValue(new Error("down"));
    await runner.runDueJobs("run-due");
    expect(await alerts("scheduler_job_failed")).toBe(1);
    expect(await alerts("scheduler_job_stale")).toBe(1);

    await SchedulerJobRun.updateOne({ jobId: JOB }, { $set: { nextRetryAt: ago(1000) } });
    vi.spyOn(job(), "handler").mockResolvedValue({ ok: true });
    await runner.runDueJobs("run-due");
    expect(await alerts("scheduler_job_failed")).toBe(0);
    expect(await alerts("scheduler_job_stale")).toBe(0);
  });

  it("idle tick (nothing due) costs a single status read and raises nothing", async () => {
    await seedAllFresh();
    stubAll();
    const spy = vi.spyOn(SchedulerJobRun, "find");
    const out = await runner.runDueJobs("run-due");
    expect(out.ran).toHaveLength(0);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("G7 — bounded retry with backoff", () => {
  it("a failed job retries after a short backoff, not after its whole interval", async () => {
    await seedAllFresh(JOB);
    stubAll();
    vi.spyOn(job(), "handler").mockRejectedValue(new Error("x"));
    await runner.runDueJobs("run-due");
    const run: any = await SchedulerJobRun.findOne({ jobId: JOB }).lean();
    expect(run.consecutiveFailures).toBe(1);
    const retryIn = run.nextRetryAt.getTime() - Date.now();
    expect(retryIn).toBeGreaterThan(runner.RETRY_BASE_MS - 5000);
    expect(retryIn).toBeLessThanOrEqual(runner.RETRY_BASE_MS);
    expect(retryIn).toBeLessThan(job().intervalMinutes * MIN);

    let st = (await runner.getJobStatuses()).find((s) => s.jobId === JOB)!;
    expect(st.isDue).toBe(false); // backoff in effect
    await SchedulerJobRun.updateOne({ jobId: JOB }, { $set: { nextRetryAt: ago(1) } });
    st = (await runner.getJobStatuses()).find((s) => s.jobId === JOB)!;
    expect(st.isDue).toBe(true);
  });

  it("backoff doubles and is capped at the job's own interval", () => {
    const d = (n: number) => runner.computeRetryDelayMs(job(), n);
    expect(d(2)).toBe(Math.min(2 * runner.RETRY_BASE_MS, job().intervalMinutes * MIN));
    expect(d(50)).toBe(job().intervalMinutes * MIN);
  });

  it("no infinite retry loop: after MAX_CONSECUTIVE_RETRIES failures the job returns to its normal cadence", async () => {
    await seedAllFresh(JOB);
    await SchedulerJobRun.create({ jobId: JOB, lastRunAt: ago(MIN), lastRunStatus: "error", consecutiveFailures: runner.MAX_CONSECUTIVE_RETRIES + 1, nextRetryAt: ago(1) });
    const st = (await runner.getJobStatuses()).find((s) => s.jobId === JOB)!;
    expect(st.isDue).toBe(false);
    expect(new Date(st.nextDueAt).getTime()).toBeGreaterThan(Date.now() + (job().intervalMinutes * MIN) / 2);
  });

  it("a success resets the failure counter and retry time", async () => {
    await seedAllFresh(JOB);
    await SchedulerJobRun.create({ jobId: JOB, lastRunAt: ago(10 * MIN), lastRunStatus: "error", consecutiveFailures: 3, nextRetryAt: ago(1) });
    stubAll();
    await runner.runDueJobs("run-due");
    const run: any = await SchedulerJobRun.findOne({ jobId: JOB }).lean();
    expect(run).toMatchObject({ lastRunStatus: "success", consecutiveFailures: 0 });
    expect(run.nextRetryAt).toBeUndefined();
    expect(run.lastSuccessAt).toBeInstanceOf(Date);
  });

  it("staleness is measured from the last SUCCESS, so a job that keeps failing is eventually stale", async () => {
    await SchedulerJobRun.create({ jobId: JOB, lastRunAt: new Date(), lastSuccessAt: ago(job().intervalMinutes * MIN * 6), lastRunStatus: "error", consecutiveFailures: 2 });
    expect((await runner.getJobStatuses()).find((s) => s.jobId === JOB)!.isStale).toBe(true);
  });
});

describe("G7 — locking and duplicate-execution prevention", () => {
  it("two simultaneous scheduler ticks run each due job exactly once", async () => {
    stubAll();
    const calls: Record<string, number> = {};
    for (const j of registry.JOB_REGISTRY) vi.spyOn(j, "handler").mockImplementation(async () => { calls[j.jobId] = (calls[j.jobId] ?? 0) + 1; await new Promise((r) => setTimeout(r, 80)); return {}; });
    const [a, b] = await Promise.all([runner.runDueJobs("run-due"), runner.runDueJobs("run-due")]);
    expect(Object.values(calls).every((n) => n === 1)).toBe(true);
    expect(a.ran.length + b.ran.length).toBe(registry.JOB_REGISTRY.length);
  });
});

describe("G7 — all 13 jobs remain registered, with a single AI sweep path", () => {
  it("registry still contains every original job", () => {
    expect(registry.JOB_REGISTRY.map((j) => j.jobId).sort()).toEqual([
      "ai-metrics-snapshot", "ai-runtime-sweep", "business-health", "crm-automations", "crm-contract-check", "crm-sla-check",
      "migration-worker-sweep", "platform-access-session-expiry", "platform-ai-cost-spike-check", "platform-ai-usage-rollup",
      "platform-retention-sweep", "sales-reminders-evaluation", "sales-subscriptions-billing",
    ]);
    expect(registry.JOB_REGISTRY.every((j) => j.intervalMinutes > 0 && typeof j.handler === "function")).toBe(true);
  });

  it("the cron route and the scheduler job use the same runAiRuntimeSweep implementation (no duplicate processing path)", () => {
    const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");
    expect(read("app/api/cron/ai/runtime-sweep/route.ts")).toContain("runAiRuntimeSweep");
    expect(read("lib/platform/scheduler/registry.ts")).toContain("runAiRuntimeSweep");
    expect(read("lib/platform/scheduler/registry.ts")).not.toMatch(/sweepPendingEvents\(\)/);
  });

  it("AI sweep triggers are per-tenant, dedupe-keyed and idempotent when re-run every tick", async () => {
    const owner = new mongoose.Types.ObjectId();
    await Organization.create([
      { name: "A", subdomain: "ro-sched-a", ownerUserId: owner }, { name: "B", subdomain: "ro-sched-b", ownerUserId: owner },
    ]);
    const { runAiRuntimeSweep } = await import("@/lib/aiRuntime/runtime/sweepJob");
    await runAiRuntimeSweep({ limit: 0 });
    await runAiRuntimeSweep({ limit: 0 });
    await runAiRuntimeSweep({ limit: 0 });
    for (const t of ["ro-sched-a", "ro-sched-b"]) {
      expect(await AiEvent.countDocuments({ tenantId: t, eventKey: "ai.sweep.hourly" })).toBe(1);
      expect(await AiEvent.countDocuments({ tenantId: t, eventKey: "period.horizon.reached" })).toBe(1);
    }
    expect(await AiEvent.countDocuments({ tenantId: { $nin: ["ro-sched-a", "ro-sched-b"] } })).toBe(0);
  });
});

describe("G7 — external trigger heartbeat", () => {
  it("first trigger records a heartbeat; a normal cadence raises no alert", async () => {
    const t0 = new Date("2026-11-01T00:00:00Z");
    expect((await hb.recordTriggerStart(t0)).gapMs).toBeNull();
    await hb.recordTriggerStart(new Date(t0.getTime() + 16 * MIN));
    expect(await alerts("scheduler_trigger_stale")).toBe(0);
    expect((await hb.getTriggerHealth(new Date(t0.getTime() + 20 * MIN))).healthy).toBe(true);
  });

  it("a long silence raises one deduped alert at the next trigger and clears it once the cadence is healthy again", async () => {
    const t0 = new Date("2026-11-01T00:00:00Z");
    await hb.recordTriggerStart(t0);
    const t1 = new Date(t0.getTime() + 2 * 3600_000);
    await hb.recordTriggerStart(t1);
    expect(await alerts("scheduler_trigger_stale")).toBe(1);
    await hb.recordTriggerStart(new Date(t1.getTime() + 15 * MIN));
    expect(await alerts("scheduler_trigger_stale")).toBe(0);
  });

  it("health reports never_triggered / trigger_stale / consecutive_failures / ok", async () => {
    const now = new Date("2026-11-01T12:00:00Z");
    expect((await hb.getTriggerHealth(now)).reason).toBe("never_triggered");
    await hb.recordTriggerStart(new Date(now.getTime() - 2 * 3600_000));
    expect((await hb.getTriggerHealth(now)).reason).toBe("trigger_stale");
    await hb.recordTriggerStart(new Date(now.getTime() - MIN));
    for (let i = 0; i < 3; i++) await hb.recordTriggerResult(false, "x");
    expect((await hb.getTriggerHealth(now)).reason).toBe("consecutive_failures");
    await hb.recordTriggerResult(true);
    expect((await hb.getTriggerHealth(now)).healthy).toBe(true);
  });

  it("health endpoint: 401 without the bearer secret, 503 when silent, 200 when healthy, never executes jobs", async () => {
    const { GET } = await import("@/app/api/platform/scheduler/health/route");
    process.env.CRON_SECRET = "hb-secret";
    const req = (auth?: string) => new NextRequest("http://x/api/platform/scheduler/health", { headers: auth ? { authorization: auth } : {} });
    try {
      expect((await GET(req())).status).toBe(401);
      expect((await GET(req("Bearer wrong"))).status).toBe(401);
      expect((await GET(req("Bearer hb-secret"))).status).toBe(503); // never triggered
      await hb.recordTriggerStart(new Date());
      const ok = await GET(req("Bearer hb-secret"));
      expect(ok.status).toBe(200);
      expect(ok.headers.get("cache-control")).toBe("no-store");
      expect(await SchedulerJobRun.countDocuments({})).toBe(0);
    } finally { delete process.env.CRON_SECRET; }
  });
});
