import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAttendance extends Document {
  tenantId: string;
  employeeId: mongoose.Types.ObjectId;
  date: Date;
  checkIn?: Date;
  checkOut?: Date;
  hoursWorked: number;
  overtime: number;
  status: "present" | "absent" | "half-day" | "on-leave" | "holiday" | "week-off";
  leaveType?: "casual" | "sick" | "earned" | "unpaid";
  notes?: string;
  isLocked: boolean;
  lockedBy?: mongoose.Types.ObjectId;
  lockedAt?: Date;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceSchema = new Schema<IAttendance>(
  {
    tenantId: { type: String, required: true, index: true },
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    date: { type: Date, required: true },
    checkIn: { type: Date },
    checkOut: { type: Date },
    hoursWorked: { type: Number, default: 0 },
    overtime: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["present", "absent", "half-day", "on-leave", "holiday", "week-off"],
      required: true,
      default: "present",
    },
    leaveType: {
      type: String,
      enum: ["casual", "sick", "earned", "unpaid"],
    },
    notes: { type: String },
    isLocked: { type: Boolean, default: false },
    lockedBy: { type: Schema.Types.ObjectId, ref: "User" },
    lockedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

AttendanceSchema.index(
  { tenantId: 1, employeeId: 1, date: 1 },
  { unique: true },
);
AttendanceSchema.index({ tenantId: 1, date: 1 });
AttendanceSchema.index({ tenantId: 1, isLocked: 1 });

const Attendance: Model<IAttendance> =
  (mongoose.models.Attendance as Model<IAttendance>) ||
  mongoose.model<IAttendance>("Attendance", AttendanceSchema);

export default Attendance;
