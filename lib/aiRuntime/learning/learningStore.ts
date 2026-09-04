import connectDB from "@/lib/db";
import AiLearningRecord from "@/models/ai/AiLearningRecord";
import { AI_LEARNING_OUTCOME, type AiLearningOutcome } from "@/lib/constants/statuses";

/**
 * The shared learning loop (Part 2.6) — one store, not reimplemented per
 * workflow. Records proposal-vs-outcome; NEVER mutates any rule directly.
 * Aggregating stable patterns into a "learned mapping" proposal is a
 * separate, later, human-approved step — not built in this chunk, since no
 * workflow exists yet to produce proposals worth aggregating.
 */

export async function recordProposal(params: {
  tenantId: string;
  workflowId: string;
  runId: string;
  proposal: Record<string, unknown>;
  contextRef?: string;
}): Promise<string> {
  await connectDB();
  const doc = await AiLearningRecord.create({
    tenantId: params.tenantId,
    workflowId: params.workflowId,
    runId: params.runId,
    proposal: params.proposal,
    contextRef: params.contextRef,
    outcome: AI_LEARNING_OUTCOME.PENDING,
  });
  return String(doc._id);
}

export async function recordOutcome(params: {
  learningRecordId: string;
  outcome: AiLearningOutcome;
  editedValue?: Record<string, unknown>;
  userId?: string;
  downstreamResult?: string;
}): Promise<void> {
  await connectDB();
  await AiLearningRecord.updateOne(
    { _id: params.learningRecordId },
    {
      $set: {
        outcome: params.outcome,
        editedValue: params.editedValue,
        userId: params.userId,
        downstreamResult: params.downstreamResult,
      },
    },
  );
}
