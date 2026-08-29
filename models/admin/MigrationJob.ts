import mongoose, { Model, Schema } from "mongoose";
import {
  MIGRATION_JOB_STATUS,
  MIGRATION_JOB_STATUS_VALUES,
  MIGRATION_SOURCE_SYSTEM_VALUES,
  MIGRATION_ENTITY_VALUES,
  type MigrationJobStatus,
  type MigrationSourceSystem,
  type MigrationEntity,
} from "@/lib/migration/constants";

/** One record written during an import — retained so a job can be rolled back. */
export interface IMigrationImportedRef {
  model: string; // e.g. "Customer"
  id: mongoose.Types.ObjectId;
}

export interface IMigrationValidationIssue {
  rowIndex: number; // 0-based index into rows[]
  field?: string;
  severity: "error" | "warning";
  message: string;
}

export interface IMigrationJob extends mongoose.Document {
  tenantId: string;
  name: string;
  sourceSystem: MigrationSourceSystem;
  entityType: MigrationEntity;
  status: MigrationJobStatus;
  fileName: string;
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  /** targetFieldKey -> sourceColumnName. Unmapped fields are simply absent. */
  mapping: Record<string, string>;
  validation?: {
    ranAt: Date;
    errorCount: number;
    warningCount: number;
    duplicateCount: number;
    issues: IMigrationValidationIssue[];
  };
  preview?: {
    ranAt: Date;
    willCreate: number;
    willSkip: number;
    sample: Record<string, unknown>[];
  };
  result?: {
    ranAt: Date;
    created: number;
    failed: number;
    errors: { rowIndex: number; message: string }[];
  };
  importedRefs: IMigrationImportedRef[];
  aiMappingUsed: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MigrationJobSchema = new Schema<IMigrationJob>(
  {
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    sourceSystem: { type: String, enum: MIGRATION_SOURCE_SYSTEM_VALUES, required: true },
    entityType: { type: String, enum: MIGRATION_ENTITY_VALUES, required: true },
    status: {
      type: String,
      enum: MIGRATION_JOB_STATUS_VALUES,
      default: MIGRATION_JOB_STATUS.CREATED,
    },
    fileName: { type: String, default: "" },
    columns: { type: [String], default: [] },
    // Parsed source rows live on the job so validate/preview/execute work across
    // separate requests without re-uploading. Capped at parse time (see
    // MIGRATION_MAX_ROWS) to stay under Mongo's 16MB document ceiling.
    // Cast: mongoose's typing for an array-of-Mixed field with a default doesn't
    // line up with the Record<string,unknown>[] interface field, though it works
    // at runtime. Localized cast keeps the rest of the schema strongly typed.
    rows: { type: [Schema.Types.Mixed], default: [] } as any,
    totalRows: { type: Number, default: 0 },
    mapping: { type: Schema.Types.Mixed, default: {} },
    validation: { type: Schema.Types.Mixed },
    preview: { type: Schema.Types.Mixed },
    result: { type: Schema.Types.Mixed },
    importedRefs: {
      type: [
        {
          model: { type: String, required: true },
          id: { type: Schema.Types.ObjectId, required: true },
        },
      ],
      default: [],
    },
    aiMappingUsed: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

// Tenant-scoped list ordering (Golden Rule #1 — never query without tenantId).
MigrationJobSchema.index({ tenantId: 1, createdAt: -1 });

const MigrationJob: Model<IMigrationJob> =
  (mongoose.models.MigrationJob as Model<IMigrationJob>) ||
  mongoose.model<IMigrationJob>("MigrationJob", MigrationJobSchema);

export default MigrationJob;
