import { describe, it, expect } from "vitest";
import { computeInvoiceTotals, computeHsnSummary, computeLine } from "@/lib/sales/invoiceMath";
import { splitGst } from "@/lib/accounting/gst";

describe("AUP-014: GST Precision & Odd-Paise Split Integrity", () => {
  describe("splitGst", () => {
    it("allocates odd single paisa (₹0.01) without losing or gaining paise", () => {
      const split = splitGst(0.01, "Maharashtra", "Maharashtra");
      expect(split.cgst + split.sgst).toBe(0.01);
      expect(split.igst).toBe(0);
      expect(split.cgst).toBe(0.01);
      expect(split.sgst).toBe(0.0);
    });

    it("splits odd paise (₹10.05) such that cgst + sgst === 10.05 exactly", () => {
      const split = splitGst(10.05, "Delhi", "Delhi");
      expect(split.cgst + split.sgst).toBe(10.05);
      expect(split.igst).toBe(0);
      expect(split.cgst).toBe(5.03);
      expect(split.sgst).toBe(5.02);
    });

    it("splits ₹99.99 intra-state exactly to 99.99 with no 1-paisa drift", () => {
      const split = splitGst(99.99, "Karnataka", "Karnataka");
      expect(Number((split.cgst + split.sgst).toFixed(2))).toBe(99.99);
      expect(split.igst).toBe(0);
      expect(split.cgst).toBe(50.0);
      expect(split.sgst).toBe(49.99);
    });

    it("allocates inter-state entirely to IGST without splitting", () => {
      const split = splitGst(99.99, "Maharashtra", "Karnataka");
      expect(split.igst).toBe(99.99);
      expect(split.cgst).toBe(0);
      expect(split.sgst).toBe(0);
    });
  });

  describe("computeInvoiceTotals & computeHsnSummary", () => {
    it("guarantees cgst + sgst === totalTax for intra-state invoice with odd paise totals", () => {
      // 1 item with taxable 55.83 at 18% tax => tax = 10.0494 => rounds to 10.05
      const totals = computeInvoiceTotals({
        lineItems: [
          {
            qty: 1,
            unitPrice: 55.83,
            discount: 0,
            discountMode: "percent",
            taxRate: 18,
            hsn: "8471",
          },
        ],
        sellerState: "Maharashtra",
        placeOfSupply: "Maharashtra",
      });

      expect(totals.totalTax).toBe(10.05);
      expect(totals.cgst + totals.sgst).toBe(totals.totalTax);
      expect(totals.igst).toBe(0);

      const hsnRows = computeHsnSummary(totals.computedLines, totals.isInterState);
      expect(hsnRows.length).toBe(1);
      expect(hsnRows[0].totalTax).toBe(10.05);
      expect(hsnRows[0].cgstAmount + hsnRows[0].sgstAmount).toBe(hsnRows[0].totalTax);
      expect(hsnRows[0].igstAmount).toBe(0);
    });

    it("guarantees cgst + sgst === totalTax across multiple lines with odd rates and discounts", () => {
      const totals = computeInvoiceTotals({
        lineItems: [
          {
            qty: 3,
            unitPrice: 33.33,
            discount: 5,
            discountMode: "percent",
            taxRate: 5,
            hsn: "1001",
          },
          {
            qty: 7,
            unitPrice: 19.99,
            discount: 10,
            discountMode: "percent",
            taxRate: 12,
            hsn: "2002",
          },
        ],
        sellerState: "Tamil Nadu",
        placeOfSupply: "Tamil Nadu",
      });

      expect(totals.cgst + totals.sgst).toBe(totals.totalTax);
      expect(totals.igst).toBe(0);

      const hsnRows = computeHsnSummary(totals.computedLines, totals.isInterState);
      for (const row of hsnRows) {
        expect(row.cgstAmount + row.sgstAmount).toBe(row.totalTax);
      }
    });

    it("handles inter-state correctly with zero CGST/SGST", () => {
      const totals = computeInvoiceTotals({
        lineItems: [
          {
            qty: 2,
            unitPrice: 123.45,
            discount: 0,
            discountMode: "percent",
            taxRate: 18,
            hsn: "9983",
          },
        ],
        sellerState: "Delhi",
        placeOfSupply: "Haryana",
      });

      expect(totals.isInterState).toBe(true);
      expect(totals.cgst).toBe(0);
      expect(totals.sgst).toBe(0);
      expect(totals.igst).toBe(totals.totalTax);

      const hsnRows = computeHsnSummary(totals.computedLines, totals.isInterState);
      expect(hsnRows[0].cgstAmount).toBe(0);
      expect(hsnRows[0].sgstAmount).toBe(0);
      expect(hsnRows[0].igstAmount).toBe(hsnRows[0].totalTax);
    });
  });
});
