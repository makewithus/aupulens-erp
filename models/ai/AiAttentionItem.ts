import mongoose, { Schema, Document, Model } from "mongoose";
import {
  AI_ATTENTION_PRIORITY_VALUES,
  AI_ATTENTION_STATUS_VALUES,
  AI_ATTENTION_STATUS,
  type AiAttentionPriority,
  type AiAttentionStatus,
} from "@/lib/constants/statuses";

/**
 * The Attention Engine's queue (Part 2.7) — every escalation from every AI
 * workflow lands here as one typed item. `dedupeKey` is how repeat escalations
 * of the same underlying condition collapse into one item instead of spamming
 * the queue; `autoResolve()` (lib/aiRuntime/attention/attentionEngine.ts)
 * closes an item when the condition that raised it is confirmed cleared.
 */

export interface IAiOneClickAction {
  label: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface IAiAttentionItem extends Document {
  tenantId: string;
  workflowId: string;
  runId: mongoose.Types.ObjectId;
  priority: AiAttentionPriority;
  what: string;
  why: string;
  evidence: { kind: string; ref: string; label: string }[];
  proposedAction?: string;
  impactAmount?: number;
  owner?: mongoose.Types.ObjectId;
  due?: Date;
  oneClickActions: IAiOneClickAction[];
  status: AiAttentionStatus;
  dedupeKey: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AiAttentionItemSchema: Schema<IAiAttentionItem> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    workflowId: { type: String, required: true, index: true },
    runId: { type: Schema.Types.ObjectId, ref: "AiWorkflowRun", required: true },
    priority: { type: String, enum: AI_ATTENTION_PRIORITY_VALUES, required: true },
    what: { type: String, required: true },
    why: { type: String, required: true },
    evidence: {
      type: [{ kind: String, ref: String, label: String }],
      default: [],
    },
    proposedAction: { type: String },
    impactAmount: { type: Number },
    owner: { type: Schema.Types.ObjectId, ref: "User" },
    due: { type: Date },
    oneClickActions: {
      type: [{ label: String, tool: String, args: Schema.Types.Mixed }],
      default: [],
    },
    status: { type: String, enum: AI_ATTENTION_STATUS_VALUES, default: AI_ATTENTION_STATUS.OPEN },
    dedupeKey: { type: String, required: true },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

AiAttentionItemSchema.index({ tenantId: 1, dedupeKey: 1 }, { unique: true });
AiAttentionItemSchema.index({ tenantId: 1, status: 1, priority: 1 });

const AiAttentionItem: Model<IAiAttentionItem> =
  (mongoose.models.AiAttentionItem as Model<IAiAttentionItem>) ||
  mongoose.model<IAiAttentionItem>("AiAttentionItem", AiAttentionItemSchema);

export default AiAttentionItem;
