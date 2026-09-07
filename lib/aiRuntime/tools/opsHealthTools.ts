import connectDB from "@/lib/db";
import AiEvent from "@/models/ai/AiEvent";
import AiOperationsFinding from "@/models/ai/AiOperationsFinding";
import AiSchedule, { AI_SCHEDULE_STATUS, AI_SCHEDULE_PERIOD_STATUS } from "@/models/ai/AiSchedule";
import JournalEntry from "@/models/finance/JournalEntry";
import { AI_EVENT_STATUS, AI_TOOL_SIDE_EFFECT, AI_AUTONOMY_LEVEL } from "@/lib/constants/statuses";
import { rebuildTaxProjection } from "@/lib/aiRuntime/tax/rebuildTaxProjection";
import { checkRepairGate, recordRepairAttempt } from "@/lib/aiRuntime/opsHealth/repairGate";
import { registerTool } from "@/lib/aiRuntime/tools/registry";

/**
 * AI-30's repair tools (docs/ai/BRIEF-08a-BATCH-G.md A.5) — originally 2 of 4 permitted repairs
 * wired live; `recover_stuck_schedule_period` is a 5th, added by the Chunk 10a addendum once
 * `docs/ai/audits/FAILURE_MODES.md`'s sweep found a real, previously-unknown recovery gap in the
 * shared `post_journal` tool (a crash between its compare-and-swap and its journal save leaves an
 * `AiSchedule` period permanently stuck with no path back). Every handler consults
 * `checkRepairGate()` first and calls `recordRepairAttempt()` after — the retry cap, exponential
 * backoff, and "fails twice escalates, never retried" behaviour all live in `repairGate.ts`, not
 * duplicated per tool. **None of these three touches a financial record**: all are
 * `internal_state` (`AiEvent`, `AiOperationsRepairLog`/`AiOperationsFinding`, `AiTaxTransaction`
 * via AI-12's own unchanged `rebuildTaxProjection`, `AiSchedule` for the new recovery repair — all
 * `models/ai/**`; the new repair's one `JournalEntry` touch is a read, never a write).
 *
 * **"Re-run a failed idempotent integration sync" is NOT wired here** — a real finding, not a
 * shortcut. The only re-runnable operation that exists for a third-party connector is
 * `lib/integrations/connectionService.ts::testConnection()`, and it mutates and saves the
 * `Integration` document (`models/shared/Integration.ts`) — a model whose name does not start
 * with "Ai". `tests/ai/aiRuntime/safety.test.ts`'s own structural rule ("every write call inside
 * an internal_state handler targets a model whose name starts with Ai") would correctly reject
 * that as a tool, and the alternative — routing it through the NORMAL write path instead of
 * `internal_state` — is a dead end too: `lib/aiRuntime/tools/registry.ts::callTool()` requires a
 * real human `userId` for any non-internal_state write (`routePermissionCheck` fails closed with
 * "no acting user id provided" otherwise), and AI-30's `ai.sweep.hourly` trigger has no human in
 * the loop. There is structurally no safe way for an autonomous AI-30 repair to touch
 * `Integration` today. Declared in this workflow's own `checksNotImplemented`, same as orphan
 * relink — not silently dropped.
 */

export interface RequeueDeadLetterArgs {
  tenantId: string;
  eventId: string;
}
async function requeueDeadLetterHandler(args: RequeueDeadLetterArgs) {
  await connectDB();
  const issueKey = `AiEvent:${args.eventId}`;
  const gate = await checkRepairGate(args.tenantId, issueKey);
  if (!gate.allowed) return { repaired: false, reason: gate.reason };

  const before = await AiEvent.findOne({ _id: args.eventId, tenantId: args.tenantId }).select("status attempts lastError").lean();
  if (!before) {
    await recordRepairAttempt({ tenantId: args.tenantId, issueKey, repairType: "requeue_dead_letter", attempt: gate.nextAttempt, beforeState: {}, afterState: null, outcome: "failed", error: "event not found" });
    return { repaired: false, reason: "event not found" };
  }

  try {
    await AiEvent.updateOne({ _id: args.eventId, tenantId: args.tenantId }, { $set: { status: AI_EVENT_STATUS.PENDING, lastError: undefined } });
    const after = await AiEvent.findOne({ _id: args.eventId, tenantId: args.tenantId }).select("status attempts lastError").lean();
    await recordRepairAttempt({ tenantId: args.tenantId, issueKey, repairType: "requeue_dead_letter", attempt: gate.nextAttempt, beforeState: before, afterState: after, outcome: "success" });
    return { repaired: true };
  } catch (err) {
    await recordRepairAttempt({ tenantId: args.tenantId, issueKey, repairType: "requeue_dead_letter", attempt: gate.nextAttempt, beforeState: before, afterState: null, outcome: "failed", error: err instanceof Error ? err.message : String(err) });
    return { repaired: false, reason: "requeue failed" };
  }
}

