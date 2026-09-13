import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Phase 12 Part 0.2 — Storage Used, re-triaged from DECLARED_NOT_POSSIBLE to
 * buildable. `lib/upload.ts::uploadToCloudinary()` already knows each file's
 * exact byte size at upload time (it enforces a size limit with it) and
 * previously threw that value away. This is the one row per tenant that
 * value now accumulates into — a running counter, not a per-upload log,
 * since nothing in this project's Usage tab or dashboard KPI needs
 * per-upload history, only a current total.
 *
 * Counts from the point this instrumentation began — no backfill of uploads
 * that happened before this model existed (there is nothing to backfill
 * from; the byte size was never persisted).
 */
export interface IStorageUsage extends Document {
  tenantId: string;
  totalBytes: number;
  fileCount: number;
  lastUploadAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const StorageUsageSchema = new Schema<IStorageUsage>(
  {
    tenantId: { type: String, required: true, unique: true },
    totalBytes: { type: Number, required: true, default: 0 },
    fileCount: { type: Number, required: true, default: 0 },
    lastUploadAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

export default (mongoose.models.StorageUsage as Model<IStorageUsage>) ||
  mongoose.model<IStorageUsage>("StorageUsage", StorageUsageSchema);
