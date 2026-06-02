import mongoose, { Schema, Document, Model } from "mongoose";
import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_STATUS,
  type DocumentStatus,
} from "@/lib/constants/statuses";

export interface IBankStatement extends Document {
  header: {
    name: string;
    journalId: mongoose.Types.ObjectId;
    date: Date;
    balance_start: number;
    balance_end_real: number;
  };
  lineIds: {
    date: Date;
    payment_ref: string;
    partnerId?: mongoose.Types.ObjectId;
    amount: number;
    isReconciled: boolean;
  }[];
  status: DocumentStatus;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

const BankStatementSchema = new Schema<IBankStatement>(
  {
    header: {
      name: { type: String, required: true },
      journalId: {
        type: Schema.Types.ObjectId,
        ref: "Account",
        required: true,
      },
      date: { type: Date, default: Date.now },
      balance_start: { type: Number, default: 0 },
      balance_end_real: { type: Number, default: 0 },
    },
    lineIds: [
      {
        date: { type: Date, required: true },
        payment_ref: { type: String },
        partnerId: { type: Schema.Types.ObjectId, ref: "Customer" },
        amount: { type: Number, required: true },
        isReconciled: { type: Boolean, default: false },
      },
    ],
    status: {
      type: String,
      enum: DOCUMENT_STATUS_VALUES,
      default: DOCUMENT_STATUS.DRAFT,
    },
    tenantId: { type: String, required: true },
  },
  { timestamps: true },
);

const BankStatement: Model<IBankStatement> =
  (mongoose.models.BankStatement as Model<IBankStatement>) ||
  mongoose.model<IBankStatement>("BankStatement", BankStatementSchema);

export default BankStatement;
