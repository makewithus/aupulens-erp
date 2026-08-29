import mongoose, { Model, Schema } from "mongoose";
import {
  DOC_INTEL_STATUS,
  DOC_INTEL_TYPE_VALUES,
  type DocIntelStatus,
  type DocIntelType,
} from "@/lib/docIntel/extractionSchemas";

/**
 * One document processed by Document Intelligence: the upload metadata, the
 * structured extraction (editable by the reviewer), review status, and — once
 * confirmed — a pointer to the record that was created from it.
 *
 * The original file bytes are NOT stored here; only the extracted structure is.
 * (Attaching the source file to the created record is the documented next
 * increment; storing large binaries on this doc would blow the 16MB ceiling.)
 */

export interface IExtractedDocument extends mongoose.Document {
  tenantId: string;
  docType: DocIntelType;
  fileName: string;
  status: DocIntelStatus;
  /** The coerced extraction, mutated in place when the reviewer edits fields. */
  extraction: Record<string, unknown>;
  aiConfidence: number;
  createdRecordModel?: string; // e.g. "Invoice"
  createdRecordId?: mongoose.Types.ObjectId;
  rejectedReason?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ExtractedDocumentSchema = new Schema<IExtractedDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    docType: { type: String, enum: DOC_INTEL_TYPE_VALUES, required: true },
    fileName: { type: String, default: "" },
    status: {
      type: String,
      enum: Object.values(DOC_INTEL_STATUS),
      default: DOC_INTEL_STATUS.EXTRACTED,
    },
    extraction: { type: Schema.Types.Mixed, default: {} },
    aiConfidence: { type: Number, default: 0 },
    createdRecordModel: { type: String },
    createdRecordId: { type: Schema.Types.ObjectId },
    rejectedReason: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

ExtractedDocumentSchema.index({ tenantId: 1, createdAt: -1 });

const ExtractedDocument: Model<IExtractedDocument> =
  (mongoose.models.ExtractedDocument as Model<IExtractedDocument>) ||
  mongoose.model<IExtractedDocument>("ExtractedDocument", ExtractedDocumentSchema);

export default ExtractedDocument;
