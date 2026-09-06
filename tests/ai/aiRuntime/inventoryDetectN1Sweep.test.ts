import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Chunk 10a addendum, Part 0.1 — structural regression guards for the N+1 fixes in
 * `lib/aiRuntime/inventory/detect.ts` (docs/ai/BRIEF-10-PRE-QA.md P0.3, docs/ai/verification/
 * AI-11.md §9). Retroactive audit found that the EXISTING timing-based tests for these fixes do
 * not actually discriminate fixed-vs-reverted code at the scale/fixture shape they run with on
 * this shared dev box (confirmed by reverting each fix in turn and re-running: all of them still
 * passed comfortably against a real 1,500-10,000-row fixture with no invoice/count load).
 * `computeMarginByProduct` is the one exception — its own dedicated stress test in
 * `ai11WorkflowEdgeCases.test.ts` genuinely discriminates because it seeds real invoice volume.
 *
 * These structural checks are the honest, deterministic guard for the other three: they fail
 * immediately if a future edit reintroduces a per-item database call inside a loop, regardless of
 * what any timing assertion happens to show on a given run of this dev box.
 */

const DETECT_PATH = path.join(__dirname, "..", "..", "..", "lib", "aiRuntime", "inventory", "detect.ts");

function functionBody(source: string, fnName: string): string {
  const start = source.indexOf(`export async function ${fnName}(`);
  expect(start, `${fnName} must still exist under this exact name in detect.ts`).toBeGreaterThan(-1);
  const nextExport = source.indexOf("\nexport ", start + 1);
  return nextExport === -1 ? source.slice(start) : source.slice(start, nextExport);
}

describe("lib/aiRuntime/inventory/detect.ts — N+1 regression sweep (Chunk 10a, P0.3)", () => {
  const source = fs.readFileSync(DETECT_PATH, "utf-8");

  it("detectNegativeStock: fetches every Stock row for the tenant in ONE query, never one Stock.find() per product", () => {
    const body = functionBody(source, "detectNegativeStock");
    // The old shape: `Stock.distinct("product", ...)` then a loop with `Stock.find({..., product:` inside.
    expect(body, "detectNegativeStock must not re-discover products via Stock.distinct then loop — that is the exact reverted N+1 shape").not.toContain('Stock.distinct("product"');
    expect(body).toContain("Stock.find({ tenantId }");
  });

  it("detectCountVariances: resolves system quantity, weighted-average cost, and product names for the WHOLE counted set in bulk, never per counted product", () => {
    const body = functionBody(source, "detectCountVariances");
    // The fixed shape batches via Promise.all with an aggregate + a bulk WAC computation + a bulk Product.find, all keyed by the counted set.
    expect(body).toContain("Promise.all([");
    expect(body).toContain("Stock.aggregate([");
    expect(body).toContain("computeWeightedAverageCostBulk");
    expect(body).toContain("Product.find({ tenantId, _id: { $in:");
    // The old per-item shape called Stock.aggregate() and computeWeightedAverageCost() (singular,
    // not Bulk) INSIDE the loop over `counts` — confirm no bare (non-Bulk) WAC call remains here.
    expect(body.replace(/computeWeightedAverageCostBulk/g, "")).not.toContain("computeWeightedAverageCost(tenantId, productId)");
  });

  it("detectSlowMoving: resolves every product's latest movement in ONE aggregation, never one Stock.findOne()/Product.findOne() pair per product", () => {
    const body = functionBody(source, "detectSlowMoving");
    expect(body, "detectSlowMoving must not loop over productIds calling Stock.findOne per iteration — that is the exact reverted N+1 shape").not.toMatch(/for\s*\(const productId of productIds\)\s*\{\s*const latest = await Stock\.findOne/);
    expect(body).toContain("Stock.aggregate([");
    expect(body).toContain('{ $group: { _id: "$product", latestCreatedAt:');
  });

  it("computeMarginByProduct: resolves revenue/units for EVERY product in exactly 2 bulk aggregations (current + prior period), never one Invoice.find() per product per period", () => {
    const body = functionBody(source, "computeMarginByProduct");
    expect(body, "computeMarginByProduct must not call marginForPeriod() per product — that function used to re-scan the whole period's invoices per call, the worst of AI-11's four N+1s").not.toContain("marginForPeriod(tenantId, productId");
    expect(body).toContain("revenueAndUnitsByProduct(tenantId, curStart, curEnd)");
    expect(body).toContain("revenueAndUnitsByProduct(tenantId, priorStart, priorEnd)");
    expect(body).toContain("Promise.all([");

    const revenueFnStart = source.indexOf("async function revenueAndUnitsByProduct(");
    expect(revenueFnStart, "revenueAndUnitsByProduct helper must exist").toBeGreaterThan(-1);
    const revenueFnBody = source.slice(revenueFnStart, revenueFnStart + 600);
    expect(revenueFnBody).toContain("Invoice.aggregate([");
    expect(revenueFnBody).toContain("$unwind: \"$invoiceLines\"");
  });
});
