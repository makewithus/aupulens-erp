import mongoose, { Schema, Document, Model } from "mongoose";

export interface IConversationSummary extends Document {
  tenantId: string;
  recordType: string; // Opportunity, Lead, Case
  recordId: mongoose.Types.ObjectId;
  sourceCommunicationIds: mongoose.Types.ObjectId[];
  summary: string;
  keyDecisions: string[];
  risks: string[];
  followUps: string[];
  actionItems: string[];
  sentiment: "Positive" | "Neutral" | "Negative";
  generatedAt: Date;
}

const ConversationSummarySchema = new Schema<IConversationSummary>(
  {
    tenantId: { type: String, required: true },
    recordType: { type: String, required: true },
    recordId: { type: Schema.Types.ObjectId, required: true },
    sourceCommunicationIds: [{ type: Schema.Types.ObjectId, ref: "CrmCommunication" }],
    summary: { type: String, required: true },
    keyDecisions: [{ type: String }],
    risks: [{ type: String }],
    followUps: [{ type: String }],
    actionItems: [{ type: String }],
    sentiment: { type: String, enum: ["Positive", "Neutral", "Negative"], default: "Neutral" },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

ConversationSummarySchema.index({ tenantId: 1, recordType: 1, recordId: 1 });

export default (mongoose.models.CrmConversationSummary as Model<IConversationSummary>) ||
  mongoose.model<IConversationSummary>("CrmConversationSummary", ConversationSummarySchema);
