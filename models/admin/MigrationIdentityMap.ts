import mongoose, { Model, Schema, Document } from "mongoose";

export interface IMigrationIdentityMap extends Document {
  tenantId: string;
  batchId: mongoose.Types.ObjectId;
  entityType: string;
  sourceId: string;           // E.g., 'TALLY-CUST-1002' or the source record's unique name
  targetId: mongoose.Types.ObjectId; // The created Aupulens _id
  createdAt: Date;
  updatedAt: Date;
}

const MigrationIdentityMapSchema = new Schema<IMigrationIdentityMap>(
  {
    tenantId: { type: String, required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: "MigrationBatch", required: true, index: true },
    entityType: { type: String, required: true },
    sourceId: { type: String, required: true, index: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true }
);

MigrationIdentityMapSchema.index({ tenantId: 1, batchId: 1, entityType: 1, sourceId: 1 }, { unique: true });

const MigrationIdentityMap: Model<IMigrationIdentityMap> =
  mongoose.models.MigrationIdentityMap ||
  mongoose.model<IMigrationIdentityMap>("MigrationIdentityMap", MigrationIdentityMapSchema);

export default MigrationIdentityMap;
