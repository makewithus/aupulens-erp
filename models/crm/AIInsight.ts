import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAIInsight extends Document {
  tenantId: string;
  entityType: string; // Lead, Opportunity, Account, Case, Contract
  entityId: mongoose.Types.ObjectId;
  insightType: string; // Risk, Recommendation, Data Quality, Duplicate, Churn
  severity: "Low" | "Medium" | "High" | "Critical";
  confidence: number; // 0-100
  title: string;
  description: string;
  recommendedAction?: string;
  status: "Active" | "Dismissed" | "Resolved";
  createdAt: Date;
  dismissedAt?: Date;
  resolvedAt?: Date;
}

const AIInsightSchema = new Schema<IAIInsight>(
  {
    tenantId: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    insightType: { type: String, required: true },
    severity: { type: String, enum: ["Low", "Medium", "High", "Critical"], required: true },
    confidence: { type: Number, required: true, min: 0, max: 100 },
    title: { type: String, required: true },
    description: { type: String, required: true },
    recommendedAction: { type: String },
    status: { type: String, enum: ["Active", "Dismissed", "Resolved"], default: "Active" },
    createdAt: { type: Date, default: Date.now },
    dismissedAt: { type: Date },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

AIInsightSchema.index({ tenantId: 1, entityType: 1, entityId: 1 });
AIInsightSchema.index({ tenantId: 1, status: 1, severity: 1 });

export default (mongoose.models.CrmAIInsight as Model<IAIInsight>) ||
  mongoose.model<IAIInsight>("CrmAIInsight", AIInsightSchema);
