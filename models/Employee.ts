import mongoose, { Schema, Document, Model } from "mongoose";
import {
  ENTITY_STATUS,
  ENTITY_STATUS_VALUES,
  type EntityStatus,
} from "@/lib/constants/statuses";

export interface IEmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface IBankDetails {
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  accountHolderName: string;
}

export interface IEmployee extends Document {
  tenantId: string;
  userId?: mongoose.Types.ObjectId;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth?: Date;
  gender?: "male" | "female" | "other";
  maritalStatus?: "single" | "married" | "divorced" | "widowed";
  nationality?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
  };
  departmentId?: mongoose.Types.ObjectId;
  designation?: string;
  reportingManagerId?: mongoose.Types.ObjectId;
  dateOfJoining: Date;
  dateOfConfirmation?: Date;
  probationEndDate?: Date;
  employmentType: "full-time" | "part-time" | "contract" | "intern";
  workLocation?: string;
  shiftTiming?: string;
  salary: {
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
    };
    netSalary: number;
    currency: string;
  };
  bankDetails?: IBankDetails;
  emergencyContact?: IEmergencyContact;
  documents?: Array<{
    name: string;
    url: string;
    uploadedAt: Date;
  }>;
  leaveBalance: {
    casual: number;
    sick: number;
    earned: number;
    unpaid: number;
  };
  lifecycleStatus:
    | "candidate"
    | "onboarding"
    | "active"
    | "on_notice"
    | "exit_initiated"
    | "clearance"
    | "exited";
  exitDetails?: {
    resignationDate?: Date;
    lastWorkingDate?: Date;
    exitReason?: string;
    exitInterview?: boolean;
    clearanceCompleted?: boolean;
    fullAndFinalSettlement?: boolean;
  };
  status: EntityStatus;
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

const EmployeeSchema = new Schema<IEmployee>(
  {
    tenantId: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    employeeCode: { type: String, required: true, trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ["male", "female", "other"] },
    maritalStatus: {
      type: String,
      enum: ["single", "married", "divorced", "widowed"],
    },
    nationality: { type: String, trim: true },
    address: {
      street: { type: String },
      city: { type: String },
      state: { type: String },
      country: { type: String },
      zipCode: { type: String },
    },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department" },
    designation: { type: String, trim: true },
    reportingManagerId: { type: Schema.Types.ObjectId, ref: "Employee" },
    dateOfJoining: { type: Date, required: true },
    dateOfConfirmation: { type: Date },
    probationEndDate: { type: Date },
    employmentType: {
      type: String,
      enum: ["full-time", "part-time", "contract", "intern"],
      default: "full-time",
    },
    workLocation: { type: String, trim: true },
    shiftTiming: { type: String, trim: true },
    salary: {
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
      },
      netSalary: { type: Number, default: 0 },
      currency: { type: String, default: "INR" },
    },
    bankDetails: {
      bankName: { type: String },
      accountNumber: { type: String },
      ifscCode: { type: String },
      accountHolderName: { type: String },
    },
    emergencyContact: {
      name: { type: String },
      relationship: { type: String },
      phone: { type: String },
    },
    documents: [
      {
        name: { type: String },
        url: { type: String },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    leaveBalance: {
      casual: { type: Number, default: 12 },
      sick: { type: Number, default: 6 },
      earned: { type: Number, default: 15 },
      unpaid: { type: Number, default: 0 },
    },
    lifecycleStatus: {
      type: String,
      enum: [
        "candidate",
        "onboarding",
        "active",
        "on_notice",
        "exit_initiated",
        "clearance",
        "exited",
      ],
      default: "candidate",
    },
    exitDetails: {
      resignationDate: { type: Date },
      lastWorkingDate: { type: Date },
      exitReason: { type: String },
      exitInterview: { type: Boolean, default: false },
      clearanceCompleted: { type: Boolean, default: false },
      fullAndFinalSettlement: { type: Boolean, default: false },
    },
    status: {
      type: String,
      enum: ENTITY_STATUS_VALUES,
      default: ENTITY_STATUS.ACTIVE,
      required: true,
    },
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

EmployeeSchema.index({ tenantId: 1, employeeCode: 1 }, { unique: true });
EmployeeSchema.index({ tenantId: 1, email: 1 });
EmployeeSchema.index({ tenantId: 1, departmentId: 1 });
EmployeeSchema.index({ tenantId: 1, lifecycleStatus: 1 });

const Employee: Model<IEmployee> =
  (mongoose.models.Employee as Model<IEmployee>) ||
  mongoose.model<IEmployee>("Employee", EmployeeSchema);

export default Employee;
