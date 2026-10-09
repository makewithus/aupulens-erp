import { describe, expect, it } from "vitest";
import { findHsnSacReference, lookupHsnSac, normalizeProductType, searchHsnSac } from "@/lib/tax/hsnData";

describe("HSN/SAC reference lookup", () => {
  it("keeps goods searches in HSN reference records", () => {
    const result = lookupHsnSac("Hard-cover ruled notebook for writing, 200 pages", "goods");
    expect(result.selected?.type).toBe("goods");
    expect(result.selected?.code).toBe("4820");
    expect(result.selected?.gstRate).toBe(0);
    expect(findHsnSacReference(result.selected!.code, "goods")?.gstTreatment).toBe("nil");
  });

  it("keeps service searches in SAC reference records", () => {
    const result = lookupHsnSac("Accounting consultancy service", "service");
    expect(result.selected?.type).toBe("service");
    expect(result.selected?.code).toBe("998222");
    expect(result.selected?.gstRate).toBe(18);
  });

  it("suggests real-world chair HSN and GST rate from product description", () => {
    const result = lookupHsnSac("Ergonomic leather executive chair with adjustable armrests and lumbar support", "goods");
    expect(result.selected?.type).toBe("goods");
    expect(result.selected?.code).toBe("9401");
    expect(result.selected?.gstRate).toBe(18);
  });

  it("does not mix services into goods results", () => {
    const goods = searchHsnSac("Accounting consultancy service", "goods");
    expect(goods.every((row) => row.type === "goods")).toBe(true);
  });

  it("marks close candidate sets for review instead of pretending certainty", () => {
    const result = lookupHsnSac("paper stationery", "goods");
    expect(result.candidates.length).toBeGreaterThan(1);
    expect(result.reviewRequired).toBe(true);
    expect(result.confidence).not.toBe("high");
  });

  it("normalizes product type aliases used by the product form", () => {
    expect(normalizeProductType("service")).toBe("service");
    expect(normalizeProductType("consu")).toBe("goods");
    expect(normalizeProductType("nonsense")).toBeUndefined();
  });
});
