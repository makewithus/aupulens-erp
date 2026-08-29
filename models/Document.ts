import mongoose, { Schema, Document, Model } from "mongoose";

export interface IDocumentModel extends Document {
  tenantId: string;
  name: string;
  file_url: string;
  file_type: string;
  size: number;
  version: number;
  parent_document_id: mongoose.Types.ObjectId;
  linked_record_type: string;
  linked_record_id: mongoose.Types.ObjectId;
  uploaded_by_id: mongoose.Types.ObjectId;
  is_archived: boolean;
  download_count: number;
}

const DocumentSchema = new Schema<IDocumentModel>({
  tenantId: { type: String, required: true },
  name: { type: String },
  file_url: { type: String },
  file_type: { type: String },
  size: { type: Number, default: 0 },
  version: { type: Number, default: 1 },
  parent_document_id: { type: Schema.Types.ObjectId, ref: "DocumentModel" },
  linked_record_type: { type: String },
  linked_record_id: { type: Schema.Types.ObjectId },
  uploaded_by_id: { type: Schema.Types.ObjectId, ref: "User" },
  is_archived: { type: Boolean, default: false },
  download_count: { type: Number, default: 0 },
}, { timestamps: true });

DocumentSchema.index({ tenantId: 1, linked_record_type: 1, is_archived: 1, createdAt: -1 });

export default (mongoose.models.DocumentModel as Model<IDocumentModel>) || mongoose.model<IDocumentModel>("DocumentModel", DocumentSchema);
