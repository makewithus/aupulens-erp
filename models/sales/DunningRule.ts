import mongoose, { Schema, Document, Model } from "mongoose";
import {
  DUNNING_FINAL_SUBSCRIPTION_ACTION_VALUES,
  DUNNING_FINAL_SUBSCRIPTION_ACTION,
  DUNNING_FINAL_INVOICE_ACTION_VALUES,
  DUNNING_FINAL_INVOICE_ACTION,
} from "@/lib/constants/statuses";

export interface IDunningRetryStep {
  afterDays: number;
  action: string;
}

export interface IDunningChannelConfig {
  onSuccessAction: string;
  onFailureAction: string;
  retries: IDunningRetryStep[];
  finalSubscriptionAction: string;
  finalInvoiceAction: string;
}

// Settings → Sales → Subscriptions → Dunning Management (Sales revamp Part
// 4.7). One tenant-wide "Default" rule is seeded; criteria let future rules
// scope to specific subscription segments (only the default rule is actually
// selected by the engine today — see lib/sales/dunningEngine.ts).
export interface IDunningRule extends Document {
  tenantId: string;
  name: string;
  isDefault: boolean;
  status: "active" | "inactive";
  criteria: { field: string; comparator: string; value: string }[];
  paymentMethod: "cards" | "upi_mandates";
  autocharge: IDunningChannelConfig;
  manual: IDunningChannelConfig;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RetryStepSchema = new Schema<IDunningRetryStep>(
  { afterDays: { type: Number, required: true, default: 3, min: 0 }, action: { type: String, required: true } },
  { _id: false },
);

const ChannelConfigSchema = new Schema<IDunningChannelConfig>(
  {
    onSuccessAction: { type: String, default: "send_thank_you_email" },
    onFailureAction: { type: String, default: "send_payment_failure_email" },
    retries: [RetryStepSchema],
    finalSubscriptionAction: {
      type: String,
      enum: DUNNING_FINAL_SUBSCRIPTION_ACTION_VALUES,
      default: DUNNING_FINAL_SUBSCRIPTION_ACTION.DO_NOTHING,
    },
    finalInvoiceAction: {
      type: String,
      enum: DUNNING_FINAL_INVOICE_ACTION_VALUES,
      default: DUNNING_FINAL_INVOICE_ACTION.DO_NOTHING,
    },
  },
  { _id: false },
);

const DunningRuleSchema = new Schema<IDunningRule>(
  {
    tenantId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    isDefault: { type: Boolean, default: false },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    criteria: [
      {
        field: { type: String, required: true },
        comparator: { type: String, required: true },
        value: { type: String, default: "" },
      },
    ],
    paymentMethod: { type: String, enum: ["cards", "upi_mandates"], default: "cards" },
    autocharge: { type: ChannelConfigSchema, default: () => ({}) },
    manual: { type: ChannelConfigSchema, default: () => ({}) },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

DunningRuleSchema.index({ tenantId: 1 });

const DunningRule: Model<IDunningRule> =
  (mongoose.models.DunningRule as Model<IDunningRule>) ||
  mongoose.model<IDunningRule>("DunningRule", DunningRuleSchema);

export default DunningRule;
