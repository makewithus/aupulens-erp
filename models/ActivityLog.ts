import mongoose, { Schema, Document } from 'mongoose';

export interface IActivityLog extends Document {
  tenantId: string;
  userId: mongoose.Types.ObjectId;
  userName: string;
  userEmail: string;
  userRole: string;
  activity: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

const ActivityLogSchema: Schema<IActivityLog> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    userEmail: { type: String, required: true },
    userRole: { type: String, required: true },
    activity: { type: String, required: true },
    details: { type: String },
    ipAddress: { type: String },
    userAgent: { type: String },
    timestamp: { type: Date, default: Date.now, required: true },
  },
  { timestamps: true }
);

// Index for faster queries
ActivityLogSchema.index({ timestamp: -1 });
ActivityLogSchema.index({ userId: 1 });
ActivityLogSchema.index({ userRole: 1 });

const ActivityLog =
  (mongoose.models?.ActivityLog as mongoose.Model<IActivityLog>) ||
  mongoose.model<IActivityLog>('ActivityLog', ActivityLogSchema);

export default ActivityLog;
