import mongoose, { Schema, Document, Model } from "mongoose";
import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_STATUS,
  type DocumentStatus,
} from "@/lib/constants/statuses";

export interface IChatterMessage {
  authorId: mongoose.Types.ObjectId;
  body: string;
  type: "comment" | "notification";
  createdAt: Date;
}

export interface IExpense extends Document {
  description: string;
  category: string;
  total: number;
  taxAmount: number;
  isTaxIncluded: boolean;
  employeeId: mongoose.Types.ObjectId;
  paidBy: "employee" | "company";
  expenseDate: Date;
  managerId?: mongoose.Types.ObjectId;
  accountId: mongoose.Types.ObjectId;
  paymentAccountId?: mongoose.Types.ObjectId;
  notes?: string;
  status: DocumentStatus;
  journalEntryId?: mongoose.Types.ObjectId;
  chatter: IChatterMessage[];
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

const ChatterMessageSchema = new Schema<IChatterMessage>({
  authorId: { type: Schema.Types.ObjectId, ref: "User" },
  body: String,
  type: {
    type: String,
    enum: ["comment", "notification"],
    default: "comment",
  },
  createdAt: { type: Date, default: Date.now },
});

const ExpenseSchema = new Schema<IExpense>(
  {
    description: { type: String, required: true },
    category: { type: String, required: true },
    total: { type: Number, required: true },
    taxAmount: { type: Number, default: 0 },
    isTaxIncluded: { type: Boolean, default: false },
    employeeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    paidBy: {
      type: String,
      enum: ["employee", "company"],
      default: "employee",
    },
    expenseDate: { type: Date, default: Date.now },
    managerId: { type: Schema.Types.ObjectId, ref: "User" },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    paymentAccountId: { type: Schema.Types.ObjectId, ref: "Account" },
    notes: { type: String },
    status: {
      type: String,
      enum: DOCUMENT_STATUS_VALUES,
      default: DOCUMENT_STATUS.DRAFT,
    },
    journalEntryId: { type: Schema.Types.ObjectId, ref: "JournalEntry" },
    chatter: [ChatterMessageSchema],
    tenantId: { type: String, required: true },
  },
  { timestamps: true },
);

ExpenseSchema.index({ tenantId: 1 });
ExpenseSchema.index({ tenantId: 1, status: 1 });

const Expense: Model<IExpense> =
  (mongoose.models.Expense as Model<IExpense>) ||
  mongoose.model<IExpense>("Expense", ExpenseSchema);

export default Expense;
