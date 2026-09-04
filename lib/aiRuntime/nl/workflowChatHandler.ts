import connectDB from "@/lib/db";
import { bootstrapAiRuntime } from "@/lib/aiRuntime/bootstrap";
import { getWorkflow } from "@/lib/aiRuntime/runtime/registry";
import { previewWorkflow } from "@/lib/aiRuntime/runtime/executor";
import { runWorkflowFromChat } from "@/lib/aiRuntime/nl/chatBridge";
import { explainRun } from "@/lib/aiRuntime/nl/explain";
import { summarizePreview } from "@/lib/aiRuntime/nl/previewSummary";
import { resolveLearningRecordForRun } from "@/lib/aiRuntime/learning/resolveOutcomes";
import { AI_AUTONOMY_LEVEL } from "@/lib/constants/statuses";
import AiCommandProposal from "@/models/ai/AiCommandProposal";

/**
 * The shared handler behind AI-NL's "workflow" intent (docs/ai/BRIEF-08b-FINAL.md Part B) —
 * called from BOTH the cheap keyword-resolved path and the LLM-resolved fallback in
 * `app/api/ai/command/route.ts`, so there is exactly one implementation of "run or propose a
 * workflow from chat," never two. Framework-agnostic (returns a plain object, not a
 * `NextResponse`) so it's directly testable without mocking Next's request/response types.
 */

export interface WorkflowChatResult {
  action: "explain" | "confirm" | "unknown";
  message: string;
  workflowId?: string;
  proposalId?: string;
  destructive?: boolean;
  citations?: { kind: string; ref: string; label: string }[];
  recordCount?: number;
  totalAmount?: number;
}

export async function handleWorkflowIntent(tenantId: string, userId: string, workflowId: string, eventKey: string, parameters: Record<string, unknown>): Promise<WorkflowChatResult> {
  bootstrapAiRuntime();
  const workflow = getWorkflow(workflowId);
  if (!workflow) return { action: "unknown", message: `"${workflowId}" is not a registered workflow.` };

  // B.3: "Read-only intents execute immediately. Anything above OBSERVE produces a preview and
  // requires confirmation." OBSERVE never writes anything real, so there is nothing to confirm.
  if (workflow.defaultAutonomy === AI_AUTONOMY_LEVEL.OBSERVE) {
    const envelope = await runWorkflowFromChat(workflowId, eventKey, tenantId, userId, parameters);
    const explanation = await explainRun(envelope);
    return { action: "explain", message: explanation.message, workflowId, citations: explanation.citations };
  }

  // Above OBSERVE: preview only (no act(), nothing persisted) — then the SAME AiCommandProposal
  // confirm gate every other Command Center action already uses (A.2 — no second chassis).
  const preview = await previewWorkflow(workflow, { tenantId, eventKey, payload: { ...parameters, actingUserId: userId } });
  const { summary, recordCount, totalAmount } = summarizePreview(workflowId, preview);

  await connectDB();
  const proposal = await AiCommandProposal.create({
    tenantId,
    userId,
    module: "ai-workflow",
    actionType: workflowId,
    destructive: preview.decisionAllowed && recordCount > 0,
    params: { workflowId, eventKey, parameters },
    preview: { proposal: preview.proposal, findings: preview.findings, autonomyApplied: preview.autonomyApplied, recordCount, totalAmount },
    summary,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });

  return {
    action: "confirm",
    message: `${summary} Confirm to proceed.`,
    workflowId,
    proposalId: String(proposal._id),
    destructive: proposal.destructive,
    recordCount,
    totalAmount,
  };
}

/** Executes a workflow proposal after confirmation — called from the confirm route for
 *  `module: "ai-workflow"` proposals. The actual mutation is exactly `runWorkflowFromChat` again,
 *  same as the OBSERVE immediate path — there is no separate "confirmed execution" code.
 *
 *  Chunk 9 (0.1), resolution signal #2: a human explicitly confirming this run IS an accept
 *  signal for its own learning record — resolved here, once, right after the run completes.
 *  `resolveLearningRecordForRun()` only touches a record still `pending`, so this is a genuine
 *  no-op (not a second, conflicting write) whenever the workflow's own `act()` already resolved
 *  it via `ActResult.learningOutcome`. */
export async function executeWorkflowProposal(tenantId: string, userId: string, params: { workflowId: string; eventKey: string; parameters: Record<string, unknown> }) {
  const envelope = await runWorkflowFromChat(params.workflowId, params.eventKey, tenantId, userId, params.parameters);
  await resolveLearningRecordForRun(envelope.runId, "accepted", "confirmed via AI-NL chat");
  const explanation = await explainRun(envelope);
  return { resultRef: envelope.runId, result: { envelope, message: explanation.message } };
}
