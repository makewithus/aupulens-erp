import { describe, expect, it } from "vitest";
import { comparePurchaseLineTax } from "@/lib/tax/purchaseTaxCompare";

const product = {
  tab_general_information: {
    hsnSacCode: "4820",
    gstRate: 18,
    gstTreatment: "taxable",
  },
};

describe("purchase tax comparison", () => {
  it("flags supplier HSN/GST mismatches without changing product values", () => {
    const result = comparePurchaseLineTax(
      { hsnSacCode: "4819", taxRate: 12, gstTreatment: "taxable" },
      product,
    );

    expect(result.status).toBe("mismatch");
    expect(result.differences).toEqual(["HSN/SAC", "GST rate"]);
    expect(result.product?.hsnSacCode).toBe("4820");
    expect(result.supplier?.hsnSacCode).toBe("4819");
  });

  it("returns matched when supplier line agrees with product master", () => {
    const result = comparePurchaseLineTax(
      { hsnSacCode: "4820", taxRate: 18, gstTreatment: "taxable" },
      product,
    );

    expect(result.status).toBe("matched");
    expect(result.differences).toEqual([]);
  });

  it("captures missing supplier HSN as a reviewable mismatch when product has one", () => {
    const result = comparePurchaseLineTax(
      { taxRate: 18, gstTreatment: "taxable" },
      product,
    );

    expect(result.status).toBe("mismatch");
    expect(result.differences).toEqual(["HSN/SAC"]);
    expect(result.supplier?.hsnSacCode).toBeUndefined();
    expect(result.product?.hsnSacCode).toBe("4820");
  });
});
