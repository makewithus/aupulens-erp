import mongoose, { Schema, type Model } from "mongoose";
import type { RateLimitResult, RateLimitStore } from "./rateLimit";

const schema = new Schema({
  _id: { type: String },
  count: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RateLimitCounter: Model<any> = mongoose.models.RateLimitCounter || mongoose.model("RateLimitCounter", schema);

/** Atomic fixed-window counters shared by all nodes; window identity does not depend on TTL cleanup. */
export class MongoRateLimitStore implements RateLimitStore {
  constructor(private now: () => number = Date.now) {}
  async increment(key: string, windowMs: number): Promise<RateLimitResult> {
    const now = this.now();
    const resetAt = (Math.floor(now / windowMs) + 1) * windowMs;
    const _id = `${key}:${resetAt}`;
    let row: any;
    try {
      row = await RateLimitCounter.findOneAndUpdate({ _id }, {
        $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(resetAt) },
      }, { upsert: true, new: true });
    } catch (error: any) {
      // Simultaneous first writers may both attempt the unique _id insert.
      if (error?.code !== 11000) throw error;
      row = await RateLimitCounter.findOneAndUpdate({ _id }, { $inc: { count: 1 } }, { new: true });
    }
    if (!row) throw new Error("Rate limit counter unavailable");
    return { allowed: true, count: row.count, remaining: 0, resetAt };
  }
}
