import mongoose, { Schema, Document } from "mongoose";

export interface IInvoiceTemplate extends Document {
  tenantId?: string; // If null/undefined, it's a globally available template
  key: string;
  name: string;
  category: "invoice" | "purchase" | "quotation";
  isDefault: boolean; // Indicates if it's the global default for that category
  previewData?: any;
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceTemplateSchema = new Schema<IInvoiceTemplate>(
  {
    tenantId: { type: String, required: false },
    key: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, enum: ["invoice", "purchase", "quotation"], required: true },
    isDefault: { type: Boolean, default: false },
    previewData: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Compound index to ensure keys are unique per tenant (or globally if tenantId is missing)
InvoiceTemplateSchema.index({ tenantId: 1, key: 1 }, { unique: true });

export const InvoiceTemplate =
  mongoose.models.InvoiceTemplate || mongoose.model<IInvoiceTemplate>("InvoiceTemplate", InvoiceTemplateSchema);
