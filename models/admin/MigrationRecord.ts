import mongoose, { Model, Schema, Document } from "mongoose";

export interface IMigrationRecord extends Document {
  tenantId: string;
  batchId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  entityType: string;
  sourceData: Record<string, unknown>;
  mappedData?: Record<string, unknown>;
  status: "pending" | "valid" | "invalid" | "duplicate" | "migrated" | "failed";
  errors: any;
  warnings: { field?: string; message: string }[];
  targetRecordId?: mongoose.Types.ObjectId;
  duplicateAction?: "skip" | "update" | "create";
  duplicateTargetId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MigrationRecordSchema = new Schema<IMigrationRecord>(
  {
    tenantId: { type: String, required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: "MigrationBatch", required: true, index: true },
    jobId: { type: Schema.Types.ObjectId, ref: "MigrationJob", required: true, index: true },
    entityType: { type: String, required: true },
    sourceData: { type: Schema.Types.Mixed, default: {} },
    mappedData: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: ["pending", "valid", "invalid", "duplicate", "migrated", "failed"],
      default: "pending",
      index: true
    },
    // @ts-ignore
    errors: { type: Schema.Types.Mixed, default: [] },
    warnings: { type: Schema.Types.Mixed, default: [] },
    targetRecordId: { type: Schema.Types.ObjectId },
    duplicateAction: { type: String, enum: ["skip", "update", "create"] },
    duplicateTargetId: { type: Schema.Types.ObjectId },
  },
  { timestamps: true, suppressReservedKeysWarning: true }
);

MigrationRecordSchema.index({ tenantId: 1, batchId: 1, status: 1 });
MigrationRecordSchema.index({ tenantId: 1, jobId: 1, status: 1 });

const MigrationRecord: Model<IMigrationRecord> =
  (mongoose.models.MigrationRecord as Model<IMigrationRecord>) ||
  mongoose.model<IMigrationRecord>("MigrationRecord", MigrationRecordSchema);

export default MigrationRecord;
