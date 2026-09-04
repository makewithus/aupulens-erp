import connectDB from "@/lib/db";
import AiAccountingPolicy from "@/models/ai/AiAccountingPolicy";
import AiPolicyFinding from "@/models/ai/AiPolicyFinding";
import { AI_TOOL_SIDE_EFFECT, AI_AUTONOMY_LEVEL } from "@/lib/constants/statuses";
import { registerTool } from "@/lib/aiRuntime/tools/registry";

/**
 * AI-26's tools (docs/ai/BRIEF-08a-BATCH-G.md, AI-26 algorithm). Both writes are `internal_state`
 * — `record_accounting_policy` is the ONLY write path to `AiAccountingPolicy` (the registry AI-26
 * proposes into, never `AccountingSettings` or `lib/accounting/smart-rules.ts`), and
 * `record_policy_findings` the only write path to `AiPolicyFinding`.
 */

export interface RecordAccountingPolicyArgs {
  tenantId: string;
  policyKey: string;
  scopeConditions: Record<string, unknown>;
  statedTreatment: string;
  effectiveFrom: string;
  source: "configured" | "observed";
}
async function recordAccountingPolicyHandler(args: RecordAccountingPolicyArgs) {
  await connectDB();
  const doc = await AiAccountingPolicy.findOneAndUpdate(
    { tenantId: args.tenantId, policyKey: args.policyKey },
    {
      $set: { scopeConditions: args.scopeConditions, statedTreatment: args.statedTreatment, effectiveFrom: new Date(args.effectiveFrom), source: args.source },
      $inc: { version: 1 },
    },
    { upsert: true, new: true },
  );
  return { id: String(doc._id) };
}

export interface RecordPolicyFindingsArgs {
  tenantId: string;
  runId: string;
  policies: unknown[];
  treatmentVerdicts: unknown[];
  inconsistencies: unknown[];
  policyGaps: unknown[];
  impactOfChange: unknown[];
}
async function recordPolicyFindingsHandler(args: RecordPolicyFindingsArgs) {
  await connectDB();
  const doc = await AiPolicyFinding.create({
    tenantId: args.tenantId,
    runId: args.runId,
    policies: args.policies,
    treatmentVerdicts: args.treatmentVerdicts,
    inconsistencies: args.inconsistencies,
    policyGaps: args.policyGaps,
    impactOfChange: args.impactOfChange,
    evaluatedAt: new Date(),
  });
  return { id: String(doc._id) };
}

export function registerPolicyWriteTools(): void {
  registerTool<RecordAccountingPolicyArgs>({
    name: "record_accounting_policy",
    description: "The only write path to models/ai/AiAccountingPolicy.ts. Never writes AccountingSettings or lib/accounting/smart-rules.ts.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    category: "internal_state",
    handler: recordAccountingPolicyHandler,
  });

  registerTool<RecordPolicyFindingsArgs>({
    name: "record_policy_findings",
    description: "Persists AI-26's policy findings to models/ai/AiPolicyFinding.ts.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    category: "internal_state",
    handler: recordPolicyFindingsHandler,
  });
}
