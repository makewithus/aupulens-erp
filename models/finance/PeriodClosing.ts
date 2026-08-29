import mongoose, { Schema, Document, Model } from "mongoose";
import {
  PERIOD_CLOSING_STATUS,
  PERIOD_CLOSING_STATUS_VALUES,
  type PeriodClosingStatus,
} from "@/lib/constants/statuses";

export interface IPeriodClosing extends Document {
  name: string; // e.g. "FY2026-Q1" or "2026-01"
  fiscalYear: number;
  month: number; // 1-12
  quarter?: number; // 1-4
  status: PeriodClosingStatus;
  // Step tracking
  lockedAt?: Date;
  lockedBy?: mongoose.Types.ObjectId;
  accrualsPostedAt?: Date;
  accrualsPostedBy?: mongoose.Types.ObjectId;
  accrualsNotes?: string;
  reconciledAt?: Date;
  reconciledBy?: mongoose.Types.ObjectId;
  reconciliationNotes?: string;
  depreciationRun: boolean;
  closedAt?: Date;
  closedBy?: mongoose.Types.ObjectId;
  statementsGeneratedAt?: Date;
  statementsGeneratedBy?: mongoose.Types.ObjectId;
  // Snapshot data captured at close
  snapshot?: {
    totalRevenue?: number;
    totalExpenses?: number;
    netIncome?: number;
    totalAssets?: number;
    totalLiabilities?: number;
    totalEquity?: number;
  };
  notes?: string;
  tenantId: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PeriodClosingSchema = new Schema<IPeriodClosing>(
  {
    name: { type: String, required: true },
    fiscalYear: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    quarter: { type: Number, min: 1, max: 4 },
    status: {
      type: String,
      enum: PERIOD_CLOSING_STATUS_VALUES,
      default: PERIOD_CLOSING_STATUS.OPEN,
    },
    lockedAt: { type: Date },
    lockedBy: { type: Schema.Types.ObjectId, ref: "User" },
    accrualsPostedAt: { type: Date },
    accrualsPostedBy: { type: Schema.Types.ObjectId, ref: "User" },
    accrualsNotes: { type: String },
    reconciledAt: { type: Date },
    reconciledBy: { type: Schema.Types.ObjectId, ref: "User" },
    reconciliationNotes: { type: String },
    depreciationRun: { type: Boolean, default: false },
    closedAt: { type: Date },
    closedBy: { type: Schema.Types.ObjectId, ref: "User" },
    statementsGeneratedAt: { type: Date },
    statementsGeneratedBy: { type: Schema.Types.ObjectId, ref: "User" },
    snapshot: {
      totalRevenue: { type: Number },
      totalExpenses: { type: Number },
      netIncome: { type: Number },
      totalAssets: { type: Number },
      totalLiabilities: { type: Number },
      totalEquity: { type: Number },
    },
    notes: { type: String },
    tenantId: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

PeriodClosingSchema.index(
  { fiscalYear: 1, month: 1, tenantId: 1 },
  { unique: true },
);
PeriodClosingSchema.index({ status: 1, tenantId: 1 });

const PeriodClosing: Model<IPeriodClosing> =
  (mongoose.models.PeriodClosing as Model<IPeriodClosing>) ||
  mongoose.model<IPeriodClosing>("PeriodClosing", PeriodClosingSchema);

export default PeriodClosing;
