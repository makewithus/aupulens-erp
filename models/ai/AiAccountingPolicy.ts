import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * AI-26's policy registry (docs/ai/BRIEF-08a-BATCH-G.md, AI-26 algorithm step 1). A policy is
 * either `"configured"` (a human set it — today, read from `AiMaterialityPolicy`, the one real
 * policy-numbers store this codebase has) or `"observed"` (AI-26 inferred it from consistent
 * historical treatment — a hypothesis, always labelled as such, never presented as a rule). AI-26
 * only ever writes HERE — never `AccountingSettings`, never `lib/accounting/smart-rules.ts`
 * (asserted directly in this workflow's own tests).
 */

export interface IAiAccountingPolicy extends Document {
  tenantId: string;
  policyKey: string;
  scopeConditions: Record<string, unknown>;
  statedTreatment: string;
  effectiveFrom: Date;
  source: "configured" | "observed";
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const AiAccountingPolicySchema: Schema<IAiAccountingPolicy> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    policyKey: { type: String, required: true },
    scopeConditions: { type: Schema.Types.Mixed, default: {} },
    statedTreatment: { type: String, required: true },
    effectiveFrom: { type: Date, required: true },
    source: { type: String, enum: ["configured", "observed"], required: true },
    version: { type: Number, default: 1 },
  },
  { timestamps: true },
);

AiAccountingPolicySchema.index({ tenantId: 1, policyKey: 1 }, { unique: true });

const AiAccountingPolicy: Model<IAiAccountingPolicy> =
  (mongoose.models.AiAccountingPolicy as Model<IAiAccountingPolicy>) || mongoose.model<IAiAccountingPolicy>("AiAccountingPolicy", AiAccountingPolicySchema);

export default AiAccountingPolicy;
