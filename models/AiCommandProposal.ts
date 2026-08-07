import mongoose, { Schema, Document, Model } from "mongoose";
import { AI_ACTION_STATUS_VALUES, AI_ACTION_STATUS, type AiActionStatus } from "@/lib/constants/statuses";

/**
 * Generalized cross-module AI action proposal for the AI Command Center.
 *
 * Mirrors models/AiActionProposal.ts (the Finance-scoped confirm gate) but for
 * arbitrary modules: `actionType` is a free-form registry key (validated in
 * lib/ai/commandActions.ts, not by a mongoose enum) so new safe actions can be
 * added without a schema migration. Every mutation the Command Center performs
 * goes through this record: propose (preview only, no mutation) → confirm
 * (execute + audit) → executed, or reject. TTL-expires like the Finance one so
 * a stale preview can never be silently executed later.
 */
export interface IAiCommandProposal extends Document {
  tenantId: string;
  userId: mongoose.Types.ObjectId;
  module: string;
  actionType: string;
  /** True for actions that delete/irreversibly change data — surfaced in the UI. */
  destructive: boolean;
  params: Record<string, unknown>;
  preview: Record<string, unknown>;
  summary: string;
  status: AiActionStatus;
  resultRef?: string;
  executedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AiCommandProposalSchema: Schema<IAiCommandProposal> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    module: { type: String, required: true },
    actionType: { type: String, required: true },
    destructive: { type: Boolean, default: false },
    params: { type: Schema.Types.Mixed, default: {} },
    preview: { type: Schema.Types.Mixed, default: {} },
    summary: { type: String, default: "" },
    status: { type: String, enum: AI_ACTION_STATUS_VALUES, default: AI_ACTION_STATUS.PROPOSED },
    resultRef: { type: String },
    executedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

AiCommandProposalSchema.index({ tenantId: 1, status: 1 });
AiCommandProposalSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AiCommandProposal: Model<IAiCommandProposal> =
  (mongoose.models.AiCommandProposal as Model<IAiCommandProposal>) ||
  mongoose.model<IAiCommandProposal>("AiCommandProposal", AiCommandProposalSchema);

export default AiCommandProposal;