export interface RefreshTaxProjectionArgs {
  tenantId: string;
  period: string;
}
async function refreshTaxProjectionHandler(args: RefreshTaxProjectionArgs) {
  await connectDB();
  const issueKey = `TaxProjection:${args.period}`;
  const gate = await checkRepairGate(args.tenantId, issueKey);
  if (!gate.allowed) return { repaired: false, reason: gate.reason };

  try {
    const result = await rebuildTaxProjection(args.tenantId, args.period); // AI-12's own unchanged function
    await recordRepairAttempt({ tenantId: args.tenantId, issueKey, repairType: "refresh_tax_projection", attempt: gate.nextAttempt, beforeState: {}, afterState: result, outcome: "success" });
    return { repaired: true, ...result };
  } catch (err) {
    await recordRepairAttempt({ tenantId: args.tenantId, issueKey, repairType: "refresh_tax_projection", attempt: gate.nextAttempt, beforeState: {}, afterState: null, outcome: "failed", error: err instanceof Error ? err.message : String(err) });
    return { repaired: false, reason: "rebuild failed" };
  }
}

export interface RecoverStuckSchedulePeriodArgs {
  tenantId: string;
  scheduleId: string;
  periodKey: string;
}
/**
 * Chunk 10a addendum (docs/ai/audits/FAILURE_MODES.md's post_journal finding, and the 5th
 * permitted repair type — docs/ai/BRIEF-08a-BATCH-G.md A.5 named exactly 4 when this workflow was
 * first built; this one did not exist yet because the underlying post_journal gap was not known
 * until this audit). Never touches a financial record directly: it only ever writes to
 * `AiSchedule`; the `JournalEntry` read below is a lookup, not a write, and if one is found it is
 * linked, never created or modified. Two, and only two, real outcomes for a period genuinely
 * stuck at DRAFTED:
 * 1. A `JournalEntry` tagged `header.ref: "ai-schedule:{scheduleId}:{periodKey}"` already exists
 *    (the crash happened after that entry was written but before the schedule's own update) —
 *    complete exactly the bookkeeping `post_journal`'s own tail would have done, never post twice.
 * 2. No such `JournalEntry` exists (the crash happened before it was ever created, or a
 *    validation check vetoed the posting before that point) — reset the period to `PENDING` so a
 *    fresh `post_journal` call can retry cleanly. No financial effect was ever recorded, so
 *    nothing to undo.
 */
