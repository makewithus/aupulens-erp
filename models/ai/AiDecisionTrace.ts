import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * The append-only decision trace for one AiWorkflowRun (Part 2.8). 1:1 with
 * the run via `runId`, kept as a separate document (not embedded on the run)
 * so the run stays small and cheap to list/query while the trace — which can
 * grow large with tool calls and reasoning — is only fetched when someone
 * actually needs to audit a specific run.
 *
 * Nothing here is ever mutated after `finalize()` — appendToolCall() pushes,
 * finalizeTrace() sets the terminal fields once. This is what AI-18 (audit
 * intelligence, a later chunk) will read from.
 */

export interface IAiToolCall {
  tool: string;
  args: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  idempotencyKey?: string;
  startedAt: Date;
  durationMs: number;
}

export interface IAiPolicyEvaluation {
  check: string;
  passed: boolean;
  detail: string;
}

export interface IAiDecisionTrace extends Document {
  tenantId: string;
  runId: mongoose.Types.ObjectId;
  workflowId: string;
  workflowVersion: string;
  modelName?: string;
  promptVersion?: string;
  inputsHash: string;
  contextSnapshotRef?: string;
  rawProposal?: Record<string, unknown>;
  confidenceComponents: Record<string, number>;
  policyEvaluations: IAiPolicyEvaluation[];
  toolCalls: IAiToolCall[];
  finalOutcome?: string;
  reasonChain: string[];
  finalizedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AiToolCallSchema = new Schema<IAiToolCall>(
  {
    tool: { type: String, required: true },
    args: { type: Schema.Types.Mixed, default: {} },
    result: { type: Schema.Types.Mixed, default: null },
    error: { type: String, default: null },
    idempotencyKey: { type: String },
    startedAt: { type: Date, required: true },
    durationMs: { type: Number, required: true },
  },
  { _id: false },
);

const AiPolicyEvaluationSchema = new Schema<IAiPolicyEvaluation>(
  {
    check: { type: String, required: true },
    passed: { type: Boolean, required: true },
    detail: { type: String, default: "" },
  },
  { _id: false },
);

const AiDecisionTraceSchema: Schema<IAiDecisionTrace> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    runId: { type: Schema.Types.ObjectId, ref: "AiWorkflowRun", required: true, unique: true },
    workflowId: { type: String, required: true, index: true },
    workflowVersion: { type: String, required: true },
    modelName: { type: String },
    promptVersion: { type: String },
    inputsHash: { type: String, required: true },
    contextSnapshotRef: { type: String },
    rawProposal: { type: Schema.Types.Mixed },
    confidenceComponents: { type: Schema.Types.Mixed, default: {} },
    policyEvaluations: { type: [AiPolicyEvaluationSchema], default: [] },
    toolCalls: { type: [AiToolCallSchema], default: [] },
    finalOutcome: { type: String },
    reasonChain: { type: [String], default: [] },
    finalizedAt: { type: Date },
  },
  { timestamps: true },
);

const AiDecisionTrace: Model<IAiDecisionTrace> =
  (mongoose.models.AiDecisionTrace as Model<IAiDecisionTrace>) ||
  mongoose.model<IAiDecisionTrace>("AiDecisionTrace", AiDecisionTraceSchema);

export default AiDecisionTrace;
