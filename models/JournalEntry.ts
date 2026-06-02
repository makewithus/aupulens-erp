import mongoose, { Schema, Document, Model } from "mongoose";
import { JournalLineSchema, MonetarySummarySchema } from "./sub/FinanceBase";
import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_STATUS,
  type DocumentStatus,
  VOUCHER_TYPE_VALUES,
  VOUCHER_STATUS_VALUES,
  VOUCHER_STATUS,
  type VoucherType,
  type VoucherStatus,
} from "@/lib/constants/statuses";

export interface IJournalEntry extends Document {
  header: {
    name: string;
    date: Date;
    ref?: string;
    journalType: "sale" | "purchase" | "cash" | "bank" | "general";
  };
  // ─── Voucher-driven accounting fields ───
  voucherType?: VoucherType;
  voucherStatus: VoucherStatus;
  approvalRequired: boolean;
  validatedAt?: Date;
  validatedBy?: mongoose.Types.ObjectId;
  approvalDetails?: {
    approvedBy?: mongoose.Types.ObjectId;
    approvedAt?: Date;
    rejectedBy?: mongoose.Types.ObjectId;
    rejectedAt?: Date;
    reason?: string;
  };
  ledgerUpdatedAt?: Date;
  // ─── Existing fields ───
  lineIds: any[];
  totals: any;
  status: DocumentStatus;
  chatter: any[];
  tenantId: string;
  createdBy?: mongoose.Types.ObjectId;
  isReversed?: boolean;
  reversalEntryId?: mongoose.Types.ObjectId;
  reversedEntryId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const JournalEntrySchema = new Schema<IJournalEntry>(
  {
    header: {
      name: { type: String, required: true },
      date: { type: Date, default: Date.now },
      ref: { type: String },
      journalType: {
        type: String,
        enum: ["sale", "purchase", "cash", "bank", "general"],
        required: true,
      },
    },
    // ─── Voucher fields ───
    voucherType: {
      type: String,
      enum: VOUCHER_TYPE_VALUES,
    },
    voucherStatus: {
      type: String,
      enum: VOUCHER_STATUS_VALUES,
      default: VOUCHER_STATUS.DRAFT,
    },
    approvalRequired: { type: Boolean, default: false },
    validatedAt: { type: Date },
    validatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvalDetails: {
      approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
      approvedAt: { type: Date },
      rejectedBy: { type: Schema.Types.ObjectId, ref: "User" },
      rejectedAt: { type: Date },
      reason: { type: String },
    },
    ledgerUpdatedAt: { type: Date },
    // ─── Existing fields ───
    lineIds: [JournalLineSchema],
    totals: MonetarySummarySchema,
    status: {
      type: String,
      enum: DOCUMENT_STATUS_VALUES,
      default: DOCUMENT_STATUS.DRAFT,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    isReversed: { type: Boolean, default: false },
    reversalEntryId: { type: Schema.Types.ObjectId, ref: "JournalEntry" },
    reversedEntryId: { type: Schema.Types.ObjectId, ref: "JournalEntry" },
    chatter: [
      {
        authorId: { type: Schema.Types.ObjectId, ref: "User" },
        body: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    tenantId: { type: String, required: true },
  },
  { timestamps: true },
);

// Ensure name is unique per tenant
JournalEntrySchema.index({ "header.name": 1, tenantId: 1 }, { unique: true });
JournalEntrySchema.index({ voucherType: 1, tenantId: 1 });
JournalEntrySchema.index({ voucherStatus: 1, tenantId: 1 });

const JournalEntry: Model<IJournalEntry> =
  (mongoose.models.JournalEntry as Model<IJournalEntry>) ||
  mongoose.model<IJournalEntry>("JournalEntry", JournalEntrySchema);

export default JournalEntry;
