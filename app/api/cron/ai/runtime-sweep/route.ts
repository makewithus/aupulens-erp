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
  // Chunk 10a — found live, on the real database, by scripts/verify-planted-findings.ts calling
  // this exact route: with no dedupeKey at all, the FIRST ai.sweep.hourly event ever created for
  // a tenant permanently occupies that {tenantId, eventKey, dedupeKey: null} slot in AiEvent's
  // unique index forever after — every subsequent hourly cron tick for that tenant then throws
  // E11000 on this exact insert, uncaught, aborting the entire route for every org/schedule
  // processed after it in iteration order. Confirmed live: default-tenant's own first successful
  // ai.sweep.hourly event (2026-09-02) had silently broken every hourly cron run since. Scoped
  // per tenant AND per hour, matching the same pattern already applied to schedule.due below and
  // to closeReadiness/compute.ts's auto-resolve loop.
  const sweepHour = new Date().toISOString().slice(0, 13);
  for (const org of orgs) {
    const subdomain = (org as { subdomain: string }).subdomain;
    await emitEvent(subdomain, "ai.sweep.hourly", {}, { dedupeKey: `${subdomain}:${sweepHour}` });
  }

  // `period.horizon.reached` (docs/ai/BRIEF-04-BATCH-C.md) — AI-13/22/24/28's continuous-
  // recompute trigger. Emitted every sweep for the current calendar period, deliberately: no
  // close-calendar-aware "period approaching end" signal exists anywhere in this codebase to
  // gate it on, and recomputation is idempotent/cheap (AiCloseState is upserted per
  // {tenantId, period}), so "recompute now" every hour is the honest, conservative choice —
  // recorded in docs/ai/OPEN_QUESTIONS.md. Same dedupeKey fix as ai.sweep.hourly above, for the
  // identical reason — the first-ever event for a tenant/eventKey pair otherwise blocks every
  // later one permanently, not just within one sweep tick.
  const now = new Date();
  const currentPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const currentPeriodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59)).toISOString();
  for (const org of orgs) {
    const subdomain = (org as { subdomain: string }).subdomain;
    await emitEvent(subdomain, "period.horizon.reached", { period: currentPeriod, periodEnd: currentPeriodEnd }, { dedupeKey: `${subdomain}:${currentPeriod}:${sweepHour}` });
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
  // Chunk 10a — found via the AI demo tenant's own planted-findings verification (two real
  // schedules genuinely due in the same tenant on the same sweep): AiEvent's unique index is
  // {tenantId, eventKey, dedupeKey}, sparse — but sparse only exempts a document when EVERY
  // indexed field is absent, not when just one is. Two schedules both due in the same tick, both
  // emitting with no dedupeKey at all, collide on that index and throw E11000, uncaught — this
  // loop has no try/catch, so one tenant with two simultaneously-due schedules could abort the
  // rest of this cron run for every other tenant/schedule after it. Scoped per schedule AND per
  // hour (not just per schedule) so a genuinely still-due schedule is still re-emitted on a later
  // sweep if the prior event never got processed — this only needs to prevent a same-tick
  // collision between DIFFERENT schedules, not suppress legitimate retries of the same one.
  const dueEventHour = new Date().toISOString().slice(0, 13);
  for (const schedule of dueSchedules) {
    await emitEvent(schedule.tenantId, "schedule.due", { scheduleId: String(schedule._id) }, { dedupeKey: `${schedule._id}:${dueEventHour}` });
  }

  return NextResponse.json({ success: true, ...result, tenantsSwept: orgs.length, schedulesDue: dueSchedules.length });
}

export { handler as GET, handler as POST };
