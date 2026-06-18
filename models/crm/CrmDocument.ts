import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICrmDocument extends Document {
  tenantId: string;
  name: string;
  file_url: string;
  file_type?: string;
  version: number;
  parent_document_id?: mongoose.Types.ObjectId;
  linked_record_type?: string;
  linked_record_id: mongoose.Types.ObjectId;
  uploaded_by_id: mongoose.Types.ObjectId;
  is_archived: boolean;
  download_count: number;
}

const CrmDocumentSchema = new Schema<ICrmDocument>({
  tenantId: { type: String, required: true },
  name: { type: String, required: true },
  file_url: { type: String, required: true },
  file_type: { type: String },
  version: { type: Number, default: 1 },
  parent_document_id: { type: Schema.Types.ObjectId, ref: 'CrmDocument' },
  linked_record_type: { type: String, enum: ['Lead','Account','Contact','Opportunity','Case','Contract','Quote'] },
  linked_record_id: { type: Schema.Types.ObjectId, required: true },
  uploaded_by_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  is_archived: { type: Boolean, default: false },
  download_count: { type: Number, default: 0 }
}, { timestamps: true });

CrmDocumentSchema.index({ tenantId: 1 });

export default (mongoose.models.CrmDocument as Model<ICrmDocument>) || mongoose.model<ICrmDocument>("CrmDocument", CrmDocumentSchema);
