import mongoose, { Schema, Document, Model } from "mongoose";

export type LeaveStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export interface ILeaveRequest extends Document {
  tenantId: string;
  employeeId: mongoose.Types.ObjectId;
  leaveType: "casual" | "sick" | "earned" | "unpaid";
  startDate: Date;
  endDate: Date;
  totalDays: number;
  reason: string;
  status: LeaveStatus;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectedBy?: mongoose.Types.ObjectId;
  rejectedAt?: Date;
  rejectionReason?: string;
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

const LeaveRequestSchema = new Schema<ILeaveRequest>(
  {
    tenantId: { type: String, required: true, index: true },
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    leaveType: {
      type: String,
      enum: ["casual", "sick", "earned", "unpaid"],
      required: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    totalDays: { type: Number, required: true, min: 0.5 },
    reason: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
    },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    rejectedBy: { type: Schema.Types.ObjectId, ref: "User" },
    rejectedAt: { type: Date },
    rejectionReason: { type: String },
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

LeaveRequestSchema.index({ tenantId: 1, employeeId: 1 });
LeaveRequestSchema.index({ tenantId: 1, status: 1 });
LeaveRequestSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
LeaveRequestSchema.index({ tenantId: 1, startDate: 1, endDate: 1 });

const LeaveRequest: Model<ILeaveRequest> =
  (mongoose.models.LeaveRequest as Model<ILeaveRequest>) ||
  mongoose.model<ILeaveRequest>("LeaveRequest", LeaveRequestSchema);

export default LeaveRequest;
