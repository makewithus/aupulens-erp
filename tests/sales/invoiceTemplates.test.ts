import { describe, expect, it } from "vitest";
import { TEMPLATE_DEFINITIONS, getTemplateDefinition } from "@/lib/invoiceTemplates/definitions";
import { renderInvoiceTemplate } from "@/lib/invoiceTemplates/render";
import { computeInvoiceTotals, computeHsnSummary, numberToWords } from "@/lib/sales/invoiceMath";
import type { TemplateRenderContext, TemplateSettings } from "@/lib/invoiceTemplates/types";

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
  showHsnSummary: true,
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

function buildContext(overrides: Partial<TemplateRenderContext> = {}, settingsOverrides: Partial<TemplateSettings> = {}): TemplateRenderContext {
  const lineItems = [
    { qty: 2, unitPrice: 500, discount: 10, discountMode: "percent" as const, taxRate: 18, hsn: "9983", name: "Consulting" },
    { qty: 1, unitPrice: 1000, discount: 0, discountMode: "percent" as const, taxRate: 12, hsn: "8471", name: "Widget" },
  ];
  const totals = computeInvoiceTotals({ lineItems, sellerState: "Maharashtra", placeOfSupply: "Maharashtra", roundOff: true });
  const hsnSummary = computeHsnSummary(totals.computedLines, totals.isInterState);

  return {
    documentType: "invoice",
    invoice: {
      number: "INV-0001",
      invoiceDate: new Date("2026-01-01"),
      dueDate: new Date("2026-01-08"),
      reference: "PO-99",
      type: "Regular",
      placeOfSupply: "Maharashtra",
      eWaybill: true,
      eInvoice: false,
      notes: "Thank you for your business.",
      terms: "Due in 7 days.",
      status: "saved",
      markedFullyPaid: false,
      payments: [{ amount: 100, date: new Date("2026-01-02"), mode: "Cash" }],
    },
    computedLines: totals.computedLines,
    totals,
    hsnSummary,
    amountInWords: numberToWords(totals.totalAmount),
    customer: { name: "Acme Pvt Ltd", gstin: "27AAAAA0000A1Z5", billingAddress: "Pune, Maharashtra" },
    company: { name: "Test Seller Co", gstin: "27BBBBB0000B1Z5", state: "Maharashtra" },
    bank: { accountName: "Current A/C", accountNumber: "12345", bankName: "Test Bank", ifsc: "TEST0001" },
    signatureUrl: null,
    upiQrDataUrl: null,
    settings: { ...DEFAULT_SETTINGS, ...settingsOverrides },
    ...overrides,
  };
}

