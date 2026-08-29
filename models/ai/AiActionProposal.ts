import mongoose, { Schema, Document, Model } from "mongoose";
import {
  AI_ACTION_STATUS_VALUES,
  AI_ACTION_STATUS,
  AI_ACTION_TYPE_VALUES,
  type AiActionStatus,
  type AiActionType,
} from "@/lib/constants/statuses";

export interface IAiActionProposal extends Document {
  tenantId: string;
  userId: mongoose.Types.ObjectId;
  module: string;
  actionType: AiActionType;
  params: Record<string, unknown>;
  preview: Record<string, unknown>;
  status: AiActionStatus;
  resultRef?: string;
  executedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AiActionProposalSchema: Schema<IAiActionProposal> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    module: { type: String, default: "finance" },
    actionType: { type: String, enum: AI_ACTION_TYPE_VALUES, required: true },
    params: { type: Schema.Types.Mixed, default: {} },
    preview: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: AI_ACTION_STATUS_VALUES, default: AI_ACTION_STATUS.PROPOSED },
    resultRef: { type: String },
    executedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

AiActionProposalSchema.index({ tenantId: 1, status: 1 });
AiActionProposalSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AiActionProposal: Model<IAiActionProposal> =
  (mongoose.models.AiActionProposal as Model<IAiActionProposal>) ||
  mongoose.model<IAiActionProposal>("AiActionProposal", AiActionProposalSchema);

export default AiActionProposal;
