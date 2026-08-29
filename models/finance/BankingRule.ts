import mongoose, { Schema, Document, Model } from "mongoose";
import {
  BANKING_RULE_APPLY_TO_VALUES,
  BANKING_RULE_APPLY_TO,
  BANKING_RULE_TRANSACTION_HANDLING_VALUES,
  BANKING_RULE_TRANSACTION_HANDLING,
  BANKING_RULE_CRITERIA_MATCH_VALUES,
  BANKING_RULE_CRITERIA_MATCH,
  BANKING_RULE_RECORD_AS_VALUES,
  BANKING_RULE_ASSOCIATE_MODE_VALUES,
  BANKING_RULE_ASSOCIATE_MODE,
  BANKING_RULE_STATUS_VALUES,
  BANKING_RULE_STATUS,
  type BankingRuleApplyTo,
  type BankingRuleTransactionHandling,
  type BankingRuleCriteriaMatch,
  type BankingRuleRecordAs,
  type BankingRuleAssociateMode,
  type BankingRuleStatus,
} from "@/lib/constants/statuses";

export interface IBankingRuleCriterion {
  field: string;
  operator: string;
  value: string;
}

export interface IBankingRule extends Document {
  tenantId: string;
  ruleName: string;
  applyTo: BankingRuleApplyTo;
  transactionHandling: BankingRuleTransactionHandling;
  criteriaMatch: BankingRuleCriteriaMatch;
  criteria: IBankingRuleCriterion[];
  recordAs: BankingRuleRecordAs;
  accountId: mongoose.Types.ObjectId;
  referenceNumber?: string;
  associateAccountsMode: BankingRuleAssociateMode;
  associatedAccountIds: mongoose.Types.ObjectId[];
  status: BankingRuleStatus;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BankingRuleCriterionSchema = new Schema<IBankingRuleCriterion>(
  {
    field: { type: String, required: true },
    operator: { type: String, required: true },
    value: { type: String, required: true },
  },
  { _id: false },
);

const BankingRuleSchema: Schema<IBankingRule> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    ruleName: { type: String, required: true, trim: true },
    applyTo: {
      type: String,
      enum: BANKING_RULE_APPLY_TO_VALUES,
      default: BANKING_RULE_APPLY_TO.DEPOSITS,
    },
    transactionHandling: {
      type: String,
      enum: BANKING_RULE_TRANSACTION_HANDLING_VALUES,
      default: BANKING_RULE_TRANSACTION_HANDLING.RECOGNIZED,
    },
    criteriaMatch: {
      type: String,
      enum: BANKING_RULE_CRITERIA_MATCH_VALUES,
      default: BANKING_RULE_CRITERIA_MATCH.ANY,
    },
    criteria: {
      type: [BankingRuleCriterionSchema],
      default: [],
      validate: {
        validator: (v: IBankingRuleCriterion[]) => Array.isArray(v) && v.length > 0,
        message: "At least one criterion is required",
      },
    },
    recordAs: { type: String, enum: BANKING_RULE_RECORD_AS_VALUES, required: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    referenceNumber: { type: String, trim: true },
    associateAccountsMode: {
      type: String,
      enum: BANKING_RULE_ASSOCIATE_MODE_VALUES,
      default: BANKING_RULE_ASSOCIATE_MODE.CUSTOM,
    },
    associatedAccountIds: [{ type: Schema.Types.ObjectId, ref: "Account" }],
    status: { type: String, enum: BANKING_RULE_STATUS_VALUES, default: BANKING_RULE_STATUS.ACTIVE },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

BankingRuleSchema.index({ tenantId: 1, ruleName: 1 }, { unique: true });
BankingRuleSchema.index({ tenantId: 1, status: 1 });

const BankingRule: Model<IBankingRule> =
  (mongoose.models.BankingRule as Model<IBankingRule>) ||
  mongoose.model<IBankingRule>("BankingRule", BankingRuleSchema);

export default BankingRule;
