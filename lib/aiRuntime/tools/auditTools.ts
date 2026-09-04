import connectDB from "@/lib/db";
import ActivityLog from "@/models/admin/ActivityLog";
import AiEvidencePack from "@/models/ai/AiEvidencePack";
import { traceAccountEvidence, traceReconciliationEvidence } from "@/lib/aiRuntime/audit/traceEvidence";
import { traceDecisionForRecord } from "@/lib/aiRuntime/audit/decisionTrace";
import { AI_TOOL_SIDE_EFFECT, AI_AUTONOMY_LEVEL } from "@/lib/constants/statuses";
import { registerTool } from "@/lib/aiRuntime/tools/registry";

/**
 * AI-18's tools (docs/ai/BRIEF-07-BATCH-F.md A.1). Every read/analyse tool composes existing
 * evidence sources (`traceEvidence.ts`, `decisionTrace.ts`) — no new trace infrastructure. The one
 * write, `record_evidence_pack`, is `internal_state` — targets only `AiEvidencePack`.
 */

export interface GetActivityLogArgs {
  tenantId: string;
  userId?: string;
  limit?: number;
}
async function getActivityLogHandler(args: GetActivityLogArgs) {
  await connectDB();
  const query: Record<string, unknown> = { tenantId: args.tenantId };
  if (args.userId) query.userId = args.userId;
  const entries = await ActivityLog.find(query).sort({ timestamp: -1 }).limit(Math.min(args.limit ?? 50, 200)).lean();
  return { entries };
}

export interface GetDecisionTraceArgs {
  tenantId: string;
  model: string;
  recordId: string;
  recordUpdatedAt?: string;
}
async function getDecisionTraceHandler(args: GetDecisionTraceArgs) {
  return traceDecisionForRecord(args.tenantId, args.model, args.recordId, args.recordUpdatedAt ? new Date(args.recordUpdatedAt) : undefined);
}

export interface BuildEvidencePackArgs {
  tenantId: string;
  accountId: string;
  accountName: string;
  period: string;
  periodEnd: string;
}
async function buildEvidencePackHandler(args: BuildEvidencePackArgs) {
  const evidence = await traceAccountEvidence(args.tenantId, args.accountId, args.accountName, args.period);
  const reconciliations = await traceReconciliationEvidence(args.tenantId, new Date(args.periodEnd), args.period);
  return { ...evidence, reconciliations };
}

export interface RecordEvidencePackArgs {
  tenantId: string;
  packId: string;
  scope: { type: "account_period" | "period_sweep"; accountId?: string; period: string };
  figures: unknown[];
  documents: unknown[];
  approvals: unknown[];
  reconciliations: unknown[];
  decisionTraces: unknown[];
  missingEvidence: unknown[];
  completenessScore: number;
  sample?: { method: string; seed: string; items: string[] };
}
async function recordEvidencePackHandler(args: RecordEvidencePackArgs) {
  await connectDB();
  const pack = await AiEvidencePack.findOneAndUpdate(
    { tenantId: args.tenantId, packId: args.packId },
    {
      $set: {
        scope: args.scope,
        figures: args.figures,
        documents: args.documents,
        approvals: args.approvals,
        reconciliations: args.reconciliations,
        decisionTraces: args.decisionTraces,
        missingEvidence: args.missingEvidence,
        completenessScore: args.completenessScore,
        sample: args.sample,
      },
    },
    { upsert: true, new: true },
  );
  return { packId: pack.packId };
}

export function registerAuditReadTools(): void {
  registerTool<GetActivityLogArgs>({
    name: "get_activity_log",
    description: "Reads models/admin/ActivityLog.ts for a tenant — free-text activity entries, no structured entity reference (docs/ai/OPEN_QUESTIONS.md).",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getActivityLogHandler,
  });

  registerTool<GetDecisionTraceArgs>({
    name: "get_decision_trace",
    description: "Answers 'why did the system do this' for an AI-touched record — reads AiDecisionTrace/AiWorkflowRun, never a second trace store.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getDecisionTraceHandler,
  });

  registerTool<BuildEvidencePackArgs>({
    name: "build_evidence_pack",
    description: "Assembles cited evidence for one account/period — figures, documents, approvals, reconciliations. Composes AI-21's drillIntoAccount and AI-22's reconciliation engine, never a second computation.",
    sideEffect: AI_TOOL_SIDE_EFFECT.ANALYSE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: buildEvidencePackHandler,
  });
}

export function registerAuditWriteTools(): void {
  registerTool<RecordEvidencePackArgs>({
    name: "record_evidence_pack",
    description: "Persists an evidence pack to models/ai/AiEvidencePack.ts so it is reproducible and citable later.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    category: "internal_state",
    handler: recordEvidencePackHandler,
  });
}
