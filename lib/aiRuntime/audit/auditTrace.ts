import crypto from "node:crypto";
import connectDB from "@/lib/db";
import AiDecisionTrace, { type IAiToolCall, type IAiPolicyEvaluation } from "@/models/ai/AiDecisionTrace";
import type { ToolCallRecord } from "@/lib/aiRuntime/tools/registry";

/**
 * The append-only decision trace writer (Part 2.8). Hard Rule 7: every AI
 * action writes an audit record, no exceptions, including read-only runs —
 * `startTrace()` is called unconditionally by the executor before any stage
 * runs, and `finalizeTrace()` is the executor's last step no matter how the
 * run ended (completed/escalated/failed/no_action).
 */

export function hashInputs(inputs: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(inputs)).digest("hex");
}

export async function startTrace(params: {
  tenantId: string;
  runId: string;
  workflowId: string;
  workflowVersion: string;
  inputs: unknown;
  contextSnapshotRef?: string;
}): Promise<string> {
  await connectDB();
  const doc = await AiDecisionTrace.create({
    tenantId: params.tenantId,
    runId: params.runId,
    workflowId: params.workflowId,
    workflowVersion: params.workflowVersion,
    inputsHash: hashInputs(params.inputs),
    contextSnapshotRef: params.contextSnapshotRef,
    toolCalls: [],
    policyEvaluations: [],
    reasonChain: [],
  });
  return String(doc._id);
}

export async function appendToolCall(traceId: string, call: ToolCallRecord): Promise<void> {
  await connectDB();
  const record: IAiToolCall = {
    tool: call.tool,
    args: call.args,
    result: call.result,
    error: call.error,
    idempotencyKey: call.idempotencyKey,
    startedAt: call.startedAt,
    durationMs: call.durationMs,
  };
  await AiDecisionTrace.updateOne({ _id: traceId }, { $push: { toolCalls: record } });
}

export async function appendPolicyEvaluations(
  traceId: string,
  evaluations: IAiPolicyEvaluation[],
): Promise<void> {
  if (evaluations.length === 0) return;
  await connectDB();
  await AiDecisionTrace.updateOne({ _id: traceId }, { $push: { policyEvaluations: { $each: evaluations } } });
}

export async function finalizeTrace(
  traceId: string,
  params: {
    finalOutcome: string;
    reasonChain: string[];
    rawProposal?: Record<string, unknown>;
    confidenceComponents?: Record<string, number>;
    modelName?: string;
    promptVersion?: string;
  },
): Promise<void> {
  await connectDB();
  await AiDecisionTrace.updateOne(
    { _id: traceId },
    {
      $set: {
        finalOutcome: params.finalOutcome,
        reasonChain: params.reasonChain,
        rawProposal: params.rawProposal,
        confidenceComponents: params.confidenceComponents ?? {},
        modelName: params.modelName,
        promptVersion: params.promptVersion,
        finalizedAt: new Date(),
      },
    },
  );
}

export async function getTraceByRunId(runId: string) {
  await connectDB();
  return AiDecisionTrace.findOne({ runId }).lean();
}
