import connectDB from "@/lib/db";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import { makeClaim, makeNotFoundClaim, type Claim } from "@/lib/aiRuntime/audit/citations";

/**
 * AI-18's "why did the system do this" retrieval (docs/ai/BRIEF-07-BATCH-F.md A.5) — the
 * question no traditional ERP can answer. `AiDecisionTrace` was built rich from Chunk 1 onward
 * specifically so this could be a read, not new infrastructure.
 *
 * **Finding the trace for a record** is a reasonable-effort scan, documented as such: no
 * workflow's `AiDecisionTrace` carries a structured "which record did this touch" index — each
 * workflow's own `toolCalls[].result` is whatever shape that particular tool returns (e.g.
 * `draft_bill` returns `{invoiceId}`). Rather than guess a schema, this scans the tenant's most
 * recent traces (bounded, not unbounded) for a tool-call result containing the target id anywhere
 * in its JSON — real, honest, and correctly scoped for a chunk with no cross-workflow result-index
 * to query against yet.
 */

const RECENT_TRACE_SCAN_LIMIT = 500;

export interface DecisionTraceAnswer {
  found: boolean;
  claims: Claim[];
  workflowId?: string;
  workflowVersion?: string;
  autonomyApplied?: string;
  toolCalls?: { tool: string; args: Record<string, unknown>; result: Record<string, unknown> | null }[];
  reasonChain?: string[];
  finalOutcome?: string;
  humanEditDetected?: boolean;
}

export async function traceDecisionForRecord(tenantId: string, model: string, recordId: string, recordUpdatedAt?: Date): Promise<DecisionTraceAnswer> {
  await connectDB();
  const traces = await AiDecisionTrace.find({ tenantId }).sort({ createdAt: -1 }).limit(RECENT_TRACE_SCAN_LIMIT).lean();
  const match = traces.find((t) => (t.toolCalls ?? []).some((tc) => JSON.stringify(tc.result ?? {}).includes(recordId)));

  if (!match) {
    return {
      found: false,
      claims: [makeNotFoundClaim(`No AI decision trace found for ${model} ${recordId}`, `AiDecisionTrace scan, tenant ${tenantId}, most recent ${RECENT_TRACE_SCAN_LIMIT} runs, no toolCalls[].result referencing ${recordId}`)],
    };
  }

  const run = await AiWorkflowRun.findById(match.runId).select("autonomyApplied").lean();
  const humanEditDetected = Boolean(recordUpdatedAt && match.finalizedAt && recordUpdatedAt.getTime() > match.finalizedAt.getTime());

  const claims: Claim[] = [
    makeClaim(`${model} ${recordId} was touched by ${match.workflowId} v${match.workflowVersion} (run ${String(match.runId)})`, [{ model: "AiDecisionTrace", id: String(match._id), label: `${match.workflowId} v${match.workflowVersion}` }]),
  ];
  if (humanEditDetected) {
    claims.push(makeClaim(`${model} ${recordId} was modified after the AI's action finalized — this system has no structured audit trail linking who changed what (ActivityLog carries no entity reference, see docs/ai/OPEN_QUESTIONS.md)`, [{ model, id: recordId, label: `${model} updatedAt` }]));
  }

  return {
    found: true,
    claims,
    workflowId: match.workflowId,
    workflowVersion: match.workflowVersion,
    autonomyApplied: run?.autonomyApplied,
    toolCalls: match.toolCalls,
    reasonChain: match.reasonChain,
    finalOutcome: match.finalOutcome,
    humanEditDetected,
  };
}
