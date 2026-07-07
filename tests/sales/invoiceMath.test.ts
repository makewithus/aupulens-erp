import { describe, expect, it } from "vitest";
import { computeLine, computeInvoiceTotals, computeHsnSummary, numberToWords } from "@/lib/sales/invoiceMath";

describe("computeLine", () => {
  it("computes gross, discount, taxable value, and tax amount for a percent discount", () => {
    const line = computeLine({ qty: 2, unitPrice: 100, discount: 10, discountMode: "percent", taxRate: 18 });
    expect(line.gross).toBe(200);
    expect(line.lineDiscountAmount).toBe(20);
    expect(line.taxableValue).toBe(180);
    expect(line.taxAmount).toBeCloseTo(32.4);
    expect(line.lineTotal).toBeCloseTo(212.4);
  });

  it("computes a flat amount discount", () => {
    const line = computeLine({ qty: 1, unitPrice: 500, discount: 50, discountMode: "amount", taxRate: 0 });
    expect(line.taxableValue).toBe(450);
    expect(line.lineTotal).toBe(450);
  });

  it("clamps a flat discount so it cannot exceed the line's gross", () => {
    const line = computeLine({ qty: 1, unitPrice: 100, discount: 500, discountMode: "amount", taxRate: 0 });
    expect(line.taxableValue).toBe(0);
  });

  it("applies an additional item-level discount percent on top of the line discount", () => {
    const line = computeLine({ qty: 1, unitPrice: 100, discount: 0, discountMode: "percent", taxRate: 0 }, 10);
    expect(line.taxableValue).toBe(90);
    expect(line.lineDiscountAmount).toBe(10);
  });
});

describe("computeInvoiceTotals", () => {
  const baseLines = [
    { qty: 1, unitPrice: 1000, discount: 0, discountMode: "percent" as const, taxRate: 18, hsn: "9983" },
    { qty: 2, unitPrice: 200, discount: 0, discountMode: "percent" as const, taxRate: 12, hsn: "8471" },
  ];

  it("splits tax into CGST+SGST for an intra-state invoice", () => {
    const totals = computeInvoiceTotals({ lineItems: baseLines, sellerState: "Maharashtra", placeOfSupply: "Maharashtra" });
    expect(totals.isInterState).toBe(false);
    expect(totals.igst).toBe(0);
    expect(totals.cgst).toBeGreaterThan(0);
    expect(totals.sgst).toBe(totals.cgst);
    expect(totals.gstBreakup.map((g) => g.label)).toEqual(["CGST", "SGST"]);
  });

  it("charges IGST only for an inter-state invoice", () => {
    const totals = computeInvoiceTotals({ lineItems: baseLines, sellerState: "Maharashtra", placeOfSupply: "Karnataka" });
    expect(totals.isInterState).toBe(true);
    expect(totals.cgst).toBe(0);
    expect(totals.sgst).toBe(0);
    expect(totals.igst).toBeGreaterThan(0);
    expect(totals.gstBreakup.map((g) => g.label)).toEqual(["IGST"]);
  });

  it("treats state comparison as case/whitespace insensitive", () => {
    const totals = computeInvoiceTotals({ lineItems: baseLines, sellerState: " maharashtra ", placeOfSupply: "Maharashtra" });
    expect(totals.isInterState).toBe(false);
  });

  it("applies an extra discount (amount mode) before computing tax", () => {
    const withDiscount = computeInvoiceTotals({ lineItems: baseLines, extraDiscount: 100, extraDiscountMode: "amount" });
    const without = computeInvoiceTotals({ lineItems: baseLines });
    expect(withDiscount.taxableAmount).toBeLessThan(without.taxableAmount);
    expect(withDiscount.extraDiscountAmount).toBe(100);
  });

  it("applies an extra discount (percent mode) proportionally", () => {
    const totals = computeInvoiceTotals({ lineItems: baseLines, extraDiscount: 10, extraDiscountMode: "percent" });
    expect(totals.extraDiscountAmount).toBeCloseTo(1400 * 0.1);
  });

  it("adds taxable additional charges into the taxable amount and non-taxable ones only into the total", () => {
    const totals = computeInvoiceTotals({
      lineItems: baseLines,
      additionalCharges: [{ name: "Shipping", amount: 100, isTaxable: false }],
    });
    expect(totals.additionalChargesTotal).toBe(100);
    expect(totals.taxableAmount).toBe(1400 + 100);
  });

  it("rounds off the total only when roundOff is true", () => {
    const rounded = computeInvoiceTotals({ lineItems: [{ qty: 1, unitPrice: 100.4, discount: 0, discountMode: "percent", taxRate: 0 }], roundOff: true });
    const notRounded = computeInvoiceTotals({ lineItems: [{ qty: 1, unitPrice: 100.4, discount: 0, discountMode: "percent", taxRate: 0 }], roundOff: false });
    expect(Number.isInteger(rounded.totalAmount)).toBe(true);
    expect(notRounded.totalAmount).toBeCloseTo(100.4);
  });

  it("subtracts TDS and adds TCS on top of the taxable+tax amount", () => {
    const totals = computeInvoiceTotals({ lineItems: [{ qty: 1, unitPrice: 1000, discount: 0, discountMode: "percent", taxRate: 0 }], tdsRate: 10, tcsRate: 1 });
    expect(totals.tdsAmount).toBeCloseTo(100);
    expect(totals.tcsAmount).toBeCloseTo(10);
    expect(totals.totalAmount).toBeCloseTo(1000 - 100 + 10);
  });

  it("applies TCS at a fractional rate like 0.1% (TCS 206C(1H))", () => {
    const totals = computeInvoiceTotals({ lineItems: [{ qty: 1, unitPrice: 100000, discount: 0, discountMode: "percent", taxRate: 0 }], tcsRate: 0.1 });
    expect(totals.tcsAmount).toBeCloseTo(100);
  });

  // Regression coverage for the quote->invoice discount-corruption bug
  // (Bug 1): a 10% line discount, a flat ₹ document discount, and a 10%
  // document discount must each stay in their own unit end to end, and must
  // combine correctly with TDS/TCS — this is the exact math both the quote
  // and invoice sides now share via computeInvoiceTotals.
  it("keeps a 10% line discount as a percentage, not a flat amount", () => {
    const totals = computeInvoiceTotals({ lineItems: [{ qty: 2, unitPrice: 500, discount: 10, discountMode: "percent", taxRate: 0 }] });
    expect(totals.totalDiscount).toBe(100); // 10% of 1000, not a flat 10
    expect(totals.taxableAmount).toBe(900);
  });

  it("keeps a flat ₹ document-level discount flat regardless of subtotal", () => {
    const totals = computeInvoiceTotals({ lineItems: [{ qty: 1, unitPrice: 5000, discount: 0, discountMode: "percent", taxRate: 0 }], extraDiscount: 500, extraDiscountMode: "amount" });
    expect(totals.extraDiscountAmount).toBe(500);
    expect(totals.taxableAmount).toBe(4500);
  });

  it("combines a 10% document discount with TDS 10% and TCS 0.1%", () => {
    const totals = computeInvoiceTotals({
      lineItems: [{ qty: 1, unitPrice: 10000, discount: 0, discountMode: "percent", taxRate: 0 }],
      extraDiscount: 10,
      extraDiscountMode: "percent",
      tdsRate: 10,
      tcsRate: 0.1,
    });
    expect(totals.taxableAmount).toBe(9000); // 10000 - 10%
    expect(totals.tdsAmount).toBeCloseTo(900); // 10% of 9000
    expect(totals.tcsAmount).toBeCloseTo(9); // 0.1% of 9000
    expect(totals.totalAmount).toBeCloseTo(9000 - 900 + 9);
  });
});

