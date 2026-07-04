import mongoose, { Schema, Document, Model } from "mongoose";
import {
  SALES_DOCUMENT_TYPE_VALUES,
  type SalesDocumentType,
} from "@/lib/constants/statuses";

// Reusable, named Notes / Terms entries per document type. Populates the
// Create-Invoice Notes/Terms fields via selection.
export interface IDocumentNote extends Document {
  tenantId: string;
  kind: "notes" | "terms";
  documentType: SalesDocumentType;
  title: string;
  content: string;
  isDefault: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentNoteSchema = new Schema<IDocumentNote>(
  {
    tenantId: { type: String, required: true },
    kind: { type: String, enum: ["notes", "terms"], required: true },
    documentType: { type: String, enum: SALES_DOCUMENT_TYPE_VALUES, required: true },
    title: { type: String, required: true, trim: true },
    content: { type: String, default: "" },
    isDefault: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

DocumentNoteSchema.index({ tenantId: 1, kind: 1, documentType: 1 });

const DocumentNote: Model<IDocumentNote> =
  (mongoose.models.DocumentNote as Model<IDocumentNote>) ||
  mongoose.model<IDocumentNote>("DocumentNote", DocumentNoteSchema);

export default DocumentNote;
