import mongoose, { Schema, Document, Model } from "mongoose";
import {
  BANK_ACCOUNT_TYPE_VALUES,
  BANK_ACCOUNT_TYPE,
  BANK_ACCOUNT_CONNECTION_STATUS_VALUES,
  BANK_ACCOUNT_CONNECTION_STATUS,
  type BankAccountType,
  type BankAccountConnectionStatus,
} from "@/lib/constants/statuses";

export interface IBankAccount extends Document {
  tenantId: string;
  accountType: BankAccountType;
  accountName: string;
  accountCode?: string;
  currency: string;
  accountNumber?: string;
  bankName?: string;
  ifsc?: string;
  upiId?: string; // Additive — Sales invoice "Pay using UPI" QR code
  userIds: mongoose.Types.ObjectId[];
  description?: string;
  isPrimary: boolean;
  connectionStatus: BankAccountConnectionStatus;
  providerId?: mongoose.Types.ObjectId;
  glAccountId?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BankAccountSchema: Schema<IBankAccount> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    accountType: { type: String, enum: BANK_ACCOUNT_TYPE_VALUES, default: BANK_ACCOUNT_TYPE.BANK },
    accountName: { type: String, required: true, trim: true },
    accountCode: { type: String, trim: true },
    currency: { type: String, default: "INR" },
    accountNumber: { type: String, trim: true },
    bankName: { type: String, trim: true },
    ifsc: { type: String, trim: true, uppercase: true },
    upiId: { type: String, trim: true },
    userIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    description: { type: String, maxlength: 500 },
    isPrimary: { type: Boolean, default: false },
    connectionStatus: {
      type: String,
      enum: BANK_ACCOUNT_CONNECTION_STATUS_VALUES,
      default: BANK_ACCOUNT_CONNECTION_STATUS.MANUAL,
    },
    providerId: { type: Schema.Types.ObjectId, ref: "BankFeedProvider" },
    glAccountId: { type: Schema.Types.ObjectId, ref: "Account" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

BankAccountSchema.index({ tenantId: 1, accountName: 1 }, { unique: true });
BankAccountSchema.index({ tenantId: 1, accountType: 1 });

const BankAccount: Model<IBankAccount> =
  (mongoose.models.BankAccount as Model<IBankAccount>) ||
  mongoose.model<IBankAccount>("BankAccount", BankAccountSchema);

export default BankAccount;
