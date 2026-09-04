import connectDB from "@/lib/db";
import AiSchedule from "@/models/ai/AiSchedule";

/**
 * Shared `schedule.due` ownership check (docs/ai/BRIEF-04-BATCH-C.md Part 0.2) — the primary
 * gate behind every schedule-consuming workflow's `subscriptionFilter`, so the check lives in
 * one place rather than duplicated four times with the risk of drifting out of sync with what
 * each workflow's own tools actually create. Each workflow's `extract()` still re-checks
 * ownership on the schedule it fetches (defense in depth, same pattern as the structural
 * permission gate inside `callTool()` backing up each workflow's own permission logic) — this
 * function is what lets the event bus reject an unowned `schedule.due` dispatch before an
 * `AiWorkflowRun` row is even created for it, not just after `extract()` runs.
 */
export async function scheduleBelongsTo(
  tenantId: string,
  scheduleId: string,
  scheduleType: string | string[],
  sourceModel: string,
): Promise<boolean> {
  await connectDB();
  const schedule = await AiSchedule.findById(scheduleId).select("tenantId scheduleType sourceRef").lean();
  if (!schedule) return false;
  const allowedTypes = Array.isArray(scheduleType) ? scheduleType : [scheduleType];
  return schedule.tenantId === tenantId && allowedTypes.includes(schedule.scheduleType) && schedule.sourceRef.model === sourceModel;
}
