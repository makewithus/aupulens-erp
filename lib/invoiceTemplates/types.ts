import type { ComputedLine, HsnSummaryRow, InvoiceTotalsResult } from "@/lib/sales/invoiceMath";

export interface TemplateDefinition {
  key: string;
  name: string;
  category: "invoice" | "purchase" | "quotation";
  description: string;
  orientation: "portrait" | "landscape";
  fontFamily: "sans" | "serif" | "mono";
  headerStyle: "minimal" | "bordered-grid" | "centered" | "sidebar" | "gradient-band" | "dual-address";
  borderStyle: "none" | "thin" | "heavy-grid" | "double";
  showMrpColumn: boolean;
  showImages: boolean;
  serviceStyle: boolean; // hides HSN/Qty-heavy goods columns, description-first rows
  density: "normal" | "compact";
  billShipProminent: boolean;
  accentColorDefault: string;
}

export interface TemplateCustomer {
  name: string;
  company?: string;
  gstin?: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  shippingAddress?: string;
}

export interface TemplateCompany {
  name: string;
  gstin?: string;
  logo?: string;
  address?: string;
  state?: string;
}

export interface TemplateBank {
  accountName: string;
  accountNumber?: string;
  bankName?: string;
  ifsc?: string;
}

export interface TemplateSettings {
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
  showHsnSummaryOn: string[];
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
  accentColor: string;
  watermarkUrl?: string;
  pdfFooterText?: string;
  headerImageUrl?: string;
  footerImageUrl?: string;
  bannerTopUrl?: string;
  bannerBottomUrl?: string;
}

export interface TemplateRenderContext {
  documentType: "invoice" | "purchase" | "quotation";
  invoice: {
    number: string;
    invoiceDate: Date | string;
    dueDate: Date | string;
    reference?: string;
    type: string;
    placeOfSupply?: string;
    eWaybill?: boolean;
    eInvoice?: boolean;
    notes?: string;
    terms?: string;
    status: string;
    markedFullyPaid?: boolean;
    payments?: { amount: number; date: Date | string; mode: string; notes?: string }[];
  };
  computedLines: ComputedLine[];
  totals: InvoiceTotalsResult;
  hsnSummary: HsnSummaryRow[];
  amountInWords: string;
  customer: TemplateCustomer;
  company: TemplateCompany;
  bank?: TemplateBank | null;
  signatureUrl?: string | null;
  upiQrDataUrl?: string | null;
  settings: TemplateSettings;
}
