import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAccountingSettings extends Document {
  tenantId: string;
  chartOfAccounts: {
    autoGenerateAccountCode: boolean;
    defaultAccountCodeLength: number;
    defaultReceivableAccountId?: mongoose.Types.ObjectId;
    defaultPayableAccountId?: mongoose.Types.ObjectId;
    roundingAccountId?: mongoose.Types.ObjectId;
    defaultBankAccountId?: mongoose.Types.ObjectId;
    defaultCashAccountId?: mongoose.Types.ObjectId;
  };
  journals: {
    defaultJournalPrefix: string;
    allowBackdatedEntries: boolean;
    approvalsEnabled: boolean;
    approvalThresholdAmount: number;
    approverRole: string;
    requireBalancedEntries: boolean;
    preventFutureDated: boolean;
    requireReference: boolean;
    maxDescriptionLength: number;
  };
  currency: {
    baseCurrency: string;
    enabledCurrencies: { code: string; symbol: string; name: string }[];
  };
  taxSettings: {
    pricesIncludeTax: boolean;
    gstin?: string;
    defaultSalesTaxRateId?: mongoose.Types.ObjectId;
    defaultPurchaseTaxRateId?: mongoose.Types.ObjectId;
  };
  tds: {
    enabled: boolean;
    defaultSectionCode?: string;
    thresholdAmount: number;
  };
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AccountingSettingsSchema: Schema<IAccountingSettings> = new Schema(
  {
    tenantId: { type: String, required: true },
    chartOfAccounts: {
      autoGenerateAccountCode: { type: Boolean, default: true },
      defaultAccountCodeLength: { type: Number, default: 4 },
      defaultReceivableAccountId: { type: Schema.Types.ObjectId, ref: "Account" },
      defaultPayableAccountId: { type: Schema.Types.ObjectId, ref: "Account" },
      roundingAccountId: { type: Schema.Types.ObjectId, ref: "Account" },
      defaultBankAccountId: { type: Schema.Types.ObjectId, ref: "Account" },
      defaultCashAccountId: { type: Schema.Types.ObjectId, ref: "Account" },
    },
    journals: {
      defaultJournalPrefix: { type: String, default: "JNL" },
      allowBackdatedEntries: { type: Boolean, default: true },
      approvalsEnabled: { type: Boolean, default: false },
      approvalThresholdAmount: { type: Number, default: 0 },
      approverRole: { type: String, default: "finance" },
      requireBalancedEntries: { type: Boolean, default: true },
      preventFutureDated: { type: Boolean, default: false },
      requireReference: { type: Boolean, default: false },
      maxDescriptionLength: { type: Number, default: 500 },
    },
    currency: {
      baseCurrency: { type: String, default: "INR" },
      enabledCurrencies: {
        type: [{ code: String, symbol: String, name: String }],
        default: [{ code: "INR", symbol: "₹", name: "Indian Rupee" }],
      },
    },
    taxSettings: {
      pricesIncludeTax: { type: Boolean, default: false },
      gstin: { type: String, trim: true },
      defaultSalesTaxRateId: { type: Schema.Types.ObjectId, ref: "TaxRate" },
      defaultPurchaseTaxRateId: { type: Schema.Types.ObjectId, ref: "TaxRate" },
    },
    tds: {
      enabled: { type: Boolean, default: false },
      defaultSectionCode: { type: String, trim: true },
      thresholdAmount: { type: Number, default: 0 },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

AccountingSettingsSchema.index({ tenantId: 1 }, { unique: true });

const AccountingSettings: Model<IAccountingSettings> =
  (mongoose.models.AccountingSettings as Model<IAccountingSettings>) ||
  mongoose.model<IAccountingSettings>("AccountingSettings", AccountingSettingsSchema);

export default AccountingSettings;