describe("computeHsnSummary", () => {
  it("groups computed lines by HSN and sums taxable/tax amounts", () => {
    const totals = computeInvoiceTotals({
      lineItems: [
        { qty: 1, unitPrice: 100, discount: 0, discountMode: "percent", taxRate: 18, hsn: "1111" },
        { qty: 1, unitPrice: 200, discount: 0, discountMode: "percent", taxRate: 18, hsn: "1111" },
        { qty: 1, unitPrice: 50, discount: 0, discountMode: "percent", taxRate: 12, hsn: "2222" },
      ],
    });
    const summary = computeHsnSummary(totals.computedLines, false);
    expect(summary).toHaveLength(2);
    const row1111 = summary.find((r) => r.hsn === "1111")!;
    expect(row1111.taxableValue).toBe(300);
    expect(row1111.cgstAmount + row1111.sgstAmount).toBeCloseTo(54);
  });

  it("puts the full tax into igstAmount for inter-state summaries", () => {
    const totals = computeInvoiceTotals({ lineItems: [{ qty: 1, unitPrice: 100, discount: 0, discountMode: "percent", taxRate: 18, hsn: "1111" }] });
    const summary = computeHsnSummary(totals.computedLines, true);
    expect(summary[0].igstAmount).toBeCloseTo(18);
    expect(summary[0].cgstAmount).toBe(0);
  });
});

describe("numberToWords", () => {
  it("converts small amounts", () => {
    expect(numberToWords(0)).toBe("Zero Rupees Only");
    expect(numberToWords(5)).toBe("Five Rupees Only");
    expect(numberToWords(19)).toBe("Nineteen Rupees Only");
  });

  it("converts amounts with paise", () => {
    expect(numberToWords(100.5)).toBe("One Hundred Rupees and Fifty Paise Only");
  });

  it("converts thousands, lakhs, and crores using the Indian numbering system", () => {
    expect(numberToWords(1234)).toBe("One Thousand Two Hundred Thirty Four Rupees Only");
    expect(numberToWords(123456)).toBe("One Lakh Twenty Three Thousand Four Hundred Fifty Six Rupees Only");
    expect(numberToWords(12345678)).toBe("One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Rupees Only");
  });
});
