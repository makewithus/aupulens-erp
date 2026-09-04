import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Minimal, additive expense policy store (docs/ai/BRIEF-02-BATCH-A.md AI-04). No expense
 * policy model existed anywhere in this codebase (confirmed in docs/ai/SYSTEM_INVENTORY.md —
 * `AccountingSettings` has Finance-specific thresholds, not this). Seeded empty by design: a
 * missing/unconfigured policy means "no violations detectable," never an invented limit — see
 * this workflow's own doc comment on why that specific behaviour matters.
 */

export interface IAiExpenseCategoryLimit {
  category: string;
  maxAmount: number;
}

export interface IAiExpensePolicy extends Document {
  tenantId: string;
  categoryLimits: IAiExpenseCategoryLimit[];
  receiptRequiredAboveAmount?: number;
  prohibitedCategories: string[];
  createdAt: Date;
  updatedAt: Date;
}

const AiExpensePolicySchema: Schema<IAiExpensePolicy> = new Schema(
  {
    tenantId: { type: String, required: true, unique: true, index: true },
    categoryLimits: {
      type: [{ category: String, maxAmount: Number }],
      default: [],
    },
    receiptRequiredAboveAmount: { type: Number },
    prohibitedCategories: { type: [String], default: [] },
  },
  { timestamps: true },
);

const AiExpensePolicy: Model<IAiExpensePolicy> =
  (mongoose.models.AiExpensePolicy as Model<IAiExpensePolicy>) ||
  mongoose.model<IAiExpensePolicy>("AiExpensePolicy", AiExpensePolicySchema);

export default AiExpensePolicy;
