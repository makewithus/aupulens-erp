import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_runtime_sweep_route";
process.env.CRON_SECRET = process.env.CRON_SECRET || "runtime-sweep-route-test-secret";

import Organization from "@/models/admin/Organization";
import AiSchedule from "@/models/ai/AiSchedule";
import AiEvent from "@/models/ai/AiEvent";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";

const TENANT = "runtime-sweep-route-tenant";

/**
 * Chunk 10a — found via the AI demo tenant's own planted-findings verification
 * (scripts/verify-planted-findings.ts): two real AiSchedule documents due for the same tenant in
 * the same sweep tick crashed the whole cron route with an uncaught E11000, because both
 * schedule.due events were emitted with no dedupeKey at all — AiEvent's unique index on
 * {tenantId, eventKey, dedupeKey} is sparse, but sparse only exempts a document when EVERY
 * indexed field is absent, not when just one is, so the second insert collided with the first.
 */
describe("app/api/cron/ai/runtime-sweep/route.ts — two schedules due for the same tenant in one sweep (Chunk 10a)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Organization.init(), AiSchedule.init(), AiEvent.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Organization.deleteMany({}), AiSchedule.deleteMany({}), AiEvent.deleteMany({}), AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}),
    ]);
  });

  it("the sweep completes and dispatches both due schedules, not just one, and not a crash", async () => {
    // The real route bootstraps the whole runtime and dispatches every workflow — longer than
    // vitest's 5s default under this dev box's normal load.
    await Organization.create({ name: "Sweep Route Test Co", subdomain: TENANT, ownerUserId: new mongoose.Types.ObjectId(), isActive: true });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-07", killSwitchEnabled: true, maxAutonomyLevel: "draft" });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-08", killSwitchEnabled: true, maxAutonomyLevel: "draft" });

    const scheduleA = await AiSchedule.create({
      tenantId: TENANT,
      scheduleType: "accrual_reversal",
      sourceRef: { model: "PurchaseOrder", id: new mongoose.Types.ObjectId().toString() },
      status: "approved",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-01-31"),
      frequency: "monthly",
      totalAmount: 1000,
      currency: "INR",
      debitAccountId: new mongoose.Types.ObjectId(),
      creditAccountId: new mongoose.Types.ObjectId(),
      basis: "inferred",
      periods: [{ periodKey: "2026-01", dueDate: new Date("2026-01-31"), amount: 1000, status: "pending" }],
      recognisedToDate: 0,
      remaining: 1000,
      nextRunDate: new Date(Date.now() - 60 * 60 * 1000), // already due
      createdByWorkflow: "AI-07",
    });
    const scheduleB = await AiSchedule.create({
      tenantId: TENANT,
      scheduleType: "prepaid",
      sourceRef: { model: "Invoice", id: new mongoose.Types.ObjectId().toString() },
      status: "approved",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      frequency: "monthly",
      totalAmount: 1000,
      currency: "INR",
      debitAccountId: new mongoose.Types.ObjectId(),
      creditAccountId: new mongoose.Types.ObjectId(),
      basis: "stated",
      periods: [{ periodKey: "2026-01", dueDate: new Date("2026-01-31"), amount: 1000, status: "pending" }],
      recognisedToDate: 0,
      remaining: 1000,
      nextRunDate: new Date(Date.now() - 60 * 60 * 1000), // also already due, same tick
      createdByWorkflow: "AI-08",
    });

    const { POST } = await import("@/app/api/cron/ai/runtime-sweep/route");
    const req = { headers: { get: (h: string) => (h.toLowerCase() === "authorization" ? `Bearer ${process.env.CRON_SECRET}` : null) } } as unknown as Request;
    const res = await POST(req as never);

    expect(res.status, "the sweep must not 500 when two schedules for the same tenant are due at once").toBe(200);
    const body = await (res as Response).json();
    expect(body.success).toBe(true);
    expect(body.schedulesDue).toBe(2);

    const events = await AiEvent.find({ tenantId: TENANT, eventKey: "schedule.due" }).lean();
    expect(events, "both schedule.due events must actually have been created, not just the first before the crash").toHaveLength(2);
    const scheduleIds = events.map((e) => (e.payload as { scheduleId?: string }).scheduleId).sort();
    expect(scheduleIds).toEqual([String(scheduleA._id), String(scheduleB._id)].sort());
  }, 20000);
});
