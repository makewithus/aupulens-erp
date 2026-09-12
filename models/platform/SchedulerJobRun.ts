import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Phase 10 Part 0.3: one document per registered job in
 * lib/platform/scheduler/registry.ts, tracking when it last ran and how.
 * This is the entire "did anything run" visibility the missing Vercel Cron
 * schedules left with none — see docs/admin/CRON_INCIDENT.md.
 */
export interface ISchedulerJobRun extends Document {
  jobId: string;
  lastRunAt?: Date;
  lastRunStatus?: "success" | "error";
  lastRunDurationMs?: number;
  lastRunResult?: Record<string, unknown>;
  lastError?: string;
  lastRunTrigger?: "run-due" | "opportunistic" | "manual";
  lastRunActorId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SchedulerJobRunSchema = new Schema<ISchedulerJobRun>(
  {
    jobId: { type: String, required: true, unique: true },
    lastRunAt: { type: Date },
    lastRunStatus: { type: String, enum: ["success", "error"] },
    lastRunDurationMs: { type: Number },
    lastRunResult: { type: Schema.Types.Mixed },
    lastError: { type: String },
    lastRunTrigger: { type: String, enum: ["run-due", "opportunistic", "manual"] },
    lastRunActorId: { type: String },
  },
  { timestamps: true },
);

export default (mongoose.models.SchedulerJobRun as Model<ISchedulerJobRun>) ||
  mongoose.model<ISchedulerJobRun>("SchedulerJobRun", SchedulerJobRunSchema);
