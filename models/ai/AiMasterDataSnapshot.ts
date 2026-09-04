import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * AI-19's change-history mechanism (docs/ai/BRIEF-08a-BATCH-G.md 0.5) — derived, additive, and it
 * leaves the core models (`Vendor`/`Customer`/`Employee`/`BankAccount`) entirely untouched. One
 * row per `master_data.changed` event: a snapshot of that record's sensitive fields at that
 * moment. Diffing the two most recent rows for a `{tenantId, entityModel, recordId}` is how a "bank
 * detail changed" alert gets derived without a history field ever existing on the core model.
 *
 * **Every field value stored here must already be masked** (`lib/aiRuntime/masterData/
 * masking.ts::maskValue()`) before this document is written — this collection is itself part of
 * "every output, log, attention item and decision trace" the brief's A.1 masking rule covers.
 */

export interface IAiMasterDataSnapshot extends Document {
  tenantId: string;
  entityModel: string;
  recordId: string;
  fields: Record<string, string | null>;
  snapshotAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AiMasterDataSnapshotSchema: Schema<IAiMasterDataSnapshot> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    entityModel: { type: String, required: true },
    recordId: { type: String, required: true },
    fields: { type: Schema.Types.Mixed, default: {} },
    snapshotAt: { type: Date, required: true },
  },
  { timestamps: true },
);

AiMasterDataSnapshotSchema.index({ tenantId: 1, entityModel: 1, recordId: 1, snapshotAt: -1 });

const AiMasterDataSnapshot: Model<IAiMasterDataSnapshot> =
  (mongoose.models.AiMasterDataSnapshot as Model<IAiMasterDataSnapshot>) || mongoose.model<IAiMasterDataSnapshot>("AiMasterDataSnapshot", AiMasterDataSnapshotSchema);

export default AiMasterDataSnapshot;