async function recoverStuckSchedulePeriodHandler(args: RecoverStuckSchedulePeriodArgs) {
  await connectDB();
  const issueKey = `AiSchedule:${args.scheduleId}:${args.periodKey}`;
  const gate = await checkRepairGate(args.tenantId, issueKey);
  if (!gate.allowed) return { repaired: false, reason: gate.reason };

  // Read-only lookup (never a write) — every write below goes directly through a single
  // field-level AiSchedule update call, the same "write method called directly on the Ai* model"
  // shape as every other internal_state tool in this codebase, never a fetch-mutate-persist round
  // trip that a concurrent recovery/repair attempt could race against.
  const found = await AiSchedule.findOne({ _id: args.scheduleId, tenantId: args.tenantId }).lean();
  const period = found?.periods.find((p) => p.periodKey === args.periodKey);
  if (!found || !period) {
    await recordRepairAttempt({ tenantId: args.tenantId, issueKey, repairType: "recover_stuck_schedule_period", attempt: gate.nextAttempt, beforeState: {}, afterState: null, outcome: "failed", error: "schedule or period not found" });
    return { repaired: false, reason: "schedule or period not found" };
  }
  if (period.status !== AI_SCHEDULE_PERIOD_STATUS.DRAFTED) {
    // Not actually stuck (already resolved — possibly by a concurrent recovery attempt). Nothing
    // to repair; not an error.
    return { repaired: true, reason: "period is not stuck (already resolved)" };
  }

  const before = { status: period.status, journalEntryId: period.journalEntryId ? String(period.journalEntryId) : null };

  try {
    const existingEntry = await JournalEntry.findOne({ tenantId: args.tenantId, "header.ref": `ai-schedule:${args.scheduleId}:${args.periodKey}` }).select("_id").lean();

    if (existingEntry) {
      const nextPending = found.periods.find((p) => p.periodKey !== args.periodKey && p.status === AI_SCHEDULE_PERIOD_STATUS.PENDING);
      await AiSchedule.findOneAndUpdate(
        { _id: args.scheduleId, tenantId: args.tenantId, "periods.periodKey": args.periodKey },
        {
          $set: {
            "periods.$.status": AI_SCHEDULE_PERIOD_STATUS.POSTED,
            "periods.$.journalEntryId": existingEntry._id,
            recognisedToDate: found.recognisedToDate + period.amount,
            remaining: Math.max(0, found.remaining - period.amount),
            nextRunDate: nextPending?.dueDate,
            ...(nextPending ? {} : { status: AI_SCHEDULE_STATUS.COMPLETED }),
          },
        },
      );
      const after = { status: AI_SCHEDULE_PERIOD_STATUS.POSTED, journalEntryId: String(existingEntry._id) };
      await recordRepairAttempt({ tenantId: args.tenantId, issueKey, repairType: "recover_stuck_schedule_period", attempt: gate.nextAttempt, beforeState: before, afterState: after, outcome: "success" });
      return { repaired: true, reason: "linked the journal entry that was already created before the crash" };
    }

    await AiSchedule.findOneAndUpdate(
      { _id: args.scheduleId, tenantId: args.tenantId, "periods.periodKey": args.periodKey },
      { $set: { "periods.$.status": AI_SCHEDULE_PERIOD_STATUS.PENDING }, $unset: { "periods.$.draftedAt": "" } },
    );
    const after = { status: AI_SCHEDULE_PERIOD_STATUS.PENDING, journalEntryId: null };
    await recordRepairAttempt({ tenantId: args.tenantId, issueKey, repairType: "recover_stuck_schedule_period", attempt: gate.nextAttempt, beforeState: before, afterState: after, outcome: "success" });
    return { repaired: true, reason: "no journal entry was ever created — reset to pending for a clean retry" };
  } catch (err) {
    await recordRepairAttempt({ tenantId: args.tenantId, issueKey, repairType: "recover_stuck_schedule_period", attempt: gate.nextAttempt, beforeState: before, afterState: null, outcome: "failed", error: err instanceof Error ? err.message : String(err) });
    return { repaired: false, reason: "recovery failed" };
  }
}

export interface RecordOperationsFindingsArgs {
  tenantId: string;
  runId: string;
  healthByModule: unknown[];
  healthByIntegration: unknown[];
  issues: unknown[];
  repairsAttempted: unknown[];
}
async function recordOperationsFindingsHandler(args: RecordOperationsFindingsArgs) {
  await connectDB();
  const doc = await AiOperationsFinding.create({
    tenantId: args.tenantId,
    runId: args.runId,
    healthByModule: args.healthByModule,
    healthByIntegration: args.healthByIntegration,
    issues: args.issues,
    repairsAttempted: args.repairsAttempted,
    evaluatedAt: new Date(),
  });
  return { id: String(doc._id) };
}

export function registerOpsHealthWriteTools(): void {
  registerTool<RequeueDeadLetterArgs>({
    name: "requeue_dead_lettered_event",
    description: "Re-queues one dead-lettered AiEvent back to pending. Idempotent (checked against AiOperationsRepairLog's retry cap first). Never touches a financial record.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    category: "internal_state",
    handler: requeueDeadLetterHandler,
  });

  registerTool<RefreshTaxProjectionArgs>({
    name: "refresh_tax_projection",
    description: "Rebuilds one period's tax projection via AI-12's own rebuildTaxProjection(). Writes only AiTaxTransaction.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    category: "internal_state",
    handler: refreshTaxProjectionHandler,
  });

  registerTool<RecoverStuckSchedulePeriodArgs>({
    name: "recover_stuck_schedule_period",
    description: "Resolves an AiSchedule period stuck at DRAFTED after a post_journal crash — links the JournalEntry if one was already created, otherwise resets to PENDING for a clean retry. Writes only AiSchedule; the JournalEntry lookup is read-only, never a write.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    category: "internal_state",
    handler: recoverStuckSchedulePeriodHandler,
  });

  registerTool<RecordOperationsFindingsArgs>({
    name: "record_operations_findings",
    description: "Persists AI-30's health-sweep findings to models/ai/AiOperationsFinding.ts.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    category: "internal_state",
    handler: recordOperationsFindingsHandler,
  });
}
