import mongoose, { Schema, Document, Model } from "mongoose";
import { JournalLineSchema, MonetarySummarySchema } from "./sub/FinanceBase";
import {
  PAYROLL_STATUS,
  PAYROLL_STATUS_VALUES,
  type PayrollStatus,
} from "@/lib/constants/statuses";

export interface IPayrollLineItem {
  employeeId: mongoose.Types.ObjectId;
  employeeCode: string;
  employeeName: string;
  basic: number;
  hra: number;
  da: number;
  specialAllowance: number;
  grossSalary: number;
  deductions: {
    pf: number;
    esi: number;
    professionalTax: number;
    tds: number;
    otherDeductions: number;
    totalDeductions: number;
  };
  netSalary: number;
  daysWorked: number;
  daysAbsent: number;
  overtime: number;
  overtimeAmount: number;
  lossOfPay: number;
}

export interface IPayroll extends Document {
  tenantId: string;
  payrollCode: string;
  payrollPeriod: {
    month: number;
    year: number;
    startDate: Date;
    endDate: Date;
  };
  departmentId?: mongoose.Types.ObjectId;
  lineItems: IPayrollLineItem[];
  totals: {
    totalGross: number;
    totalDeductions: number;
    totalNet: number;
    totalOvertime: number;
    totalLOP: number;
    currency: string;
  };
  status: PayrollStatus;
  attendanceLockedAt?: Date;
  attendanceLockedBy?: mongoose.Types.ObjectId;
  computedAt?: Date;
  computedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  approvedBy?: mongoose.Types.ObjectId;
  disbursedAt?: Date;
  disbursedBy?: mongoose.Types.ObjectId;
  disbursementRef?: string;
  journalEntryId?: mongoose.Types.ObjectId;
  salaryExpenseJournalId?: mongoose.Types.ObjectId;
  disbursementJournalId?: mongoose.Types.ObjectId;
  notes?: string;
  chatter: Array<{
    authorId: mongoose.Types.ObjectId;
    body: string;
    type: "comment" | "notification";
    createdAt: Date;
  }>;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PayrollLineItemSchema = new Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    employeeCode: { type: String, required: true },
    employeeName: { type: String, required: true },
    basic: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    da: { type: Number, default: 0 },
    specialAllowance: { type: Number, default: 0 },
    grossSalary: { type: Number, default: 0 },
    deductions: {
      pf: { type: Number, default: 0 },
      esi: { type: Number, default: 0 },
      professionalTax: { type: Number, default: 0 },
      tds: { type: Number, default: 0 },
      otherDeductions: { type: Number, default: 0 },
      totalDeductions: { type: Number, default: 0 },
    },
    netSalary: { type: Number, default: 0 },
    daysWorked: { type: Number, default: 0 },
    daysAbsent: { type: Number, default: 0 },
    overtime: { type: Number, default: 0 },
    overtimeAmount: { type: Number, default: 0 },
    lossOfPay: { type: Number, default: 0 },
  },
  { _id: false },
);

const PayrollSchema = new Schema<IPayroll>(
  {
    tenantId: { type: String, required: true, index: true },
    payrollCode: { type: String, required: true, trim: true },
    payrollPeriod: {
      month: { type: Number, required: true, min: 1, max: 12 },
      year: { type: Number, required: true },
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
    },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department" },
    lineItems: [PayrollLineItemSchema],
    totals: {
      totalGross: { type: Number, default: 0 },
      totalDeductions: { type: Number, default: 0 },
      totalNet: { type: Number, default: 0 },
      totalOvertime: { type: Number, default: 0 },
      totalLOP: { type: Number, default: 0 },
      currency: { type: String, default: "INR" },
    },
    status: {
      type: String,
      enum: PAYROLL_STATUS_VALUES,
      default: PAYROLL_STATUS.DRAFT,
    },
    attendanceLockedAt: { type: Date },
    attendanceLockedBy: { type: Schema.Types.ObjectId, ref: "User" },
    computedAt: { type: Date },
    computedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    disbursedAt: { type: Date },
    disbursedBy: { type: Schema.Types.ObjectId, ref: "User" },
    disbursementRef: { type: String },
    journalEntryId: { type: Schema.Types.ObjectId, ref: "JournalEntry" },
    salaryExpenseJournalId: {
      type: Schema.Types.ObjectId,
      ref: "JournalEntry",
    },
    disbursementJournalId: {
      type: Schema.Types.ObjectId,
      ref: "JournalEntry",
    },
    notes: { type: String },
    chatter: [
      {
        authorId: { type: Schema.Types.ObjectId, ref: "User" },
        body: String,
        type: {
          type: String,
          enum: ["comment", "notification"],
          default: "comment",
        },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

PayrollSchema.index({ tenantId: 1, payrollCode: 1 }, { unique: true });
PayrollSchema.index({
  tenantId: 1,
  "payrollPeriod.month": 1,
  "payrollPeriod.year": 1,
});
PayrollSchema.index({ tenantId: 1, status: 1 });

const Payroll: Model<IPayroll> =
  (mongoose.models.Payroll as Model<IPayroll>) ||
  mongoose.model<IPayroll>("Payroll", PayrollSchema);

export default Payroll;
