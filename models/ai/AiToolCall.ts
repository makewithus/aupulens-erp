import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Persistent idempotency store for write-type AI tool calls (docs/ai/BRIEF-02-BATCH-A.md
 * A.3). A process-scoped in-memory Map (the Chunk 1 fast path) is not enough once retries
 * happen in a fresh serverless invocation — this is the durable lock.
 *
 * The compound unique index on {tenantId, toolName, idempotencyKey} IS the lock: `callTool()`
 * inserts an `in_flight` row first; a duplicate-key error means another caller already claimed
 * this exact idempotency key, so the caller reads the existing row instead of re-executing.
 */

export const AI_TOOL_CALL_STATUS = {
  IN_FLIGHT: "in_flight",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
} as const;
export type AiToolCallStatus = (typeof AI_TOOL_CALL_STATUS)[keyof typeof AI_TOOL_CALL_STATUS];

export interface IAiToolCall extends Document {
  tenantId: string;
  runId: mongoose.Types.ObjectId;
  toolName: string;
  idempotencyKey: string;
  argsHash: string;
  status: AiToolCallStatus;
  result: Record<string, unknown> | null;
  recordRefs: { model: string; id: string }[];
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

const AiToolCallSchema: Schema<IAiToolCall> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    runId: { type: Schema.Types.ObjectId, ref: "AiWorkflowRun", required: true },
    toolName: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    argsHash: { type: String, required: true },
    status: { type: String, enum: Object.values(AI_TOOL_CALL_STATUS), default: AI_TOOL_CALL_STATUS.IN_FLIGHT },
    result: { type: Schema.Types.Mixed, default: null },
    recordRefs: { type: [{ model: String, id: String }], default: [] },
    error: { type: String },
    completedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AiToolCallSchema.index({ tenantId: 1, toolName: 1, idempotencyKey: 1 }, { unique: true });

const AiToolCall: Model<IAiToolCall> =
  (mongoose.models.AiToolCall as Model<IAiToolCall>) ||
  mongoose.model<IAiToolCall>("AiToolCall", AiToolCallSchema);

export default AiToolCall;
