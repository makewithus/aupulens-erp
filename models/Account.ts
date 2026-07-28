import mongoose, { Schema, Document } from "mongoose";

export interface IAccount extends Document {
  tenantId?: string;
  // --- Old fields (made optional to not break old code/data) ---
  code?: string;
  name?: string;
  account_type?: string;
  reconcile?: boolean;
  tax_ids?: number[];
  internal_group?: string;
  company_id?: number;
  currency_id?: number;
  parentId?: mongoose.Types.ObjectId;
  parentCode?: string;
  
  // --- New fields for Chart of Accounts feature ---
  accountName?: string;
  accountCode?: string;
  accountType?: mongoose.Types.ObjectId;
  parentAccountId?: mongoose.Types.ObjectId;
  description?: string;
  documents?: string[];
  isLocked?: boolean;
  isActive?: boolean;
  status?: string;
  watchlist?: boolean;
  // True only for the boilerplate rows auto-created by seedChartOfAccounts()
  // (e.g. the generic "Bank Current Account" placeholder) so bank/cash
  // pickers (Payments "Deposit To", Journal Entries) can exclude them until
  // the tenant explicitly adds a real bank account of their own.
  isSystemSeeded?: boolean;

  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AccountSchema: Schema<IAccount> = new Schema(
  {
    tenantId: { type: String, index: true },
    // Old fields
    code: { type: String, trim: true },
    name: { type: String, trim: true },
    account_type: {
      type: String,
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
    
    // New fields
    accountName: { type: String, trim: true },
    accountCode: { type: String, trim: true },
    accountType: { type: Schema.Types.ObjectId, ref: "AccountType" },
    parentAccountId: { type: Schema.Types.ObjectId, ref: "Account" },
    description: { type: String, maxlength: 500 },
    documents: [{ type: String }],
    isLocked: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    status: { type: String, default: "active" },
    watchlist: { type: Boolean, default: false },
    isSystemSeeded: { type: Boolean, default: false },

    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// Indexing for performance and uniqueness
// Old unique index - make it partial so it doesn't fail on new docs without code
AccountSchema.index(
  { tenantId: 1, code: 1 }, 
  { unique: true, partialFilterExpression: { code: { $exists: true, $type: "string" } } }
);
AccountSchema.index({ code: 1 });

// New unique indexes for the new feature
AccountSchema.index(
  { tenantId: 1, accountName: 1 }, 
  { unique: true, partialFilterExpression: { accountName: { $exists: true, $type: "string" } } }
);
AccountSchema.index(
  { tenantId: 1, accountCode: 1 }, 
  { unique: true, partialFilterExpression: { accountCode: { $exists: true, $type: "string" } } }
);

const Account =
  (mongoose.models?.Account as mongoose.Model<IAccount>) ||
  mongoose.model<IAccount>("Account", AccountSchema);

export default Account;
