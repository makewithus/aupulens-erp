import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Phase 10 Part 0.3: a distributed lock so two concurrent triggers (a
 * `run-due` call landing at the same moment as an opportunistic check on
 * real admin traffic, or two admin requests in the same second) cannot
 * double-run the same job. One document per currently-running job, unique
 * on `jobId` — the second `create()` call for the same job fails on the
 * unique index rather than racing. `expiresAt` is a TTL index as a safety
 * net only: if a process crashes mid-run and never releases its lock, the
 * lock self-clears rather than wedging that job forever — the same
 * "correctness must not depend on cleanup" principle already applied to
 * `getActiveAccessGrant()`'s live expiry check.
 */
export interface ISchedulerJobLock extends Document {
  jobId: string;
  acquiredAt: Date;
  expiresAt: Date;
}

const SchedulerJobLockSchema = new Schema<ISchedulerJobLock>({
  jobId: { type: String, required: true, unique: true },
  acquiredAt: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date, required: true },
});

SchedulerJobLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default (mongoose.models.SchedulerJobLock as Model<ISchedulerJobLock>) ||
  mongoose.model<ISchedulerJobLock>("SchedulerJobLock", SchedulerJobLockSchema);
