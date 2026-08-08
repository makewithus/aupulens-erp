/**
 * Pure-logic tests for Document Intelligence: extraction coercion/parsing (the
 * layer that turns messy model JSON into a clean, typed bill) and duplicate
 * detection. The LLM call and DB writes are covered by live verification.
 */

import { describe, it, expect } from "vitest";
import { coerceVendorBill, parseExtraction, DOC_INTEL_TYPE } from "@/lib/docIntel/extractionSchemas";
import { findDuplicates, type ExistingBill } from "@/lib/docIntel/duplicateCheck";

describe("coerceVendorBill", () => {
  it("normalizes strings/numbers and computes missing totals", () => {
    const out = coerceVendorBill({
      vendor: "Zephyr Traders",
      gstin: "27abcde1234f1z5",
      invoiceNumber: "BILL-99",
      lineItems: [
        { item: "Widget", quantity: "2", rate: "100", total: "200" },
        { description: "Bolt", quantity: 3, unitPrice: 10 }, // amount computed
      ],
      tax: "38",
    });
    expect(out.vendorName).toBe("Zephyr Traders");
    expect(out.vendorGstin).toBe("27ABCDE1234F1Z5"); // upper-cased
    expect(out.billNumber).toBe("BILL-99");
    expect(out.lineItems).toHaveLength(2);
    expect(out.lineItems[1].amount).toBe(30); // 3 * 10 computed
    expect(out.taxAmount).toBe(38);
    // total falls back to subtotal+tax or lines sum
    expect(out.totalAmount).toBeGreaterThan(0);
  });

  it("strips currency symbols/commas from amounts", () => {
    const out = coerceVendorBill({ vendorName: "X", totalAmount: "₹1,23,456.50" });
    expect(out.totalAmount).toBeCloseTo(123456.5);
  });

  it("clamps confidence to 0-100", () => {
    expect(coerceVendorBill({ confidence: 250 }).confidence).toBe(100);
    expect(coerceVendorBill({ confidence: -5 }).confidence).toBe(0);
  });

  it("drops empty line rows", () => {
    const out = coerceVendorBill({ lineItems: [{}, { description: "Real", amount: 5 }] });
    expect(out.lineItems).toHaveLength(1);
  });
});

describe("parseExtraction", () => {
  it("extracts a JSON object embedded in prose/fences", () => {
    const raw = 'Here you go:\n```json\n{"vendorName":"Acme","totalAmount":500}\n```';
    const out = parseExtraction(DOC_INTEL_TYPE.VENDOR_BILL, raw);
    expect(out.vendorName).toBe("Acme");
    expect(out.totalAmount).toBe(500);
  });
  it("throws when there is no JSON", () => {
    expect(() => parseExtraction(DOC_INTEL_TYPE.VENDOR_BILL, "no json here")).toThrow();
  });
});

describe("findDuplicates", () => {
  const existing: ExistingBill[] = [
    { id: "a", vendorName: "Zephyr Traders", billNumber: "BILL-99", totalAmount: 238 },
    { id: "b", vendorName: "Nimbus Corp", billNumber: "N-1", totalAmount: 1000 },
  ];

  it("flags same vendor + same bill number", () => {
    const m = findDuplicates({ vendorName: "zephyr traders", billNumber: "bill-99", totalAmount: 238 }, existing);
    expect(m.map((x) => x.id)).toContain("a");
  });

  it("flags same vendor + same total (±1) when number differs", () => {
    const m = findDuplicates({ vendorName: "Nimbus Corp", billNumber: "DIFFERENT", totalAmount: 1000.5 }, existing);
    expect(m.map((x) => x.id)).toContain("b");
  });

  it("does not flag a genuinely new bill", () => {
    const m = findDuplicates({ vendorName: "Orion Ltd", billNumber: "O-1", totalAmount: 42 }, existing);
    expect(m).toHaveLength(0);
  });
});
