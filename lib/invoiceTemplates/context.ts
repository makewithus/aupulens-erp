import QRCode from "qrcode";
import { computeInvoiceTotals, computeHsnSummary, numberToWords, type InvoiceLineInput } from "@/lib/sales/invoiceMath";
import { buildUpiUri, cleanText } from "./helpers";
import type { TemplateRenderContext, TemplateSettings } from "./types";

const DEFAULT_SETTINGS: TemplateSettings = {
  showImages: false,
  showNetBalance: true,
  showDueDate: true,
  showDispatchAddress: false,
  showPayments: true,
  showRoundOff: true,
  showReceiverSignature: true,
  hideQuantity: false,
  showQuantity3Decimals: false,
  showQuantityConversionRate: false,
  hideDiscount: false,
  showDiscountColumn: true,
  priceDecimals: 2,
  hideHsn: false,
  showCompanyDetails: true,
  showHsnSummary: false,
  showHsnSummaryOn: ["invoice"],
  fontStyle: "Stylish",
  pdfFontSize: "Normal",
  pdfOrientation: "Portrait",
  repeatHeader: true,
  enableItemHeaders: true,
  showFullPage: true,
  showStripedRows: false,
  marginTop: 50,
  marginBottom: 50,
  marginLeft: 24,
  marginRight: 24,
  accentColor: "#276EF1",
};

export function mapSettings(raw: any): TemplateSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(raw?.display || {}),
    ...(raw?.layout || {}),
    ...(raw?.export || {}),
    accentColor: raw?.branding?.accentColor || DEFAULT_SETTINGS.accentColor,
    watermarkUrl: raw?.branding?.watermarkUrl,
    pdfFooterText: raw?.branding?.pdfFooterText,
    headerImageUrl: raw?.branding?.headerImageUrl,
    footerImageUrl: raw?.branding?.footerImageUrl,
    bannerTopUrl: raw?.branding?.bannerTopUrl,
    bannerBottomUrl: raw?.branding?.bannerBottomUrl,
  };
}

export interface BuildContextInput {
  invoice: any; // lean SalesInvoice document (customerId populated)
  settingsDoc: any; // lean DocumentSettings document
  company: { name: string; gstin?: string; logo?: string; address?: string; state?: string };
  bank?: { accountName: string; accountNumber?: string; bankName?: string; ifsc?: string; upiId?: string } | null;
  signatureUrl?: string | null;
  documentType?: "invoice" | "purchase" | "quotation";
}

export async function buildTemplateContext(input: BuildContextInput): Promise<TemplateRenderContext> {
  const { invoice, settingsDoc, company, bank, signatureUrl, documentType = "invoice" } = input;
  const settings = mapSettings(settingsDoc);

  const lineItems: InvoiceLineInput[] = (invoice.lineItems || []).map((li: any) => ({
    qty: li.qty,
    unitPrice: li.unitPrice,
    discount: li.discount,
    discountMode: li.discountMode,
    taxRate: li.taxRate,
    hsn: cleanText(li.hsn),
    name: cleanText(li.name) || "Item",
  }));

  const totals = computeInvoiceTotals({
    lineItems,
    itemLevelDiscountPercent: invoice.itemLevelDiscountPercent || 0,
    additionalCharges: invoice.additionalCharges || [],
    extraDiscount: invoice.extraDiscount || 0,
    extraDiscountMode: "amount",
    roundOff: !!invoice.roundOff,
    sellerState: company.state,
    placeOfSupply: invoice.placeOfSupply,
    tdsRate: invoice.taxes?.tds || 0,
    tcsRate: invoice.taxes?.tcs || 0,
  });

  const hsnSummary = computeHsnSummary(totals.computedLines, totals.isInterState);
  const amountInWords = numberToWords(totals.totalAmount);

  const customerDoc = invoice.customerId || {};
  const customer = {
    name: cleanText(customerDoc?.header?.name) || "Customer",
    gstin: cleanText(customerDoc?.gstin) || undefined,
    email: cleanText(customerDoc?.contact_details?.email) || undefined,
    phone: cleanText(customerDoc?.contact_details?.phone || customerDoc?.contact_details?.mobile) || undefined,
    billingAddress: [customerDoc?.address_tab?.street, customerDoc?.address_tab?.city, customerDoc?.address_tab?.state_name, customerDoc?.address_tab?.zip]
      .map(cleanText)
      .filter(Boolean)
      .join(", "),
    shippingAddress: customerDoc?.shipping_address
      ? [customerDoc.shipping_address.street, customerDoc.shipping_address.city, customerDoc.shipping_address.state_name, customerDoc.shipping_address.zip]
          .map(cleanText)
          .filter(Boolean)
          .join(", ")
      : undefined,
  };

  let upiQrDataUrl: string | null = null;
  const upiUri = bank?.upiId ? buildUpiUri(company.name, bank.upiId, totals.totalAmount, `Invoice ${invoice.number}`) : null;
  if (upiUri) {
    try {
      upiQrDataUrl = await QRCode.toDataURL(upiUri, { margin: 1, width: 200 });
    } catch {
      upiQrDataUrl = null;
    }
  }

  return {
    documentType,
    invoice: {
      number: cleanText(invoice.number),
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      reference: cleanText(invoice.reference) || undefined,
      type: cleanText(invoice.type) || "Regular",
      placeOfSupply: cleanText(invoice.placeOfSupply) || undefined,
      eWaybill: invoice.eWaybill,
      eInvoice: invoice.eInvoice,
      notes: cleanText(invoice.notes) || undefined,
      terms: cleanText(invoice.terms) || undefined,
      status: invoice.status,
      markedFullyPaid: invoice.markedFullyPaid,
      payments: invoice.payments || [],
    },
    computedLines: totals.computedLines,
    totals,
    hsnSummary,
    amountInWords,
    customer,
    company: {
      name: cleanText(company.name) || "Your Company",
      gstin: cleanText(company.gstin) || undefined,
      logo: settings.showImages ? company.logo : undefined,
      address: cleanText(company.address) || undefined,
      state: cleanText(company.state) || undefined,
    },
    bank: bank
      ? {
          accountName: cleanText(bank.accountName),
          accountNumber: cleanText(bank.accountNumber) || undefined,
          bankName: cleanText(bank.bankName) || undefined,
          ifsc: cleanText(bank.ifsc) || undefined,
        }
      : null,
    signatureUrl: settings.showReceiverSignature ? signatureUrl : null,
    upiQrDataUrl,
    settings,
  };
}
