import mongoose, { Schema, Document } from "mongoose";

export interface IAccount extends Document {
  tenantId?: string;
  code: string;
  name: string;
  account_type:
    | "asset_receivable"
    | "asset_cash"
    | "asset_current"
    | "asset_non_current"
    | "asset_prepayments"
    | "asset_fixed"
    | "liability_payable"
    | "liability_credit_card"
    | "liability_current"
    | "liability_non_current"
    | "equity"
    | "equity_unaffected"
    | "income"
    | "income_other"
    | "expense"
    | "expense_depreciation"
    | "expense_direct_cost"
    | "off_balance";
  reconcile: boolean;
  tax_ids: number[];
  internal_group:
    | "asset"
    | "liability"
    | "equity"
    | "income"
    | "expense"
    | "off_balance";
  company_id?: number;
  currency_id?: number;
  parentId?: mongoose.Types.ObjectId;
  parentCode?: string;
  createdBy: mongoose.Types.ObjectId;
}

const AccountSchema: Schema<IAccount> = new Schema(
  {
    tenantId: { type: String, index: true },
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    account_type: {
      type: String,
      required: true,
      enum: [
        "asset_receivable",
        "asset_cash",
        "asset_current",
        "asset_non_current",
        "asset_prepayments",
        "asset_fixed",
        "liability_payable",
        "liability_credit_card",
        "liability_current",
        "liability_non_current",
        "equity",
        "equity_unaffected",
        "income",
        "income_other",
        "expense",
        "expense_depreciation",
        "expense_direct_cost",
        "off_balance",
      ],
    },
    reconcile: { type: Boolean, default: false },
    tax_ids: [{ type: Number }],
    internal_group: {
      type: String,
      required: true,
      enum: [
        "asset",
        "liability",
        "equity",
        "income",
        "expense",
        "off_balance",
      ],
    },
    company_id: { type: Number },
    currency_id: { type: Number },
    parentId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    parentCode: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

// Indexing for performance and uniqueness
AccountSchema.index({ tenantId: 1, code: 1 }, { unique: true });
AccountSchema.index({ code: 1 });

const Account =
  (mongoose.models?.Account as mongoose.Model<IAccount>) ||
  mongoose.model<IAccount>("Account", AccountSchema);

export default Account;
