import mongoose, { Schema, Document, Model } from "mongoose";
import {
  TRANSACTION_LOCK_MODULE_VALUES,
  type TransactionLockModule,
} from "@/lib/constants/statuses";

export interface ITransactionLock extends Document {
  tenantId: string;
  module: TransactionLockModule;
  lockedUpToDate: Date | null;
  reason?: string;
  isLocked: boolean;
  lockedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionLockSchema: Schema<ITransactionLock> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    module: { type: String, enum: TRANSACTION_LOCK_MODULE_VALUES, required: true },
    lockedUpToDate: { type: Date, default: null },
    reason: { type: String, trim: true },
    isLocked: { type: Boolean, default: false },
    lockedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

TransactionLockSchema.index({ tenantId: 1, module: 1 }, { unique: true });

const TransactionLock: Model<ITransactionLock> =
  (mongoose.models.TransactionLock as Model<ITransactionLock>) ||
  mongoose.model<ITransactionLock>("TransactionLock", TransactionLockSchema);

export default TransactionLock;
