import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import AiSchedule, { AI_SCHEDULE_STATUS } from "@/models/ai/AiSchedule";
import { bootstrapAiRuntime } from "@/lib/aiRuntime/bootstrap";
import { emitEvent, sweepPendingEvents } from "@/lib/aiRuntime/runtime/eventBus";

// Same CRON_SECRET bearer-check shape as every other cron route (see
// app/api/cron/business-health/route.ts). Scheduled hourly via vercel.json.
// This is the AI runtime's retry-with-backoff + dead-letter mechanism (Hard
// Rule 6, Part 2.5): emitEvent() already attempts inline dispatch in the
// same request it's called from; anything left pending/failed after that
// (the workflow threw, or a serverless invocation timed out mid-dispatch)
// gets retried here, up to eventBus.ts's MAX_ATTEMPTS cap, then dead-lettered.
async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  bootstrapAiRuntime();
  const result = await sweepPendingEvents();

  // Continuous-sweep trigger (docs/ai/BRIEF-02-BATCH-A.md B.2) — for workflows like AI-03
  // that must re-check state even when nothing new was imported (e.g. an ageing unmatched
  // bank line). Same per-tenant iteration pattern as app/api/cron/business-health/route.ts.
  await connectDB();
  const orgs = await Organization.find({ isActive: true }, "subdomain").lean();
  for (const org of orgs) {
    await emitEvent((org as { subdomain: string }).subdomain, "ai.sweep.hourly", {});
  }

  // `period.horizon.reached` (docs/ai/BRIEF-04-BATCH-C.md) — AI-13/22/24/28's continuous-
  // recompute trigger. Emitted every sweep for the current calendar period, deliberately: no
  // close-calendar-aware "period approaching end" signal exists anywhere in this codebase to
  // gate it on, and recomputation is idempotent/cheap (AiCloseState is upserted per
  // {tenantId, period}), so "recompute now" every hour is the honest, conservative choice —
  // recorded in docs/ai/OPEN_QUESTIONS.md.
  const now = new Date();
  const currentPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const currentPeriodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59)).toISOString();
  for (const org of orgs) {
    await emitEvent((org as { subdomain: string }).subdomain, "period.horizon.reached", { period: currentPeriod, periodEnd: currentPeriodEnd });
  }

  // The recurring schedule engine's runner (docs/ai/BRIEF-03-BATCH-B.md B.2) — extends this
  // route rather than adding a second cron entry, per the brief's explicit instruction. Emits
  // one `schedule.due` event per due AiSchedule; the workflow owning that scheduleType consumes
  // it. Missed periods (several overdue at once) are the owning workflow's job to process in
  // date order as separate entries, not this sweep's — it only signals "this schedule has work."
  const dueSchedules = await AiSchedule.find({
    status: AI_SCHEDULE_STATUS.APPROVED,
    nextRunDate: { $lte: new Date() },
  })
    .select("_id tenantId")
    .lean();
  for (const schedule of dueSchedules) {
    await emitEvent(schedule.tenantId, "schedule.due", { scheduleId: String(schedule._id) });
  }

  return NextResponse.json({ success: true, ...result, tenantsSwept: orgs.length, schedulesDue: dueSchedules.length });
}

export { handler as GET, handler as POST };
