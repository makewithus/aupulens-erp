import mongoose from "mongoose";

/**
 * AI-11's golden dataset (docs/ai/BRIEF-10-PRE-QA.md P0.6) — realistic, tenant-anonymised
 * fixtures with a KNOWN-CORRECT expected finding-title set per case, following
 * `tests/golden/ai27/goldenCases.ts`'s shape. `tests/golden/ai11.golden.test.ts` seeds each case,
 * runs the real workflow through the real executor, and checks the finding titles produced.
 */

export interface GoldenProductSeed {
  key: string;
  name: string;
  standardPrice: number;
}

export interface GoldenStockSeed {
  productKey: string;
  quantity: number;
  type: "in" | "out";
  reference: string;
  createdAtDaysAgo?: number;
}

export interface GoldenMoveSeed {
  productKey: string;
  qty: number;
  unitCost: number;
  daysAgo: number;
  reference: string;
  moveType?: "incoming" | "outgoing";
}

export interface GoldenCountSeed {
  productKey: string;
  countedQty: number;
  daysAgo: number;
}

export interface GoldenSaleSeed {
  productKey: string;
  quantity: number;
  priceUnit: number;
  daysAgo: number;
  /** Also post the identical sale `monthsAgo` this many additional months back, at the same
   *  price/quantity ratio — needed to satisfy the margin-stability check for a silent case. */
  alsoPriorMonth?: boolean;
}

/** A GL journal entry proving the inventory subledger ties to the books — needed for a
 *  must-stay-silent case (`detectSubledgerGlDifference` otherwise correctly flags the absence of
 *  any matching GL activity as a real, undocumented gap). */
export interface GoldenGlTieOutSeed {
  inventoryValue: number;
}

export interface GoldenCase {
  id: string;
  description: string;
  products: GoldenProductSeed[];
  moves?: GoldenMoveSeed[];
  stock?: GoldenStockSeed[];
  counts?: GoldenCountSeed[];
  sales?: GoldenSaleSeed[];
  glTieOut?: GoldenGlTieOutSeed;
  /** Finding title substrings that MUST appear. Empty = must-stay-silent case (zero findings). */
  mustFire: string[];
}

export const AI11_GOLDEN_CASES: GoldenCase[] = [
  {
    id: "negative-stock-detected",
    description: "A sale posted before its receipt lands the product at negative on-hand quantity — must be flagged with the causing sequence",
    products: [{ key: "widget", name: "Golden Widget", standardPrice: 100 }],
    stock: [
      { productKey: "widget", quantity: -10, type: "out", reference: "SALE-1", createdAtDaysAgo: 2 },
      { productKey: "widget", quantity: 6, type: "in", reference: "RECEIPT-1", createdAtDaysAgo: 1 },
    ],
    mustFire: ["Negative stock: Golden Widget"],
  },
  {
    id: "count-variance-at-wac",
    description: "A physical count undershoots the system quantity by 5 units — must be valued at the tenant's own weighted-average cost (50), never the standard_price (999, deliberately far off)",
    products: [{ key: "gadget", name: "Golden Gadget", standardPrice: 999 }],
    moves: [
      { productKey: "gadget", qty: 10, unitCost: 40, daysAgo: 20, reference: "MOVE-A" },
      { productKey: "gadget", qty: 10, unitCost: 60, daysAgo: 19, reference: "MOVE-B" },
    ],
    stock: [{ productKey: "gadget", quantity: 20, type: "in", reference: "RECEIPT-A" }],
    counts: [{ productKey: "gadget", countedQty: 15, daysAgo: 10 }],
    mustFire: ["Count variance: Golden Gadget"],
  },
  {
    id: "healthy-inventory-silent",
    description: "Positive stock, count matches system quantity exactly, no sales at a loss — must raise zero findings across all four AI-11 detectors",
    products: [{ key: "steady", name: "Golden Steady Item", standardPrice: 50 }],
    moves: [{ productKey: "steady", qty: 20, unitCost: 50, daysAgo: 15, reference: "MOVE-HEALTHY" }],
    stock: [{ productKey: "steady", quantity: 20, type: "in", reference: "RECEIPT-HEALTHY" }],
    counts: [{ productKey: "steady", countedQty: 20, daysAgo: 5 }],
    sales: [{ productKey: "steady", quantity: 2, priceUnit: 80, daysAgo: 3, alsoPriorMonth: true }],
    glTieOut: { inventoryValue: 1000 }, // 20 units * unitCost 50
    mustFire: [],
  },
  {
    id: "valuation-anomaly-stale-standard-price",
    description: "A product with a real cost history (WAC) priced consistently at a stale standard_price with no receipts to justify it — must be flagged as a valuation anomaly, never silently reported as healthy",
    products: [{ key: "stale", name: "Golden Stale-Cost Item", standardPrice: 10 }],
    moves: [{ productKey: "stale", qty: 5, unitCost: 500, daysAgo: 25, reference: "MOVE-STALE" }],
    stock: [{ productKey: "stale", quantity: 5, type: "in", reference: "RECEIPT-STALE" }],
    mustFire: ["Valuation anomaly: Golden Stale-Cost Item"],
  },
];

export const GOLDEN_TENANT_PREFIX = "ai11-golden";
export const GOLDEN_CREATOR = new mongoose.Types.ObjectId();
