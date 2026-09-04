import mongoose, { Schema, Document, Model } from "mongoose";
import {
  AI_RUN_STATUS_VALUES,
  AI_RUN_STATUS,
  AI_AUTONOMY_LEVEL_VALUES,
  AI_FINDING_TYPE_VALUES,
  AI_FINDING_SEVERITY_VALUES,
  type AiRunStatus,
  type AiAutonomyLevel,
  type AiFindingType,
  type AiFindingSeverity,
} from "@/lib/constants/statuses";

/**
 * One execution of one AI workflow (docs/ai/BRIEF-01-FOUNDATION.md Part 2.1 + 2.9).
 *
 * This document IS the shared output contract's persisted form — `toEnvelope()`
 * (lib/aiRuntime/contracts/outputContract.ts) serializes it into the exact
 * Part 2.9 JSON shape. Idempotency/replay-safety is enforced by the compound
 * unique index on {workflowId, triggerEventId}: the executor looks up an
 * existing run on that pair before creating a new one.
 */

export interface IAiSubjectRef {
  model: string;
  id: string;
}

export interface IAiEvidence {
  kind: "document" | "record" | "calculation";
  ref: string;
  label: string;
}

export interface IAiProposedAction {
  tool: string;
  args: Record<string, unknown>;
  reversible: boolean;
}

export interface IAiFinding {
  id: string;
  type: AiFindingType;
  severity: AiFindingSeverity;
  title: string;
  detail: string;
  amount?: number;
  currency?: string;
  confidence: number;
  subjectRefs: IAiSubjectRef[];
  evidence: IAiEvidence[];
  proposedAction?: IAiProposedAction;
  actionTaken?: string | null;
  escalatedTaskId?: string | null;
  reasonChain: string[];
}

export interface IAiWorkflowRun extends Document {
  tenantId: string;
  workflowId: string;
  workflowVersion: string;
  entityId: string;
  triggerEventId?: mongoose.Types.ObjectId;
  status: AiRunStatus;
  autonomyApplied: AiAutonomyLevel;
  summary: string;
  findings: IAiFinding[];
  metrics: {
    scanned: number;
    matched: number;
    exceptions: number;
    autoActioned: number;
    /** docs/ai/BRIEF-04-BATCH-C.md Part 0.3 — count of `allowNonStandard: true` tool calls this
     *  run made, so the override rate is visible on the envelope, not just in trace records. */
    policy_overrides: number;
  };
  nextRunHint?: "on_event" | "hourly" | "nightly" | "close_horizon";
  startedAt: Date;
  finishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AiSubjectRefSchema = new Schema<IAiSubjectRef>(
  { model: { type: String, required: true }, id: { type: String, required: true } },
  { _id: false },
);

const AiEvidenceSchema = new Schema<IAiEvidence>(
  {
    kind: { type: String, enum: ["document", "record", "calculation"], required: true },
    ref: { type: String, required: true },
    label: { type: String, required: true },
  },
  { _id: false },
);

const AiProposedActionSchema = new Schema<IAiProposedAction>(
  {
    tool: { type: String, required: true },
    args: { type: Schema.Types.Mixed, default: {} },
    reversible: { type: Boolean, required: true },
  },
  { _id: false },
);

const AiFindingSchema = new Schema<IAiFinding>(
  {
    id: { type: String, required: true },
    type: { type: String, enum: AI_FINDING_TYPE_VALUES, required: true },
    severity: { type: String, enum: AI_FINDING_SEVERITY_VALUES, required: true },
    title: { type: String, required: true },
    detail: { type: String, default: "" },
    amount: { type: Number },
    currency: { type: String },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    subjectRefs: { type: [AiSubjectRefSchema], default: [] },
    evidence: { type: [AiEvidenceSchema], default: [] },
    proposedAction: { type: AiProposedActionSchema },
    actionTaken: { type: String, default: null },
    escalatedTaskId: { type: String, default: null },
    reasonChain: { type: [String], default: [] },
  },
  { _id: false },
);

const AiWorkflowRunSchema: Schema<IAiWorkflowRun> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    workflowId: { type: String, required: true, index: true },
    workflowVersion: { type: String, required: true },
    entityId: { type: String, required: true },
    triggerEventId: { type: Schema.Types.ObjectId, ref: "AiEvent" },
    status: { type: String, enum: AI_RUN_STATUS_VALUES, default: AI_RUN_STATUS.RUNNING },
    autonomyApplied: { type: String, enum: AI_AUTONOMY_LEVEL_VALUES, required: true },
    summary: { type: String, default: "" },
    findings: { type: [AiFindingSchema], default: [] },
    metrics: {
      scanned: { type: Number, default: 0 },
      matched: { type: Number, default: 0 },
      exceptions: { type: Number, default: 0 },
      autoActioned: { type: Number, default: 0 },
      policy_overrides: { type: Number, default: 0 },
    },
    nextRunHint: {
      type: String,
      enum: ["on_event", "hourly", "nightly", "close_horizon"],
    },
    startedAt: { type: Date, required: true, default: Date.now },
    finishedAt: { type: Date },
  },
  { timestamps: true },
);

// A partial index, not `sparse` — sparse only excludes documents where the field is
// genuinely ABSENT, but Mongoose writes an explicit `null` for an unset ObjectId path
// (confirmed by a real test collision: two direct, event-id-less invocations of the same
// workflow both stored `triggerEventId: null` and violated a sparse unique index). The
// partial filter excludes both missing AND explicit-null values, which is what "no trigger
// event" actually means here.
AiWorkflowRunSchema.index(
  { workflowId: 1, triggerEventId: 1 },
  { unique: true, partialFilterExpression: { triggerEventId: { $type: "objectId" } } },
);
AiWorkflowRunSchema.index({ tenantId: 1, workflowId: 1, createdAt: -1 });
AiWorkflowRunSchema.index({ tenantId: 1, status: 1 });

const AiWorkflowRun: Model<IAiWorkflowRun> =
  (mongoose.models.AiWorkflowRun as Model<IAiWorkflowRun>) ||
  mongoose.model<IAiWorkflowRun>("AiWorkflowRun", AiWorkflowRunSchema);

export default AiWorkflowRun;
