import mongoose, { Document, Model, Schema } from "mongoose";

export interface IMigrationUploadChunk extends Document {
  tenantId: string;
  uploadId: string;
  fileIndex: number;
  fileName: string;
  chunkIndex: number;
  totalChunks: number;
  data: string;
  byteLength: number;
  createdBy: mongoose.Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MigrationUploadChunkSchema = new Schema<IMigrationUploadChunk>(
  {
    tenantId: { type: String, required: true, index: true },
    uploadId: { type: String, required: true, index: true },
    fileIndex: { type: Number, required: true },
    fileName: { type: String, required: true },
    chunkIndex: { type: Number, required: true },
    totalChunks: { type: Number, required: true },
    data: { type: String, required: true },
    byteLength: { type: Number, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

MigrationUploadChunkSchema.index(
  { tenantId: 1, uploadId: 1, fileIndex: 1, chunkIndex: 1 },
  { unique: true },
);
MigrationUploadChunkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const MigrationUploadChunk: Model<IMigrationUploadChunk> =
  (mongoose.models.MigrationUploadChunk as Model<IMigrationUploadChunk>) ||
  mongoose.model<IMigrationUploadChunk>("MigrationUploadChunk", MigrationUploadChunkSchema);

export default MigrationUploadChunk;
