import connectDB from "@/lib/db";
import AiEvent from "@/models/ai/AiEvent";
import AiOperationsFinding from "@/models/ai/AiOperationsFinding";
import { AI_EVENT_STATUS, AI_TOOL_SIDE_EFFECT, AI_AUTONOMY_LEVEL } from "@/lib/constants/statuses";
import { rebuildTaxProjection } from "@/lib/aiRuntime/tax/rebuildTaxProjection";
import { checkRepairGate, recordRepairAttempt } from "@/lib/aiRuntime/opsHealth/repairGate";
import { registerTool } from "@/lib/aiRuntime/tools/registry";

/**
 * AI-30's repair tools (docs/ai/BRIEF-08a-BATCH-G.md A.5) — 2 of the 4 permitted repairs are
 * wired live this chunk. Every handler consults `checkRepairGate()` first and calls
 * `recordRepairAttempt()` after — the retry cap, exponential backoff, and "fails twice escalates,
 * never retried" behaviour all live in `repairGate.ts`, not duplicated per tool. **Neither of
 * these two touches a financial record**: both are `internal_state` (`AiEvent`,
 * `AiOperationsRepairLog`/`AiOperationsFinding`, `AiTaxTransaction` via AI-12's own unchanged
 * `rebuildTaxProjection` — all `models/ai/**`).
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
