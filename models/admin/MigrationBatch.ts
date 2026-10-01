import mongoose, { Model, Schema, Document } from "mongoose";

export interface IMigrationBatch extends Document {
  tenantId: string;
  sourceSystem: string;
  status: string; // 'uploading', 'analyzing', 'mapping', 'review', 'ready', 'running', 'completed', 'failed'
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  totalFiles: number;
  totalRecords: number;
  totalModules: number;
  progress: number;
  workerLock?: string;
  workerHeartbeat?: Date;
  summary: {
    customers?: number;
    vendors?: number;
    products?: number;
    salesInvoices?: number;
    purchases?: number;
    payments?: number;
    expenses?: number;
    accounts?: number;
    employees?: number;
    valid?: number;
    invalid?: number;
    duplicate?: number;
    migrated?: number;
    failed?: number;
  };
  errors?: any;
  warnings?: { message: string; code?: string }[];
}

const MigrationBatchSchema = new Schema<IMigrationBatch>(
  {
    tenantId: { type: String, required: true, index: true },
    sourceSystem: { type: String, required: true },
    status: { type: String, default: "uploading" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    totalFiles: { type: Number, default: 0 },
    totalRecords: { type: Number, default: 0 },
    totalModules: { type: Number, default: 0 },
    progress: { type: Number, default: 0 },
    workerLock: { type: String, default: null },
    workerHeartbeat: { type: Date, default: null },
    summary: { type: Schema.Types.Mixed, default: {} },
    // @ts-ignore
    errors: { type: Schema.Types.Mixed, default: [] },
    warnings: { type: Schema.Types.Mixed, default: [] },
  },
  { timestamps: true, suppressReservedKeysWarning: true }
);

MigrationBatchSchema.index({ tenantId: 1, createdAt: -1 });

const MigrationBatch: Model<IMigrationBatch> =
  (mongoose.models.MigrationBatch as Model<IMigrationBatch>) ||
  mongoose.model<IMigrationBatch>("MigrationBatch", MigrationBatchSchema);

export default MigrationBatch;
