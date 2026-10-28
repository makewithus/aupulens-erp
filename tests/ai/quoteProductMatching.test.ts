import { describe, expect, it } from "vitest";
import { mergeQuoteProductCandidates } from "@/lib/ai/quoteDraft";

describe("quote product candidate search", () => {
  it("keeps better prefix matches when the phrase regex finds a different word order", () => {
    const phraseMatch = { _id: "office", header: { name: "Office Ergonomic Chair" } };
    const prefixMatch = { _id: "ergonomic", header: { name: "Ergonomic Office Chair" } };

    const candidates = mergeQuoteProductCandidates([phraseMatch], [phraseMatch, prefixMatch]);

    expect(candidates.map((product) => product.header.name)).toEqual([
      "Office Ergonomic Chair",
      "Ergonomic Office Chair",
    ]);
    expect(candidates).toHaveLength(2);
  });
});
