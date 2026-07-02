import mongoose, { Schema, Document, Model } from "mongoose";
import {
  BUDGET_PERIOD_VALUES,
  BUDGET_PERIOD,
  BUDGET_STATUS_VALUES,
  BUDGET_STATUS,
  BUDGET_SEGMENT_VALUES,
  type BudgetPeriod,
  type BudgetStatus,
  type BudgetSegment,
} from "@/lib/constants/statuses";

export interface IBudgetLineAmount {
  periodLabel: string;
  amount: number;
}

export interface IBudgetLine {
  accountId: mongoose.Types.ObjectId;
  segment: BudgetSegment;
  amounts: IBudgetLineAmount[];
}

export interface IBudget extends Document {
  tenantId: string;
  name: string;
  fiscalYear: string;
  period: BudgetPeriod;
  lines: IBudgetLine[];
  includeBalanceSheetAccounts: boolean;
  status: BudgetStatus;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BudgetLineAmountSchema = new Schema<IBudgetLineAmount>(
  {
    periodLabel: { type: String, required: true },
    amount: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const BudgetLineSchema = new Schema<IBudgetLine>(
  {
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    segment: { type: String, enum: BUDGET_SEGMENT_VALUES, required: true },
    amounts: { type: [BudgetLineAmountSchema], default: [] },
  },
  { _id: false },
);

const BudgetSchema: Schema<IBudget> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    fiscalYear: { type: String, required: true },
    period: { type: String, enum: BUDGET_PERIOD_VALUES, default: BUDGET_PERIOD.MONTHLY },
    lines: { type: [BudgetLineSchema], default: [] },
    includeBalanceSheetAccounts: { type: Boolean, default: false },
    status: { type: String, enum: BUDGET_STATUS_VALUES, default: BUDGET_STATUS.ACTIVE },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

BudgetSchema.index({ tenantId: 1, name: 1, fiscalYear: 1 }, { unique: true });
BudgetSchema.index({ tenantId: 1, status: 1 });

const Budget: Model<IBudget> =
  (mongoose.models.Budget as Model<IBudget>) ||
  mongoose.model<IBudget>("Budget", BudgetSchema);

export default Budget;
