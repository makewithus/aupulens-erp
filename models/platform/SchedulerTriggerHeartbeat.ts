import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Singleton heartbeat for the EXTERNAL scheduler trigger (GitHub Actions → /api/platform/scheduler/run-due).
 * The scheduler can only prove it ran when something calls it; this record lets operators (and an
 * uptime monitor polling /api/platform/scheduler/health) detect that nothing has called it.
 */
export interface ISchedulerTriggerHeartbeat extends Document {
  singleton: boolean;
  lastTriggerAt?: Date;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  lastError?: string;
  consecutiveFailures: number;
  lastGapMs?: number;
}

const SchedulerTriggerHeartbeatSchema = new Schema<ISchedulerTriggerHeartbeat>(
  {
    singleton: { type: Boolean, default: true, unique: true, immutable: true },
    lastTriggerAt: Date,
    lastSuccessAt: Date,
    lastFailureAt: Date,
    lastError: String,
    consecutiveFailures: { type: Number, default: 0 },
    lastGapMs: Number,
  },
  { timestamps: true },
);

export default (mongoose.models.SchedulerTriggerHeartbeat as Model<ISchedulerTriggerHeartbeat>) ||
  mongoose.model<ISchedulerTriggerHeartbeat>("SchedulerTriggerHeartbeat", SchedulerTriggerHeartbeatSchema);
