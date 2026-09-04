import connectDB from "@/lib/db";
import AiDuplicateFinding from "@/models/ai/AiDuplicateFinding";
import { AI_TOOL_SIDE_EFFECT, AI_AUTONOMY_LEVEL } from "@/lib/constants/statuses";
import { registerTool } from "@/lib/aiRuntime/tools/registry";

/**
 * AI-27's own write tool (docs/ai/BRIEF-08a-BATCH-G.md, AI-27). `place_hold`/`get_active_hold`
 * are NOT redeclared here — AI-27 reuses AI-19's already-registered, fully generic tools
 * (`lib/aiRuntime/tools/masterDataTools.ts`, subjectModel/subjectId are not scoped to
 * Vendor/Employee) directly, per A.1's "AI-19 and AI-27 may place a hold" — never a second
 * `place_hold` implementation.
 */

export interface RecordDuplicateFindingsArgs {
  tenantId: string;
  runId: string;
  candidates: unknown[];
  duplicatePayments: unknown[];
  retrospective: unknown | null;
  checksNotImplemented: { what: string; reason: string }[];
}
async function recordDuplicateFindingsHandler(args: RecordDuplicateFindingsArgs) {
  await connectDB();
  const doc = await AiDuplicateFinding.create({
    tenantId: args.tenantId,
    runId: args.runId,
    candidates: args.candidates,
    duplicatePayments: args.duplicatePayments,
    retrospective: args.retrospective,
    checksNotImplemented: args.checksNotImplemented,
    evaluatedAt: new Date(),
  });
  return { id: String(doc._id) };
}

export function registerDuplicateWriteTools(): void {
  registerTool<RecordDuplicateFindingsArgs>({
    name: "record_duplicate_findings",
    description: "Persists AI-27's duplicate/duplicate-payment findings to models/ai/AiDuplicateFinding.ts. Never writes Invoice/Expense/BankStatement.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    category: "internal_state",
    handler: recordDuplicateFindingsHandler,
  });
}
