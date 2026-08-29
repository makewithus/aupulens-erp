import mongoose, { Schema, Document } from "mongoose";

export interface IDocumentSettings extends Document {
  tenantId: string;
  defaultPrefixes: {
    invoice: string;
    purchase: string;
    salesReturn: string;
    purchaseReturn: string;
    purchaseOrder: string;
    deliveryChallan: string;
    salesOrder: string;
  };
  defaultNotes: {
    invoice: string;
    purchase: string;
    salesReturn: string;
    purchaseReturn: string;
    purchaseOrder: string;
    deliveryChallan: string;
    salesOrder: string;
  };
  defaultTerms: {
    invoice: string;
    purchase: string;
    salesReturn: string;
    purchaseReturn: string;
    purchaseOrder: string;
    deliveryChallan: string;
    salesOrder: string;
  };
  defaultTemplates: {
    invoice: string | null;
    purchase: string | null;
    quotation: string | null;
  };
  display: {
    showImages: boolean;
    showNetBalance: boolean;
    showDueDate: boolean;
    showDispatchAddress: boolean;
    showPayments: boolean;
    showRoundOff: boolean;
    showReceiverSignature: boolean;
    hideQuantity: boolean;
    showQuantity3Decimals: boolean;
    showQuantityConversionRate: boolean;
    hideDiscount: boolean;
    showDiscountColumn: boolean;
    priceDecimals: number;
    hideHsn: boolean;
    showCompanyDetails: boolean;
    showHsnSummary: boolean;
    showHsnSummaryOn: string[]; // SalesDocumentType[] multi-select
  };
  layout: {
    language: string;
    fontStyle: string;
    pdfFontSize: string;
    pdfOrientation: string;
    repeatHeader: boolean;
    enableItemHeaders: boolean;
    showFullPage: boolean;
    showStripedRows: boolean;
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
  };
  export: {
    showConversionFactor: boolean;
    showInInr: boolean;
  };
  branding: {
    accentColor: string;
    watermarkUrl: string;
    pdfFooterText: string;
    thermalFooterText: string;
    headerImageUrl: string;
    footerImageUrl: string;
    bannerTopUrl: string;
    bannerBottomUrl: string;
  };
  signatures: { name: string; imageUrl: string }[];
  customLabels: Record<string, string>;
  emailTemplate: { subject: string; body: string };
  whatsappTemplate: { message: string };
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSettingsSchema = new Schema<IDocumentSettings>(
  {
    tenantId: { type: String, required: true, unique: true },
    defaultPrefixes: {
      invoice: { type: String, default: "INV-" },
      purchase: { type: String, default: "PUR-" },
      salesReturn: { type: String, default: "SR-" },
      purchaseReturn: { type: String, default: "PR-" },
      purchaseOrder: { type: String, default: "PO-" },
      deliveryChallan: { type: String, default: "DC-" },
      salesOrder: { type: String, default: "SO-" },
    },
    defaultNotes: {
      invoice: { type: String, default: "" },
      purchase: { type: String, default: "" },
      salesReturn: { type: String, default: "" },
      purchaseReturn: { type: String, default: "" },
      purchaseOrder: { type: String, default: "" },
      deliveryChallan: { type: String, default: "" },
      salesOrder: { type: String, default: "" },
    },
    defaultTerms: {
      invoice: { type: String, default: "" },
      purchase: { type: String, default: "" },
      salesReturn: { type: String, default: "" },
      purchaseReturn: { type: String, default: "" },
      purchaseOrder: { type: String, default: "" },
      deliveryChallan: { type: String, default: "" },
      salesOrder: { type: String, default: "" },
    },
    defaultTemplates: {
      invoice: { type: Schema.Types.ObjectId, ref: "InvoiceTemplate", default: null },
      purchase: { type: Schema.Types.ObjectId, ref: "InvoiceTemplate", default: null },
      quotation: { type: Schema.Types.ObjectId, ref: "InvoiceTemplate", default: null },
    },
    display: {
      showImages: { type: Boolean, default: false },
      showNetBalance: { type: Boolean, default: true },
      showDueDate: { type: Boolean, default: true },
      showDispatchAddress: { type: Boolean, default: false },
      showPayments: { type: Boolean, default: true },
      showRoundOff: { type: Boolean, default: true },
      showReceiverSignature: { type: Boolean, default: true },
      hideQuantity: { type: Boolean, default: false },
      showQuantity3Decimals: { type: Boolean, default: false },
      showQuantityConversionRate: { type: Boolean, default: false },
      hideDiscount: { type: Boolean, default: false },
      showDiscountColumn: { type: Boolean, default: true },
      priceDecimals: { type: Number, default: 2 },
      hideHsn: { type: Boolean, default: false },
      showCompanyDetails: { type: Boolean, default: true },
      showHsnSummary: { type: Boolean, default: false },
      showHsnSummaryOn: { type: [String], default: ["invoice"] },
    },
    layout: {
      language: { type: String, default: "English" },
      fontStyle: { type: String, default: "Stylish" },
      pdfFontSize: { type: String, default: "Normal" },
      pdfOrientation: { type: String, default: "Portrait" },
      repeatHeader: { type: Boolean, default: true },
      enableItemHeaders: { type: Boolean, default: true },
      showFullPage: { type: Boolean, default: true },
      showStripedRows: { type: Boolean, default: false },
      marginTop: { type: Number, default: 50 },
      marginBottom: { type: Number, default: 50 },
      marginLeft: { type: Number, default: 24 },
      marginRight: { type: Number, default: 24 },
    },
    export: {
      showConversionFactor: { type: Boolean, default: false },
      showInInr: { type: Boolean, default: false },
    },
    branding: {
      accentColor: { type: String, default: "#276EF1" },
      watermarkUrl: { type: String, default: "" },
      pdfFooterText: { type: String, default: "" },
      thermalFooterText: { type: String, default: "" },
      headerImageUrl: { type: String, default: "" },
      footerImageUrl: { type: String, default: "" },
      bannerTopUrl: { type: String, default: "" },
      bannerBottomUrl: { type: String, default: "" },
    },
    signatures: [
      {
        name: { type: String, required: true },
        imageUrl: { type: String, required: true },
      },
    ],
    customLabels: { type: Schema.Types.Mixed, default: {} },
    emailTemplate: {
      subject: { type: String, default: "Invoice {{number}} from {{company}}" },
      body: { type: String, default: "Please find attached invoice {{number}} for {{amount}}." },
    },
    whatsappTemplate: {
      message: { type: String, default: "Hi {{customer}}, here is your invoice {{number}} for {{amount}}. Thank you for your business!" },
    },
  },
  { timestamps: true }
);

export const DocumentSettings =
  mongoose.models.DocumentSettings || mongoose.model<IDocumentSettings>("DocumentSettings", DocumentSettingsSchema);
