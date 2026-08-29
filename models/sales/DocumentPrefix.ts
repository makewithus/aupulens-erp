import mongoose, { Schema, Document, Model } from "mongoose";
import {
  SALES_DOCUMENT_TYPE_VALUES,
  DOCUMENT_PREFIX_KIND_VALUES,
  DOCUMENT_PREFIX_KIND,
  type SalesDocumentType,
  type DocumentPrefixKind,
} from "@/lib/constants/statuses";

// Multiple prefixes/suffixes per document type, exactly one marked default
// per (tenantId, documentType, kind). The Invoice default drives numbering
// and the Create-Invoice prefix dropdown.
export interface IDocumentPrefix extends Document {
  tenantId: string;
  documentType: SalesDocumentType;
  kind: DocumentPrefixKind;
  value: string;
  isDefault: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentPrefixSchema = new Schema<IDocumentPrefix>(
  {
    tenantId: { type: String, required: true },
    documentType: { type: String, enum: SALES_DOCUMENT_TYPE_VALUES, required: true },
    kind: { type: String, enum: DOCUMENT_PREFIX_KIND_VALUES, default: DOCUMENT_PREFIX_KIND.PREFIX },
    value: { type: String, required: true, trim: true },
    isDefault: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

DocumentPrefixSchema.index({ tenantId: 1, documentType: 1, kind: 1, value: 1 }, { unique: true });
DocumentPrefixSchema.index({ tenantId: 1, documentType: 1, kind: 1 });

const DocumentPrefix: Model<IDocumentPrefix> =
  (mongoose.models.DocumentPrefix as Model<IDocumentPrefix>) ||
  mongoose.model<IDocumentPrefix>("DocumentPrefix", DocumentPrefixSchema);

export default DocumentPrefix;
