import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Real materiality numbers, per tenant per action class (docs/ai/BRIEF-03-BATCH-B.md A.5).
 * `AccountingSettings.journals.approvalThresholdAmount`/`.tds.thresholdAmount` were the only
 * analogues found (both Finance-scoped, not AI-aware — see docs/ai/SYSTEM_INVENTORY.md).
 *
 * Seeded empty by design, same precedent as `AiExpensePolicy`: **absent policy for an action
 * class means no autonomous action for it, not an assumed default.** Every workflow that reads
 * this must check `policyConfigured` per action class and drop to RECOMMEND, explicitly saying
 * so in its reason chain, when it's missing — never invent a number.
 */

export interface IAiMaterialityThreshold {
  appliesTo: string; // action class, e.g. "prepaid_recognition", "accrual", "capitalisation"
  absoluteAmount?: number;
  percentOfBalance?: number;
}

export interface IAiMaterialityPolicy extends Document {
  tenantId: string;
  thresholds: IAiMaterialityThreshold[];
  createdAt: Date;
  updatedAt: Date;
}

const AiMaterialityPolicySchema: Schema<IAiMaterialityPolicy> = new Schema(
  {
    tenantId: { type: String, required: true, unique: true, index: true },
    thresholds: {
      type: [{ appliesTo: String, absoluteAmount: Number, percentOfBalance: Number }],
      default: [],
    },
  },
  { timestamps: true },
);

const AiMaterialityPolicy: Model<IAiMaterialityPolicy> =
  (mongoose.models.AiMaterialityPolicy as Model<IAiMaterialityPolicy>) ||
  mongoose.model<IAiMaterialityPolicy>("AiMaterialityPolicy", AiMaterialityPolicySchema);

export default AiMaterialityPolicy;

/** Looks up the threshold for one action class — undefined means "not configured," which
 *  callers must treat as "no autonomous action," never as "no limit." */
export function findThreshold(policy: IAiMaterialityPolicy | null, appliesTo: string): IAiMaterialityThreshold | undefined {
  return policy?.thresholds.find((t) => t.appliesTo === appliesTo);
}
