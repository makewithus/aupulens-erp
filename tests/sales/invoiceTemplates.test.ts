import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import {
  TEMPLATE_DEFINITIONS,
  ACTIVE_TEMPLATE_DEFINITIONS,
  ACTIVE_TEMPLATE_KEYS,
  getTemplateDefinition,
} from "@/lib/invoiceTemplates/definitions";
import { renderInvoiceTemplate, renderInvoiceTemplateFragment } from "@/lib/invoiceTemplates/render";
import { InvoiceTemplate } from "@/models/InvoiceTemplate";
import { ensureInvoiceTemplatesSeeded } from "@/lib/invoiceTemplates/seed";
import { buildTemplateContext } from "@/lib/invoiceTemplates/context";
import { cleanText, money } from "@/lib/invoiceTemplates/helpers";
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
    company: { name: "Test Seller Co", gstin: "27BBBBB0000B1Z5", state: "Maharashtra", address: "1 Test Lane, Pune" },
    bank: { accountName: "Current A/C", accountNumber: "12345", bankName: "Test Bank", ifsc: "TEST0001" },
    signatureUrl: null,
    upiQrDataUrl: null,
    settings: { ...DEFAULT_SETTINGS, ...settingsOverrides },
    ...overrides,
  };
}

describe("Invoice template catalog — 9 active categories", () => {
  it("keeps all 14 original template definitions in code (dormant ones re-activatable later)", () => {
    expect(TEMPLATE_DEFINITIONS).toHaveLength(14);
    const keys = new Set(TEMPLATE_DEFINITIONS.map((t) => t.key));
    expect(keys.size).toBe(14);
    expect(TEMPLATE_DEFINITIONS.every((t) => t.category === "invoice")).toBe(true);
  });

  it("exposes exactly the 9 specified categories as active", () => {
    expect(ACTIVE_TEMPLATE_KEYS).toHaveLength(9);
    expect(new Set(ACTIVE_TEMPLATE_KEYS)).toEqual(
      new Set(["bill_ship", "classic", "compact", "evergreen", "landscape", "legend", "mrp_discount", "modern", "service"]),
    );
    // The 5 categories deliberately out of scope for now must not be active.
    for (const dormant of ["vintage", "elegant", "elegant_images", "service_2", "genz"]) {
      expect(ACTIVE_TEMPLATE_KEYS).not.toContain(dormant);
      expect(TEMPLATE_DEFINITIONS.find((t) => t.key === dormant)?.active).toBe(false);
    }
  });

  it.each(ACTIVE_TEMPLATE_DEFINITIONS.map((t) => t.key))("renders %s without throwing and includes core invoice + seller + customer data", (key) => {
    const def = getTemplateDefinition(key);
    const html = renderInvoiceTemplate(def, buildContext());
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("INV-0001");
    expect(html).toContain("Acme Pvt Ltd");
    expect(html).toContain("Test Seller Co");
    expect(html).toContain("27BBBBB0000B1Z5"); // seller GSTIN must always be present
    expect(html).toContain("1 Test Lane, Pune"); // seller address must always be present
  });

  it.each(["vintage", "elegant", "elegant_images", "service_2", "genz"])("dormant template %s still renders without throwing (legacy fallback, re-activatable)", (key) => {
    const def = getTemplateDefinition(key);
    const html = renderInvoiceTemplate(def, buildContext());
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("INV-0001");
  });

  it("does not reproduce any real third-party brand name, across every definition", () => {
    const forbidden = ["Amazon", "Tata", "Nike", "Flipkart", "Reliance", "DMart", "Samsung", "Instagram", "Unilever", "ITC"];
    for (const def of TEMPLATE_DEFINITIONS) {
      const html = renderInvoiceTemplate(def, buildContext());
      for (const brand of forbidden) {
        expect(html).not.toContain(brand);
      }
    }
  });

  it("preview fragment is embedded verbatim inside the full PDF document for every active template (preview == PDF)", () => {
    for (const def of ACTIVE_TEMPLATE_DEFINITIONS) {
      const ctx = buildContext();
      const fragment = renderInvoiceTemplateFragment(def, ctx);
      const fullDoc = renderInvoiceTemplate(def, ctx);
      expect(fullDoc).toContain(fragment.trim());
    }
  });

  it("Landscape template uses landscape @page size; other active templates use portrait", () => {
    const landscapeHtml = renderInvoiceTemplate(getTemplateDefinition("landscape"), buildContext());
    expect(landscapeHtml).toContain("size: 297mm 210mm");
    for (const key of ACTIVE_TEMPLATE_KEYS.filter((k) => k !== "landscape")) {
      const html = renderInvoiceTemplate(getTemplateDefinition(key), buildContext());
      expect(html).toContain("size: 210mm 297mm");
    }
  });

  it("MRP + Discount template shows MRP and Selling Price columns, others do not show an MRP column", () => {
    const mrpHtml = renderInvoiceTemplate(getTemplateDefinition("mrp_discount"), buildContext());
    expect(mrpHtml).toContain(">MRP<");
    expect(mrpHtml).toContain("Selling Price");
    expect(mrpHtml).toContain("Amount Payable");
    for (const key of ACTIVE_TEMPLATE_KEYS.filter((k) => k !== "mrp_discount")) {
      expect(renderInvoiceTemplate(getTemplateDefinition(key), buildContext())).not.toContain(">MRP<");
    }
  });

  it("Service template hides the per-line HSN/SAC column entirely", () => {
    const html = renderInvoiceTemplate(getTemplateDefinition("service"), buildContext({}, { showHsnSummary: false }));
    expect(html).not.toContain("HSN/SAC");
  });

  it("Bill To - Ship To template renders all four Bill From/Ship From/Bill To/Ship To blocks", () => {
    const html = renderInvoiceTemplate(getTemplateDefinition("bill_ship"), buildContext());
    expect(html).toContain("Bill From");
    expect(html).toContain("Ship From");
    expect(html).toContain("Bill To");
    expect(html).toContain("Ship To");
  });

  it("Classic and Legend templates render a fully-bordered HSN/SAC summary with rate breakdowns", () => {
    for (const key of ["classic", "legend"]) {
      const html = renderInvoiceTemplate(getTemplateDefinition(key), buildContext());
      expect(html).toContain("HSN/SAC Summary");
      expect(html).toContain("CGST");
      expect(html).toContain("SGST");
    }
  });

  // ── Document Settings toggles actually drive output (Modern as the reference template) ─────────────
  it("hideHsn removes all HSN/SAC references from a non-service template", () => {
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

  it("respects showStripedRows by shading strictly more rows than the unstriped render", () => {
    const notStriped = renderInvoiceTemplate(getTemplateDefinition("modern"), buildContext({}, { showStripedRows: false }));
    const striped = renderInvoiceTemplate(getTemplateDefinition("modern"), buildContext({}, { showStripedRows: true }));
    const count = (html: string) => (html.match(/#f9fafb/g) || []).length;
    expect(count(striped)).toBeGreaterThan(count(notStriped));
  });

  it("margins from settings are applied to the page padding", () => {
    const html = renderInvoiceTemplate(getTemplateDefinition("modern"), buildContext({}, { marginTop: 77, marginLeft: 33 }));
    expect(html).toContain("77px");
    expect(html).toContain("33px");
  });
});

describe("ensureInvoiceTemplatesSeeded — only the 9 active templates are ever seeded", () => {
  beforeAll(async () => {
    await mongoose.connect("mongodb://localhost:27017/aupulens_test_invoice_templates");
    await InvoiceTemplate.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await (InvoiceTemplate as any).deleteMany({});
  });

  it("seeds exactly the 9 active global catalog rows", async () => {
    await ensureInvoiceTemplatesSeeded();
    const rows = await (InvoiceTemplate as any).find({ tenantId: { $exists: false } }).lean();
    expect(rows).toHaveLength(9);
    expect(new Set(rows.map((r: any) => r.key))).toEqual(new Set(ACTIVE_TEMPLATE_KEYS));
  });

  it("removes stale rows for a since-deactivated template key", async () => {
    await (InvoiceTemplate as any).create({ key: "genz", name: "genZ", category: "invoice", isDefault: false });
    await ensureInvoiceTemplatesSeeded();
    const rows = await (InvoiceTemplate as any).find({ tenantId: { $exists: false } }).lean();
    expect(rows.find((r: any) => r.key === "genz")).toBeUndefined();
    expect(rows).toHaveLength(9);
  });

  it("is idempotent", async () => {
    await ensureInvoiceTemplatesSeeded();
    await ensureInvoiceTemplatesSeeded();
    const rows = await (InvoiceTemplate as any).find({ tenantId: { $exists: false } }).lean();
    expect(rows).toHaveLength(9);
  });
});

describe("Layout robustness — messy copy-pasted data, long text, and currency formatting", () => {
  it("cleanText trims, collapses runs of spaces, and collapses blank lines", () => {
    expect(cleanText("  Apex   Global   Corp  ")).toBe("Apex Global Corp");
    expect(cleanText("Line one\n\n\n\nLine two")).toBe("Line one\nLine two");
    expect(cleanText(null)).toBe("");
    expect(cleanText(undefined)).toBe("");
  });

  it("cleanText strips invisible Unicode whitespace copy-paste commonly introduces (NBSP, zero-width space, BOM)", () => {
    const messy = "Coastal Retail​Traders﻿";
    expect(cleanText(messy)).toBe("Coastal Retail Traders");
  });

  it("money() glues the currency symbol to the amount with a non-breaking space, never a plain space", () => {
    const formatted = money(10030);
    expect(formatted).toContain("&nbsp;");
    expect(formatted).not.toMatch(/&#8377; \d/); // a literal space here is exactly the bug that let "₹" wrap onto its own line
  });

  it("buildTemplateContext sanitizes messy copy-pasted invoice/customer/company data end to end", async () => {
    const invoice = {
      number: "INV-TEST",
      invoiceDate: new Date("2026-01-01"),
      dueDate: new Date("2026-01-08"),
      type: "Regular",
      placeOfSupply: "  Maharashtra  ",
      status: "saved",
      notes: "Thanks   for\n\n\n   your business.  ",
      terms: "  Payment due in 15 days.  ",
      roundOff: false,
      lineItems: [
        { qty: 1, unitPrice: 8500, discount: 0, discountMode: "percent", taxRate: 18, hsn: "  84713010  ", name: "  Hardware   Server   Rack Unit  " },
      ],
      customerId: {
        header: { name: "  Coastal   Retail   Traders  " },
        contact_details: { email: "  buyer@example.com  " },
        address_tab: { street: "Ahmedabad", state_name: "Gujarat" },
      },
    };
    const settingsDoc = { display: {}, branding: {} };

    const ctx = await buildTemplateContext({
      invoice,
      settingsDoc,
      company: { name: "  Aupulens   Traders  ", gstin: "27AAAAA0000A1Z5", address: "  Mumbai,   Maharashtra  ", state: "Maharashtra" },
      bank: null,
      signatureUrl: null,
      documentType: "invoice",
    });

    expect(ctx.customer.name).toBe("Coastal Retail Traders");
    expect(ctx.customer.email).toBe("buyer@example.com");
    expect(ctx.company.name).toBe("Aupulens Traders");
    expect(ctx.company.address).toBe("Mumbai, Maharashtra");
    expect(ctx.invoice.notes).toBe("Thanks for\nyour business.");
    expect(ctx.computedLines[0].name).toBe("Hardware Server Rack Unit");
    expect(ctx.computedLines[0].hsn).toBe("84713010");
  });

  it("a long unbroken company name and address never overflow — every text container is wrap-safe", () => {
    const ctx = buildContext({
      company: {
        name: "Superlongwordwithnobreaksatallforcompanyname Manufacturing And Trading Private Limited International Holdings",
        gstin: "27BBBBB0000B1Z5",
        address: "402, ExtremelyLongUnbrokenAddressLineWithNoSpacesWhatsoeverToDeliberatelyTestWrapping, Mumbai 400051",
        state: "Maharashtra",
      },
    });
    for (const def of ACTIVE_TEMPLATE_DEFINITIONS) {
      const html = renderInvoiceTemplate(def, ctx);
      expect(html).toContain("overflow-wrap:break-word");
      expect(html).toContain(ctx.company.name);
    }
  });

  it("amounts in the items table and totals card are never split across lines by a breakable space", () => {
    for (const def of ACTIVE_TEMPLATE_DEFINITIONS) {
      const html = renderInvoiceTemplate(def, buildContext());
      // Every money() call renders "&#8377;&nbsp;"; a bare "&#8377; " (plain
      // space) would mean some call site regressed back to the wrap bug.
      expect(html).not.toMatch(/&#8377; \d/);
    }
  });

  it("many line items paginate safely — no row, and no totals/signature block, can be split across a page", () => {
    const manyLines = Array.from({ length: 40 }, (_, i) => ({
      qty: 1,
      unitPrice: 100 + i,
      discount: 0,
      discountMode: "percent" as const,
      taxRate: 18,
      hsn: "9983",
      name: `Line item ${i + 1}`,
    }));
    const totals = computeInvoiceTotals({ lineItems: manyLines, sellerState: "Maharashtra", placeOfSupply: "Maharashtra", roundOff: true });
    const ctx = buildContext({ computedLines: totals.computedLines, totals, hsnSummary: computeHsnSummary(totals.computedLines, totals.isInterState) });
    for (const def of ACTIVE_TEMPLATE_DEFINITIONS) {
      const html = renderInvoiceTemplate(def, ctx);
      expect(html).toContain("Line item 40");
      expect(html).toContain("page-break-inside:avoid");
      expect(html).toContain("break-inside:avoid");
    }
  });

  it("an address/email/phone containing HTML-special characters never corrupts the markup", () => {
    const ctx = buildContext({ customer: { name: "A & B Corp", billingAddress: "5 <Main> St", email: "a&b@example.com" } });
    const html = renderInvoiceTemplate(getTemplateDefinition("modern"), ctx);
    expect(html).toContain("A &amp; B Corp");
    expect(html).toContain("5 &lt;Main&gt; St");
    expect(html).not.toContain("<Main>");
  });
});
