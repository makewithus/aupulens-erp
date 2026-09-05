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
 *
 * **`fieldHashes`** (Chunk 9 verification bug fix): a one-way SHA-256 hash of each field's raw
 * value, stored alongside the masked display string. `maskValue()` keeps only the last four
 * characters, so two DIFFERENT raw values of the same length sharing the same last four
 * characters (e.g. two different 12-digit bank account numbers both ending "3333") produce the
 * IDENTICAL masked string — diffing on the masked string alone silently misses that real change,
 * exactly the bank-fraud signal this workflow exists to catch. Diffing is now done on the hash
 * (never the plaintext — a hash is not an unmasked value, so this does not violate the masking
 * rule above); `fields` is retained purely for display. Snapshots written before this fix have no
 * `fieldHashes`, so the diff falls back to the old masked-string comparison for those rows only.
 */

export interface IAiMasterDataSnapshot extends Document {
  tenantId: string;
  entityModel: string;
  recordId: string;
  fields: Record<string, string | null>;
  fieldHashes?: Record<string, string>;
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
    fieldHashes: { type: Schema.Types.Mixed, default: undefined },
    snapshotAt: { type: Date, required: true },
  },
  { timestamps: true },
);

AiMasterDataSnapshotSchema.index({ tenantId: 1, entityModel: 1, recordId: 1, snapshotAt: -1 });

const AiMasterDataSnapshot: Model<IAiMasterDataSnapshot> =
  (mongoose.models.AiMasterDataSnapshot as Model<IAiMasterDataSnapshot>) || mongoose.model<IAiMasterDataSnapshot>("AiMasterDataSnapshot", AiMasterDataSnapshotSchema);

export default AiMasterDataSnapshot;
