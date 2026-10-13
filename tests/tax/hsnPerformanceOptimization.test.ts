import { describe, it, expect } from "vitest";
import {
  findHsnSacReference,
  searchHsnSac,
  lookupHsnSac,
  normalizeProductType,
} from "@/lib/tax/hsnData";

describe("Priority 6: HSN/SAC Local In-Memory Index & Performance Optimization", () => {
  it("performs exact code lookup with O(1) codeMap index", () => {
    const item = findHsnSacReference("85285200", "goods");
    expect(item).toBeDefined();
    expect(item?.code).toBe("85285200");
    expect(item?.type).toBe("goods");
    expect(item?.score).toBe(100);
    expect(item?.verificationStatus).toBe("UNRESOLVED");

    const notebook = findHsnSacReference("4820", "goods");
    expect(notebook).toBeDefined();
    expect(notebook?.gstRate).toBe(12);
    expect(notebook?.gstTreatment).toBe("taxable");
  });

  it("filters goods vs services accurately in exact lookup", () => {
    // 998311 is management consulting service
    const serviceItem = findHsnSacReference("998311", "service");
    expect(serviceItem).toBeDefined();
    expect(serviceItem?.type).toBe("service");

    const goodsItem = findHsnSacReference("998311", "goods");
    expect(goodsItem).toBeUndefined();
  });

  it("performs description search with token inverted index and deterministic ranking", () => {
    const results = searchHsnSac("computer monitor", "goods");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].code).toBe("85285200");
    expect(results[0].description.toLowerCase()).toContain("monitor");
  });

  it("handles empty or whitespace-only search queries safely", () => {
    expect(searchHsnSac("")).toEqual([]);
    expect(searchHsnSac("   ")).toEqual([]);
    expect(lookupHsnSac("").selected).toBeNull();
  });

  it("handles unknown/non-existent HSN code safely", () => {
    const missing = findHsnSacReference("0000000000");
    expect(missing).toBeUndefined();
  });

  it("serves repeated lookups deterministically from bounded cache", () => {
    const first = lookupHsnSac("office chair", "goods");
    const second = lookupHsnSac("office chair", "goods");
    expect(first.selected?.code).toBe(second.selected?.code);
    expect(first.confidence).toBe(second.confidence);
    expect(first.reviewRequired).toBe(second.reviewRequired);
  });

  it("normalizes product types accurately", () => {
    expect(normalizeProductType("service")).toBe("service");
    expect(normalizeProductType("services")).toBe("service");
    expect(normalizeProductType("sac")).toBe("service");
    expect(normalizeProductType("goods")).toBe("goods");
    expect(normalizeProductType("consu")).toBe("goods");
    expect(normalizeProductType("unknown_xyz")).toBeUndefined();
  });
});
