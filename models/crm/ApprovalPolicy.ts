import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Configurable multi-step approval policy (6.3 Low-Code Customization).
 *
 * Replaces the hardcoded 3-tier discount router in lib/crm/approvalEngine.ts
 * with a tenant-editable chain: an ordered list of steps, each routed to an
 * approver role and gated by an optional threshold (avg discount % and/or
 * amount). A quote's applicable steps form its approval chain, evaluated in
 * order — so a tenant can model "Manager → Finance → Executive" instead of the
 * fixed two tiers. When no policy exists for an entity, the engine falls back
 * to the legacy 3-tier behaviour, so existing tenants are unaffected.
 */
export interface IApprovalStep {
  order: number;
  approverRole: string; // e.g. "Manager", "Executive", "Finance", "Admin"
  /** Step applies only when avg line discount % is >= this (omit = no discount gate). */
  minAvgDiscountPercent?: number;
  /** Step applies only when the record total is >= this (omit = no amount gate). */
  minAmount?: number;
  label?: string;
}

export interface IApprovalPolicy extends Document {
  tenantId: string;
  entity: string; // "Quote" (extensible to other record types later)
  name: string;
  enabled: boolean;
  steps: IApprovalStep[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ApprovalStepSchema = new Schema<IApprovalStep>(
  {
    order: { type: Number, required: true },
    approverRole: { type: String, required: true },
    minAvgDiscountPercent: { type: Number },
    minAmount: { type: Number },
    label: { type: String },
  },
  { _id: false },
);

const ApprovalPolicySchema = new Schema<IApprovalPolicy>(
  {
    tenantId: { type: String, required: true, index: true },
    entity: { type: String, required: true, default: "Quote" },
    name: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    steps: { type: [ApprovalStepSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

// One active policy per entity per tenant is the common case; index for lookup.
ApprovalPolicySchema.index({ tenantId: 1, entity: 1, enabled: 1 });

export default (mongoose.models.CrmApprovalPolicy as Model<IApprovalPolicy>) ||
  mongoose.model<IApprovalPolicy>("CrmApprovalPolicy", ApprovalPolicySchema);