describe("14-template rendering engine", () => {
  it("has exactly 14 unique template keys, all category invoice", () => {
    expect(TEMPLATE_DEFINITIONS).toHaveLength(14);
    const keys = new Set(TEMPLATE_DEFINITIONS.map((t) => t.key));
    expect(keys.size).toBe(14);
    expect(TEMPLATE_DEFINITIONS.every((t) => t.category === "invoice")).toBe(true);
  });

  it.each(TEMPLATE_DEFINITIONS.map((t) => t.key))("renders %s without throwing and includes core invoice data", (key) => {
    const def = getTemplateDefinition(key);
    const html = renderInvoiceTemplate(def, buildContext());
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("INV-0001");
    expect(html).toContain("Acme Pvt Ltd");
    expect(html).toContain("Test Seller Co");
  });

  it("does not reproduce any real third-party brand name", () => {
    const forbidden = ["Amazon", "Tata", "Nike", "Flipkart", "Reliance"];
    for (const def of TEMPLATE_DEFINITIONS) {
      const html = renderInvoiceTemplate(def, buildContext());
      for (const brand of forbidden) {
        expect(html).not.toContain(brand);
      }
    }
  });

  it("Landscape template uses landscape @page size", () => {
    const def = getTemplateDefinition("landscape");
    const html = renderInvoiceTemplate(def, buildContext());
    expect(html).toContain("size: 297mm 210mm");
  });

  it("Portrait templates use portrait @page size", () => {
    const def = getTemplateDefinition("modern");
    const html = renderInvoiceTemplate(def, buildContext());
    expect(html).toContain("size: 210mm 297mm");
  });

  it("MRP + Discount template shows an MRP column, others do not", () => {
    const mrpHtml = renderInvoiceTemplate(getTemplateDefinition("mrp_discount"), buildContext());
    const modernHtml = renderInvoiceTemplate(getTemplateDefinition("modern"), buildContext());
    expect(mrpHtml).toContain(">MRP<");
    expect(modernHtml).not.toContain(">MRP<");
  });

  it("Service templates hide the per-line HSN/SAC column", () => {
    const html = renderInvoiceTemplate(getTemplateDefinition("service"), buildContext({}, { showHsnSummary: false }));
    expect(html).not.toContain("HSN/SAC");
  });

  // ── Document Settings toggles actually drive output ─────────────
  it("hideHsn removes the HSN/SAC column from a non-service template", () => {
    const withHsn = renderInvoiceTemplate(getTemplateDefinition("modern"), buildContext({}, { hideHsn: false, showHsnSummary: false }));
    const withoutHsn = renderInvoiceTemplate(getTemplateDefinition("modern"), buildContext({}, { hideHsn: true, showHsnSummary: false }));
    expect(withHsn).toContain("HSN/SAC");
    expect(withoutHsn).not.toContain("HSN/SAC");
  });

  it("hideQuantity removes the Qty header", () => {
    const withQty = renderInvoiceTemplate(getTemplateDefinition("modern"), buildContext({}, { hideQuantity: false }));
    const withoutQty = renderInvoiceTemplate(getTemplateDefinition("modern"), buildContext({}, { hideQuantity: true }));
    expect(withQty).toContain(">Qty<");
    expect(withoutQty).not.toContain(">Qty<");
  });

  it("showDiscountColumn/hideDiscount toggles the Discount column", () => {
    const shown = renderInvoiceTemplate(getTemplateDefinition("modern"), buildContext({}, { showDiscountColumn: true, hideDiscount: false }));
    const hidden = renderInvoiceTemplate(getTemplateDefinition("modern"), buildContext({}, { showDiscountColumn: false }));
    expect(shown).toContain("Discount");
    expect(hidden).not.toContain(">Discount<");
  });

  it("showHsnSummary + showHsnSummaryOn renders the HSN/SAC summary table only when the doc type is included", () => {
    const shown = renderInvoiceTemplate(getTemplateDefinition("modern"), buildContext({}, { showHsnSummary: true, showHsnSummaryOn: ["invoice"] }));
    const hiddenByToggle = renderInvoiceTemplate(getTemplateDefinition("modern"), buildContext({}, { showHsnSummary: false }));
    const hiddenByDocType = renderInvoiceTemplate(getTemplateDefinition("modern"), buildContext({}, { showHsnSummary: true, showHsnSummaryOn: ["purchase"] }));
    expect(shown).toContain("HSN/SAC Summary");
    expect(hiddenByToggle).not.toContain("HSN/SAC Summary");
    expect(hiddenByDocType).not.toContain("HSN/SAC Summary");
  });

  it("showReceiverSignature toggles the signatory block", () => {
    const shown = renderInvoiceTemplate(getTemplateDefinition("modern"), buildContext({}, { showReceiverSignature: true }));
    const hidden = renderInvoiceTemplate(getTemplateDefinition("modern"), buildContext({}, { showReceiverSignature: false }));
    expect(shown).toContain("Authorized Signatory");
    expect(hidden).not.toContain("Authorized Signatory");
  });

  it("showPayments toggles the payments list and bank/QR block", () => {
    const shown = renderInvoiceTemplate(getTemplateDefinition("modern"), buildContext({}, { showPayments: true }));
    const hidden = renderInvoiceTemplate(getTemplateDefinition("modern"), buildContext({}, { showPayments: false }));
    expect(shown).toContain("Bank Details");
    expect(hidden).not.toContain("Bank Details");
  });

  it("accent color from settings is applied, overriding the template default", () => {
    const html = renderInvoiceTemplate(getTemplateDefinition("modern"), buildContext({}, { accentColor: "#123456" }));
    expect(html).toContain("#123456");
  });

  it("watermark and banner URLs are embedded when set", () => {
    const html = renderInvoiceTemplate(
      getTemplateDefinition("modern"),
      buildContext({}, { watermarkUrl: "https://example.com/watermark.png", bannerTopUrl: "https://example.com/banner.png" }),
    );
    expect(html).toContain("https://example.com/watermark.png");
    expect(html).toContain("https://example.com/banner.png");
  });

  it("pdfFooterText is embedded in the footer alongside the digitally-signed line", () => {
    const html = renderInvoiceTemplate(getTemplateDefinition("modern"), buildContext({}, { pdfFooterText: "Custom footer text" }));
    expect(html).toContain("Custom footer text");
    expect(html).toContain("digitally signed document");
  });

  it("respects showStripedRows by shading alternate rows", () => {
    const striped = renderInvoiceTemplate(getTemplateDefinition("modern"), buildContext({}, { showStripedRows: true }));
    expect(striped).toContain("#f9fafb");
  });

  it("margins from settings are applied to the page padding", () => {
    const html = renderInvoiceTemplate(getTemplateDefinition("modern"), buildContext({}, { marginTop: 77, marginLeft: 33 }));
    expect(html).toContain("77px");
    expect(html).toContain("33px");
  });
});
